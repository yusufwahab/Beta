"""Owner-authenticated setup and real HTTP tests; this tools app is never deployed."""
import json
import os
from pathlib import Path
import modal
from infra.modal_natlas_asr import image as inference_image

app = modal.App("beta-natlas-tools")
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "httpx>=0.28,<1", "fastapi>=0.115,<1", "python-multipart>=0.0.20,<1"
).add_local_python_source("infra.modal_natlas_asr")
secret = modal.Secret.from_name("beta-natlas-api-secret")


@app.function(image=image, secrets=[secret])
def backend_key():
    # Only callable through the owner's authenticated Modal SDK, never an HTTP route.
    value = os.environ.get("BETA_NATLAS_API_KEY")
    if not value:
        raise RuntimeError("beta-natlas-api-secret must contain BETA_NATLAS_API_KEY")
    return value


@app.function(image=image, timeout=900, secrets=[secret])
def real_tests(base_url: str, languages: str):
    import hashlib
    import time
    import httpx
    from infra.modal_natlas_asr import MODELS

    evidence = {"base_url": base_url, "kind": "REAL HTTP + REAL NCAIR MODEL INFERENCE", "tests": []}
    with httpx.Client(timeout=145, follow_redirects=False) as client:
        health = client.get(base_url + "/health")
        evidence["health"] = {"status": health.status_code, "body": health.json()}
        missing = client.post(base_url + "/transcribe")
        evidence["unauthenticated"] = {"status": missing.status_code, "body": missing.json()}
        assert health.status_code == 200 and missing.status_code == 401
        headers = {"Authorization": "Bearer " + os.environ["BETA_NATLAS_API_KEY"]}
        configs = {"en": "en_us", "yo": "yo_ng", "ha": "ha_ng", "ig": "ig_ng"}
        for language in languages.split(","):
            entry = {"language": language, "model": MODELS[language],
                     "source": "https://huggingface.co/datasets/google/fleurs",
                     "config": configs[language], "split": "test", "row": 0}
            try:
                mime = "audio/wav"
                if language in ("en", "yo", "ha", "ig"):
                    dataset = "benjaminogbonna/nigerian_common_voice_dataset"
                    rows = client.get("https://datasets-server.huggingface.co/rows", params={
                        "dataset": dataset, "config": {"en":"english","yo":"yoruba","ha":"hausa","ig":"igbo"}[language], "split": "train", "offset": 0, "length": 1,
                        "_ts": str(time.time()),
                    })
                    rows.raise_for_status()
                    row = rows.json()["rows"][0]["row"]
                    entry.update(source="https://huggingface.co/datasets/" + dataset,
                                 config={"en":"english","yo":"yoruba","ha":"hausa","ig":"igbo"}[language], split="train", accent=row.get("accent"))
                    entry["reference"] = row["sentence"]
                    mime = "audio/mpeg"
                    recording = client.get(row["audio"][0]["src"], follow_redirects=True)
                else:
                    root = f"https://huggingface.co/datasets/google/fleurs/resolve/main/data/{configs[language]}"
                    metadata = client.get(root + "/test.tsv", follow_redirects=True)
                    metadata.raise_for_status()
                    fields = metadata.text.splitlines()[0].split("\t")
                    entry["reference"] = fields[2]
                    entry["source_file"] = fields[1]
                    recording = client.get(root + "/audio/test/" + fields[1], follow_redirects=True)
                recording.raise_for_status()
                raw = recording.content
                entry["sha256"] = hashlib.sha256(raw).hexdigest()
                entry["bytes"] = len(raw)
                # Persist the actual file for the duration of this test container.
                audio_file = Path(f"/tmp/fleurs-{language}.wav")
                audio_file.write_bytes(raw)
                with audio_file.open("rb") as audio:
                    request_started = time.perf_counter()
                    response = client.post(base_url + "/transcribe", headers=headers,
                                           files={"audio": (audio_file.name, audio, mime)},
                                           data={"language": language})
                entry["request_ms"] = round((time.perf_counter() - request_started) * 1000)
                entry["status"] = response.status_code
                entry["body"] = response.json()
                body = entry["body"]
                entry["passed"] = (response.status_code == 200 and body.get("success") is True
                    and body.get("model") == MODELS[language] and body.get("language") == language
                    and isinstance(body.get("transcript"), str) and bool(body["transcript"].strip()))
                if entry["passed"]:
                    warm_started = time.perf_counter()
                    warm = client.post(base_url + "/transcribe", headers=headers,
                        files={"audio": ("recording", raw, mime)}, data={"language": language})
                    entry["warm_request_ms"] = round((time.perf_counter() - warm_started) * 1000)
                    entry["warm_status"] = warm.status_code
                    entry["warm_body"] = warm.json()
            except Exception as error:
                if isinstance(error, httpx.HTTPStatusError):
                    entry["source_error_status"] = error.response.status_code
                    entry["source_error_host"] = error.request.url.host
                entry["passed"] = False
                entry["error"] = type(error).__name__
            evidence["tests"].append(entry)
    return evidence


@app.function(image=image)
def contract_tests():
    """Mock inference ONLY: validates HTTP security/error handling, not model quality."""
    from fastapi.testclient import TestClient
    from infra.modal_natlas_asr import create_api, MAX_BYTES
    calls = []
    async def mock_inference(audio, language):
        calls.append(language)
        return {"success": True, "language": language, "model": "test-double", "transcript": "mock"}
    client = TestClient(create_api(mock_inference, "test-key"))
    headers = {"Authorization": "Bearer test-key"}
    def post(raw=b"recording", language="en", mime="audio/wav", auth=headers):
        return client.post("/transcribe", headers=auth, files={"audio": ("test.wav", raw, mime)}, data={"language": language})
    assert client.get("/health").json() == {"status": "ok", "service": "beta-natlas-asr"}
    assert post(auth={}).status_code == 401
    assert post(raw=b"").status_code == 400
    assert post(language="fr").status_code == 422
    assert post(mime="text/plain").status_code == 415
    assert post(raw=b"x" * (MAX_BYTES + 1)).status_code == 413
    assert post(raw=b"x" * (MAX_BYTES + 65537)).status_code == 413
    assert calls == []
    assert post(language="yo").status_code == 200
    assert calls == ["yo"]
    async def failed(*args):
        raise RuntimeError("private internal failure")
    failure = TestClient(create_api(failed, "test-key")).post("/transcribe", headers=headers,
        files={"audio": ("test.wav", b"recording", "audio/wav")}, data={"language": "en"})
    assert failure.status_code == 503 and "private" not in failure.text
    return {"kind": "MOCK inference contract tests only", "passed": 10}


@app.function(image=image, secrets=[modal.Secret.from_name("huggingface-secret"), secret], timeout=180)
def check_access():
    """Check gated configuration access on CPU; does not claim inference succeeded."""
    import httpx
    from infra.modal_natlas_asr import MODELS
    token = os.environ.get("HF_TOKEN")
    if not token or not os.environ.get("BETA_NATLAS_API_KEY"):
        raise RuntimeError("Required Modal secret environment variable is missing")
    result = []
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        for language, model in MODELS.items():
            response = client.get(f"https://huggingface.co/{model}/resolve/main/config.json",
                                  headers={"Authorization": f"Bearer {token}"})
            entry = {"language": language, "model": model, "config_http_status": response.status_code}
            if response.status_code == 200:
                config = response.json()
                entry["model_type"] = config.get("model_type")
                entry["architectures"] = config.get("architectures")
            result.append(entry)
    return {"kind": "REAL gated config access; NO inference", "models": result}


@app.function(image=inference_image.add_local_python_source("infra.modal_natlas_asr"), timeout=120)
def check_runtime():
    """Import the actual Linux inference dependencies; no model inference is mocked."""
    import io
    import subprocess
    import wave
    import numpy as np
    import torch
    import transformers
    from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq
    assert AutoProcessor and AutoModelForSpeechSeq2Seq
    recording = io.BytesIO()
    with wave.open(recording, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(np.zeros(16000, dtype="<i2").tobytes())
    decoded = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "pipe",
        "-threads", "1", "-i", "pipe:0", "-t", "30.1", "-vn", "-ac", "1", "-ar", "16000",
        "-f", "f32le", "pipe:1"], input=recording.getvalue(), capture_output=True, check=True, timeout=20)
    assert len(decoded.stdout) == 16000 * 4
    return {"kind": "REAL Linux runtime imports + generated silence decoding; NO speech inference",
            "torch": str(torch.__version__), "transformers": str(transformers.__version__), "decoded_samples": 16000}


@app.function(image=image, secrets=[secret], timeout=300)
def live_errors(base_url: str):
    import httpx
    key = os.environ["BETA_NATLAS_API_KEY"]
    results = []
    with httpx.Client(timeout=145) as client:
        for name, expected, raw, language, mime, auth in [
            ("invalid authentication", 401, b"bad", "en", "audio/wav", "wrong-key"),
            ("empty recording", 400, b"", "en", "audio/wav", key),
            ("unsupported language", 422, b"bad", "fr", "audio/wav", key),
            ("unsupported format", 415, b"bad", "en", "text/plain", key),
            ("corrupted audio", 422, b"not a valid WAV recording", "en", "audio/wav", key),
            ("oversized recording", 413, b"x" * (8 * 1024 * 1024 + 1), "en", "audio/wav", key),
        ]:
            response = client.post(base_url.rstrip("/") + "/transcribe",
                headers={"Authorization": "Bearer " + auth},
                files={"audio": ("test.wav", raw, mime)}, data={"language": language})
            results.append({"case": name, "status": response.status_code, "expected": expected,
                            "body": response.json(), "passed": response.status_code == expected})
    return {"kind": "REAL deployed HTTP error handling; invalid fixture bytes, NO successful speech inference", "tests": results}


@app.local_entrypoint()
def main(base_url: str = "", languages: str = "en,yo,ha,ig", configure_backend: bool = False,
         test_contract: bool = False, test_real: bool = False, preflight: bool = False, runtime: bool = False,
         test_errors: bool = False):
    if test_errors:
        if not base_url.startswith("https://"):
            raise ValueError("Supply the actual deployed HTTPS --base-url")
        result = live_errors.remote(base_url)
        path = Path("artifacts/natlas-http-errors.json")
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        if not all(item["passed"] for item in result["tests"]):
            raise RuntimeError("Live error checks failed")
    if runtime:
        print(json.dumps(check_runtime.remote()))
    if preflight:
        result = check_access.remote()
        path = Path("artifacts/natlas-model-access.json")
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
    if test_contract:
        print(json.dumps(contract_tests.remote()))
    if configure_backend:
        if not base_url.startswith("https://"):
            raise ValueError("Supply the actual deployed HTTPS --base-url")
        # Owner-approved setup: transfer the existing secret directly into ignored backend .env.
        # Never log or pass the key as a CLI argument; preserve all unrelated credentials.
        key = backend_key.remote()
        if any(char in key for char in '\r\n\"'):
            raise ValueError("Use an API key without quotes or line breaks")
        path = Path("server/.env")
        lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
        values = {"NATLAS_BASE_URL": base_url.rstrip("/"), "NATLAS_API_KEY": key,
                  "NATLAS_ASR_MODEL_EN": "NCAIR1/NigerianAccentedEnglish", "NATLAS_ASR_MODEL_YO": "NCAIR1/Yoruba-ASR",
                  "NATLAS_ASR_MODEL_HA": "NCAIR1/Hausa-ASR", "NATLAS_ASR_MODEL_IG": "NCAIR1/Igbo-ASR"}
        pending = dict(values)
        updated = []
        for line in lines:
            name = line.partition("=")[0].strip()
            if name in values:
                updated.append(f'{name}="{values[name]}"')
                pending.pop(name, None)
            else:
                updated.append(line)
        updated.extend(f'{name}="{value}"' for name, value in pending.items())
        path.write_text("\n".join(updated) + "\n", encoding="utf-8")
        print("Configured server/.env with the deployed URL and existing private service key (redacted). Restart Express.")
    if test_real:
        if not base_url.startswith("https://"):
            raise ValueError("Supply the actual deployed HTTPS --base-url")
        result = real_tests.remote(base_url.rstrip("/"), languages)
        path = Path("artifacts/natlas-real-tests.json")
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not all(test.get("passed") for test in result["tests"]):
            raise RuntimeError("Some real-audio tests failed; see artifacts/natlas-real-tests.json")
