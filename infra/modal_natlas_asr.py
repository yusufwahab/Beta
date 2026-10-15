"""Beta's official NCAIR ASR. Deploy: python -m modal deploy infra/modal_natlas_asr.py."""
import asyncio
import hmac
import os
from collections import OrderedDict

import modal

APP_NAME = "beta-natlas-asr"
MODELS = {
    "en": "NCAIR1/NigerianAccentedEnglish",
    "yo": "NCAIR1/Yoruba-ASR",
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
}
MAX_BYTES = 8 * 1024 * 1024
CACHE = "/hf-cache"
app = modal.App(APP_NAME)
cache = modal.Volume.from_name("beta-natlas-model-cache", create_if_missing=True)
hf_secret = modal.Secret.from_name("huggingface-secret")
api_secret = modal.Secret.from_name("beta-natlas-api-secret")
web_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi>=0.115,<1", "python-multipart>=0.0.20,<1", "httpx>=0.28,<1"
)
image = (
    web_image.apt_install("ffmpeg", "libsndfile1")
    .pip_install("torch==2.8.0", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "transformers==4.57.6", "accelerate>=1,<2",
        "huggingface_hub>=0.34,<1", "soundfile>=0.13,<1", "numpy>=1.26,<3",
    )
    .env({"HF_HOME": CACHE, "HF_HUB_CACHE": f"{CACHE}/hub", "TOKENIZERS_PARALLELISM": "false"})
)


def download_model(language):
    from huggingface_hub import HfApi, snapshot_download

    token = os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError("huggingface-secret must contain HF_TOKEN")
    repo = MODELS[language]
    info = HfApi(token=token).model_info(repo, files_metadata=False)
    files = [item.rfilename for item in info.siblings]
    weights = "*.safetensors" if any(p.endswith(".safetensors") for p in files) else "pytorch_model*.bin"
    try:
        path = snapshot_download(repo, revision=info.sha, token=token,
                                 allow_patterns=["*.json", "*.txt", "*.model", weights])
    finally:
        cache.commit()
    return path, info.sha


@app.function(image=image, volumes={CACHE: cache}, secrets=[hf_secret, api_secret], timeout=1200)
def prepare_models(languages: str = "en,yo,ha,ig"):
    """Validate secrets/access and populate the shared cache on CPU."""
    if not os.environ.get("BETA_NATLAS_API_KEY"):
        raise RuntimeError("beta-natlas-api-secret must contain BETA_NATLAS_API_KEY")
    result = []
    for language in languages.split(","):
        _, revision = download_model(language)
        result.append({"language": language, "model": MODELS[language], "revision": revision})
    return result


@app.cls(image=image, volumes={CACHE: cache}, secrets=[hf_secret],
         cpu=4, memory=8192, min_containers=0, max_containers=1, scaledown_window=60, timeout=130,
         startup_timeout=300)
class Recognizer:
    @modal.enter()
    def setup(self):
        import time
        setup_started = time.perf_counter()
        import threading
        import torch
        torch.set_num_threads(4)
        self.models = OrderedDict()
        self.lock = threading.Lock()
        self.container_setup_ms = round((time.perf_counter() - setup_started) * 1000)

    @modal.method()
    def transcribe(self, audio: bytes, language: str):
        import subprocess
        import time
        started = time.perf_counter()
        import numpy as np
        import torch
        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

        def error(status, message):
            return {"_status": status, "detail": message}

        if language not in MODELS:
            return error(422, "Unsupported language")
        if not audio:
            return error(400, "Audio is empty")
        if len(audio) > MAX_BYTES:
            return error(413, "Audio exceeds 8 MiB")
        # Limit decoded output too: highly compressed inputs cannot exhaust memory.
        try:
            decoded = subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "pipe",
                 "-threads", "1", "-i", "pipe:0", "-t", "30.1",
                 "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
                input=audio, capture_output=True, timeout=20, check=True,
            )
            samples = np.frombuffer(decoded.stdout, dtype="<f4").copy()
        except subprocess.TimeoutExpired:
            return error(408, "Audio decoding timed out")
        except (subprocess.CalledProcessError, ValueError):
            return error(422, "Audio is corrupted or cannot be decoded")
        if not samples.size or not np.isfinite(samples).all():
            return error(422, "Audio contains no valid samples")
        if samples.size > 30 * 16000:
            return error(413, "Recordings must be at most 30 seconds")
        if float(np.max(np.abs(samples))) < 0.00001:
            return error(422, "Audio is silent")
        with self.lock:
            model_started = time.perf_counter()
            model_loaded = language in self.models
            if language not in self.models:
                # Keep at most two requested models in this CPU container, never eagerly load all four.
                if len(self.models) >= 2:
                    self.models.popitem(last=False)
                    import gc
                    gc.collect()
                try:
                    path, _ = download_model(language)
                except Exception:
                    print(f"Model cache/download failed for {MODELS[language]}")
                    return error(503, "Requested model is temporarily unavailable")
                try:
                    processor = AutoProcessor.from_pretrained(path, local_files_only=True)
                    model = AutoModelForSpeechSeq2Seq.from_pretrained(
                        path, local_files_only=True, torch_dtype=torch.float32,
                        low_cpu_mem_usage=True,
                    ).to("cpu").eval()
                    self.models[language] = (processor, model)
                except Exception:
                    print(f"Model loading failed for {MODELS[language]}")
                    return error(503, "Requested model could not be loaded")
            model_ms = round((time.perf_counter() - model_started) * 1000)
            processor, model = self.models[language]
            self.models.move_to_end(language)
            try:
                inputs = processor(samples, sampling_rate=16000, return_tensors="pt", return_attention_mask=True)
                features = inputs.input_features.to("cpu", dtype=torch.float32)
                kwargs = {"max_new_tokens": 225}
                if "attention_mask" in inputs:
                    kwargs["attention_mask"] = inputs.attention_mask.to("cpu")
                # Igbo is not a stock Whisper language token: respect the checkpoint defaults.
                inference_started = time.perf_counter()
                with torch.inference_mode():
                    ids = model.generate(features, **kwargs)
                transcript = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
                if not transcript:
                    return error(422, "No speech was recognized; please record again")
                return {"success": True, "language": language, "model": MODELS[language], "transcript": transcript, "timings": {"container_setup_ms": self.container_setup_ms, "model_load_ms": model_ms, "inference_ms": round((time.perf_counter() - inference_started) * 1000), "worker_total_ms": round((time.perf_counter() - started) * 1000), "warm_model": model_loaded}}
            except Exception:
                print(f"Inference failed for {MODELS[language]}")
                return error(500, "Transcription failed; please retry")


def create_api(recognizer, key):
    """Construct the same API for deployment and isolated contract tests."""
    from fastapi import FastAPI, File, Form, UploadFile
    from fastapi.responses import JSONResponse

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    allowed = {"audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav",
               "audio/mpeg", "audio/flac", "audio/x-flac"}

    @api.get("/health")
    async def health():
        return {"status": "ok", "service": APP_NAME}

    @api.post("/transcribe")
    async def transcribe(audio: UploadFile = File(...), language: str = Form(...)):
        if language not in MODELS:
            return JSONResponse({"detail": "Unsupported language; use en, yo, ha or ig"}, status_code=422)
        if (audio.content_type or "").split(";")[0].lower() not in allowed:
            return JSONResponse({"detail": "Unsupported audio format"}, status_code=415)
        raw = await audio.read(MAX_BYTES + 1)
        await audio.close()
        if not raw or len(raw) > MAX_BYTES:
            return JSONResponse({"detail": "Audio is empty" if not raw else "Audio exceeds 8 MiB"},
                                status_code=400 if not raw else 413)
        try:
            result = await asyncio.wait_for(recognizer(raw, language), timeout=125)
            status = result.pop("_status", 200)
            return JSONResponse(result, status_code=status)
        except (TimeoutError, asyncio.TimeoutError):
            return JSONResponse({"detail": "Transcription timed out; please retry"}, status_code=504)
        except Exception:
            return JSONResponse({"detail": "Transcription service temporarily unavailable"}, status_code=503)

    class Guard:
        # Authenticate and bound the complete body BEFORE Starlette parses multipart files.
        async def __call__(self, scope, receive, send):
            if scope["type"] != "http" or scope["path"] != "/transcribe":
                return await api(scope, receive, send)
            headers = dict(scope.get("headers", []))
            authorization = headers.get(b"authorization", b"")
            if not key or not hmac.compare_digest(authorization, f"Bearer {key}".encode()):
                return await JSONResponse({"detail": "Authentication required"}, status_code=401,
                                          headers={"WWW-Authenticate": "Bearer"})(scope, receive, send)
            limit = MAX_BYTES + 65536
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > limit:
                    return await JSONResponse({"detail": "Upload exceeds size limit"}, status_code=413)(scope, receive, send)
                if not message.get("more_body", False):
                    break
            sent = False
            async def buffered_receive():
                nonlocal sent
                if not sent:
                    sent = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()
            return await api(scope, buffered_receive, send)
    return Guard()


@app.function(image=web_image, secrets=[api_secret], min_containers=0,
              max_containers=2, scaledown_window=60, timeout=140)
@modal.concurrent(max_inputs=4)
@modal.asgi_app()
def api():
    key = os.environ.get("BETA_NATLAS_API_KEY")
    if not key:
        raise RuntimeError("beta-natlas-api-secret must contain BETA_NATLAS_API_KEY")
    return create_api(Recognizer().transcribe.remote.aio, key)


@app.local_entrypoint()
def main(languages: str = "en,yo,ha,ig"):
    print(prepare_models.remote(languages))
