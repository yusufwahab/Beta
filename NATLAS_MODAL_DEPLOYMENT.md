# N-ATLAS Modal CPU deployment

Report updated: October 15, 2026 (Africa/Lagos).

## Actual deployment

**Deployed successfully; real Nigerian English, Yoruba, Hausa and Igbo inference verified.**

Endpoint: https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run

[Modal deployment dashboard](https://modal.com/apps/yusufabdulwhab/main/deployed/beta-natlas-asr).
The latest actual `modal deploy infra/modal_natlas_asr.py` completed successfully in 5.913 seconds.
The earlier T4 deployment failed for lack of a payment method; this service now uses CPU only.
No 8B language model or alternative ASR provider is deployed.

## Runtime and cache

- Recognizer: 4 CPU cores, 8192 MiB requested RAM, `device=cpu`, `torch.float32`.
- CPU-only PyTorch 2.8.0+cpu installed from the official CPU wheel index **before** accelerate.
- Transformers 4.57.6, accelerate, huggingface_hub, FastAPI, python-multipart, numpy,
  soundfile, FFmpeg and libsndfile are installed inside the Modal Linux image.
- Modal SDK 1.6.1; `modal.App`, `Image`, named `Secret`s, `Volume`, CPU class and `@modal.asgi_app()`.
- Persistent `beta-natlas-model-cache` mounted at `/hf-cache`; HF_HOME and HF_HUB_CACHE point there.
- At most two requested models in the warm container's LRU cache. No eager four-model load.
- One recognizer container, serialized inference, minimum zero containers, 60-second idle scale-down.
  CPU web containers also scale to zero; public health does not load a model.
- Model snapshots survive redeployment. Cached weights are reused; cold loading still checks HF metadata.
- Audio stays in bounded memory and is decoded to 16 kHz mono. It is not persisted to the model Volume.

| Language | Exact official model | Access | Real inference |
| --- | --- | --- | --- |
| en | NCAIR1/NigerianAccentedEnglish | 200 | Passed |
| yo | NCAIR1/Yoruba-ASR | 200 | Passed |
| ha | NCAIR1/Hausa-ASR | 200 after access grant | Passed |
| ig | NCAIR1/Igbo-ASR | 200 after access grant | Passed |

Cached model revisions prepared before deployment:

- English: `3c52c6e6c9ec508014a7b9db6a42b503b8930dff`
- Yoruba: `d1ae7b8b79c2ccd547d8761effe5057433f3fc7f`
- Hausa: `e635b9eda29060c6114c8f4d8b2d903f5c83a44a`
- Igbo: `180732299d5cba3dc8b289260ac84b7838bb3954`

## Routes

`GET /health` is public. Actual deployed response, HTTP 200:

```json
{"status":"ok","service":"beta-natlas-asr"}
```

`POST /transcribe` requires `Authorization: Bearer <private key>` and multipart
`audio` plus `language` (`en`, `yo`, `ha`, `ig`). The browser calls Express; only Express
holds the key. Response: `success`, `language`, official `model`, `transcript`, measured `timings`.
The API has no public browser CORS configuration or interactive docs.

Limits: 8 MiB recording, 30 seconds decoded audio, 125-second ASGI recognition deadline,
130-second worker execution deadline, 145-second backend fetch deadline. FFmpeg decoding
has a 20-second deadline and a bounded output duration; external input protocols are disabled.
Formats: WAV/x-WAV, WebM, Ogg, MP4, MP3, FLAC at the service. Existing browser checkout retains
WAV/WebM/Ogg/MP4. Error bodies contain safe `detail` messages, not stack traces.

Actual deployed rejection tests all passed: invalid bearer 401; empty audio 400;
unsupported language 422; unsupported format 415; corrupt audio 422; oversized audio 413.
Code also rejects silent/overlong audio and handles model loading/access failures (503),
inference failure (500), decode timeout (408), recognition timeout (504).

## Real measured performance

[Final real test run](https://modal.com/apps/yusufabdulwhab/main/ap-HYePjRTtUY1POqIMI9n48l).

| Measurement | Nigerian English | Yoruba |
| --- | --- | --- |
| First request in this test | 13.634 s, cold container/model | 6.814 s, warm container/new model |
| Container initialization hook | 1.582 s | same already-initialized container |
| Model loading | 1.158 s | 1.095 s |
| Inference | 3.838 s | 4.622 s |
| Worker total | 8.238 s | 5.839 s |
| Warm request end to end | 4.467 s | 5.812 s |
| Warm model load | 0 ms | 0 ms |
| Warm inference | 3.589 s | 4.722 s |

Initialization measures the Modal enter hook. The cold request total additionally includes
platform scheduling/startup, imports, decoding, RPC/network and response overhead. Image-pull
and platform-only startup are not separately measured; the hook duration is not the entire
cold-start delay. Warm responses repeat the original container initialization measurement;
they do not pay that initialization again. These are individual smoke-test measurements,
not a latency SLA, concurrency benchmark or full 30-second-recording benchmark.

The English/Yoruba recordings are real human speech from
[benjaminogbonna/nigerian_common_voice_dataset](https://huggingface.co/datasets/benjaminogbonna/nigerian_common_voice_dataset),
`english` and `yoruba`, train row 0, labelled Nigerian accent. They may overlap model training
material; this is not held-out accuracy evaluation. Dataset attribution/license information
is in that dataset card. The initial FLEURS viewer test failed on its scan-size limit; it
was replaced with these verified sources, without changing inference providers.

English returned:

> closing the google assistant app prevents it from working with your headphones.

Yoruba reference:

> ?m? ?gb?? ?k?nk?n d?r? ?t?m??l? tor? n?l?? ?b?d?n.

Yoruba returned:

> ?m? ?gb?? ?k?k? d?r? ?t?m??l? tor? n?l? b?d?

The Yoruba output contains errors. User review and financial validation remain essential.
Hausa and Igbo subsequently passed real inference after the user granted model access. No accuracy score or YarnGPT success is claimed.

## Hausa and Igbo verification after access was granted

The new access check returned HTTP 200 for all four model configs. Both newly granted
model snapshots downloaded successfully into the existing cache. No redeployment or
provider substitution was needed.

[Real Hausa/Igbo test run](https://modal.com/apps/yusufabdulwhab/main/ap-iZ3fsVkVNvyxOQFW15RrNu).
Both used real human recordings from the same Nigerian Common Voice dataset, train row 0,
configs `hausa` and `igbo`. Like the earlier samples, these are smoke tests and may overlap
training material; they are not independent accuracy benchmarks.

| Measurement | Hausa | Igbo |
| --- | --- | --- |
| First request | 18.583 s, cold container/model | 10.207 s, warm container/new model |
| Container initialization hook | 2.180 s | same already-initialized container |
| Model loading | 2.190 s | 2.567 s |
| Inference | 5.028 s | 6.952 s |
| Worker total | 11.363 s | 9.678 s |
| Warm request | 5.378 s | 7.383 s |
| Warm inference | 4.689 s | 6.663 s |

Actual Hausa transcript:

> bude ?ofar,na san kina ciki.

Actual Igbo transcript:

> ode akw?kw? kp?t?r? ?kp? ?l? ?r? n'ah? maka ?r?ngo na steeti anambara.

The full reference texts, file hashes, responses and warm repeats are included below.
English/Yoruba and Hausa/Igbo were tested in separate runs; the combined evidence does
not imply all four models were resident in RAM simultaneously. The in-memory LRU remains two models.

## Secrets and Express configuration

Existing Modal secrets (verified present; no values logged):

- `huggingface-secret` exposes `HF_TOKEN`.
- `beta-natlas-api-secret` exposes `BETA_NATLAS_API_KEY`.

Ignored `server/.env` now contains the actual endpoint and existing API key, transferred via
the owner's authenticated Modal SDK by `--configure-backend`. No public secret-reading route
exists. The ephemeral tools app is not deployed as a public service. Never copy these keys into VITE variables.

```dotenv
NATLAS_BASE_URL=https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run
NATLAS_API_KEY=
NATLAS_ASR_MODEL_EN=NCAIR1/NigerianAccentedEnglish
NATLAS_ASR_MODEL_YO=NCAIR1/Yoruba-ASR
NATLAS_ASR_MODEL_HA=NCAIR1/Hausa-ASR
NATLAS_ASR_MODEL_IG=NCAIR1/Igbo-ASR
```

The blank key above is intentional documentation redaction. The real backend key is configured.
`interpret()` now uses Beta's deterministic intent engine; NATLAS_LLM_* and gateway credentials
are not needed. `/api/health` configuration flags are not a continuous live-service probe;
`verified` remains false rather than claiming every request/provider is healthy.

## Commands

From the project root, redeploy, prepare English/Yoruba, configure backend and test real audio:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\deploy_natlas.ps1
```

Individual commands (the existing virtual environment works even when `py` cannot find Python):

```powershell
$env:PYTHONUTF8='1'
.\.venv\Scripts\python.exe -m modal deploy infra/modal_natlas_asr.py
.\.venv\Scripts\python.exe -m modal run infra/natlas_tools.py --base-url https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run --test-real --languages en,yo
.\.venv\Scripts\python.exe -m modal run infra/natlas_tools.py --base-url https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run --test-errors
.\.venv\Scripts\python.exe -m modal run infra/natlas_tools.py --test-contract --runtime --preflight
node infra/test_natlas.mjs
node infra/test_natlas.mjs --audio .\artifacts\my-recording.wav --language yo
```

Where the Python launcher works, `py -m modal deploy infra/modal_natlas_asr.py` is equivalent.
The current token now has access to Hausa/Igbo. To prepare/test all four again, run the deployment script with `-Languages 'en,yo,ha,ig'`.
A token replacement, if needed, can be applied from a private ignored dotenv file:

```powershell
.\.venv\Scripts\python.exe -m modal secret create huggingface-secret --from-dotenv <private-dotenv-path> --force
```

No secret values are needed in chat. The named cache Volume remains across redeployments.

## Evidence and verification distinctions

- Real speech/HTTP timings: `artifacts/natlas-real-tests.json`, reproduced below.
- Actual model-access statuses: `artifacts/natlas-model-access.json`.
- Actual HTTP error statuses: `artifacts/natlas-http-errors.json`;
  [error test run](https://modal.com/apps/yusufabdulwhab/main/ap-9b1XmGIu8cUzxAWSFIc49S).
- Runtime smoke test: actual Linux imports, torch `2.8.0+cpu`, transformers `4.57.6`,
  FFmpeg decoding of generated silence. That decoder test is not speech inference.
- Ten API contract checks use a mocked recognizer and do not establish model accuracy.
- Browser CI mocks Auth/ASR/TTS. Separate PostgreSQL tests use real transactions/RLS with
  controlled Auth/transcript fixtures. See VOICE_FIRST_ARCHITECTURE.md for full app status.
- YarnGPT is credential-blocked; no successful real synthesis is claimed.

### Actual inference responses from both verified runs (no secrets or signed download URLs)

```json
{
  "base_url": "https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run",
  "kind": "REAL HTTP + REAL NCAIR MODEL INFERENCE",
  "tests": [
    {
      "language": "en",
      "model": "NCAIR1/NigerianAccentedEnglish",
      "source": "https://huggingface.co/datasets/benjaminogbonna/nigerian_common_voice_dataset",
      "config": "english",
      "split": "train",
      "row": 0,
      "accent": "nigerian",
      "reference": "Closing the Google assistant app prevents it from working with your headphones.",
      "sha256": "355a80ff1824b17411ffd7a13b6be6a9a1ff5423fef6c55c73f25b477125b207",
      "bytes": 16641,
      "request_ms": 13634,
      "status": 200,
      "body": {
        "success": true,
        "language": "en",
        "model": "NCAIR1/NigerianAccentedEnglish",
        "transcript": "closing the google assistant app prevents it from working with your headphones.",
        "timings": {
          "container_setup_ms": 1582,
          "model_load_ms": 1158,
          "inference_ms": 3838,
          "worker_total_ms": 8238,
          "warm_model": false
        }
      },
      "passed": true,
      "warm_request_ms": 4467,
      "warm_status": 200,
      "warm_body": {
        "success": true,
        "language": "en",
        "model": "NCAIR1/NigerianAccentedEnglish",
        "transcript": "closing the google assistant app prevents it from working with your headphones.",
        "timings": {
          "container_setup_ms": 1582,
          "model_load_ms": 0,
          "inference_ms": 3589,
          "worker_total_ms": 3721,
          "warm_model": true
        }
      }
    },
    {
      "language": "yo",
      "model": "NCAIR1/Yoruba-ASR",
      "source": "https://huggingface.co/datasets/benjaminogbonna/nigerian_common_voice_dataset",
      "config": "yoruba",
      "split": "train",
      "row": 0,
      "accent": "nigerian",
      "reference": "Ọmọ ẹgbẹ́ òkùnkùn dèrò àtìmọ́lé torí nílùú Ìbàdàn.",
      "sha256": "f4c6dde658bcfb1ddb9d056237e9aac594169817c4b67a994eb59378d9baafd8",
      "bytes": 37510,
      "request_ms": 6814,
      "status": 200,
      "body": {
        "success": true,
        "language": "yo",
        "model": "NCAIR1/Yoruba-ASR",
        "transcript": "ọmọ ẹgbẹ́ òkúkú dèrò àtìmọ́lé torí nílù bàdá",
        "timings": {
          "container_setup_ms": 1582,
          "model_load_ms": 1095,
          "inference_ms": 4622,
          "worker_total_ms": 5839,
          "warm_model": false
        }
      },
      "passed": true,
      "warm_request_ms": 5812,
      "warm_status": 200,
      "warm_body": {
        "success": true,
        "language": "yo",
        "model": "NCAIR1/Yoruba-ASR",
        "transcript": "ọmọ ẹgbẹ́ òkúkú dèrò àtìmọ́lé torí nílù bàdá",
        "timings": {
          "container_setup_ms": 1582,
          "model_load_ms": 0,
          "inference_ms": 4722,
          "worker_total_ms": 4844,
          "warm_model": true
        }
      }
    },
    {
      "language": "ha",
      "model": "NCAIR1/Hausa-ASR",
      "source": "https://huggingface.co/datasets/benjaminogbonna/nigerian_common_voice_dataset",
      "config": "hausa",
      "split": "train",
      "row": 0,
      "accent": "nigerian",
      "reference": "Bude kofar. Na san kina ciki.",
      "sha256": "15493965e69898a3e7064d7f260f12db54f6a497f651b7bf24a0aad53e2d3980",
      "bytes": 34173,
      "request_ms": 18583,
      "status": 200,
      "body": {
        "success": true,
        "language": "ha",
        "model": "NCAIR1/Hausa-ASR",
        "transcript": "bude ƙofar,na san kina ciki.",
        "timings": {
          "container_setup_ms": 2180,
          "model_load_ms": 2190,
          "inference_ms": 5028,
          "worker_total_ms": 11363,
          "warm_model": false
        }
      },
      "passed": true,
      "warm_request_ms": 5378,
      "warm_status": 200,
      "warm_body": {
        "success": true,
        "language": "ha",
        "model": "NCAIR1/Hausa-ASR",
        "transcript": "bude ƙofar,na san kina ciki.",
        "timings": {
          "container_setup_ms": 2180,
          "model_load_ms": 0,
          "inference_ms": 4689,
          "worker_total_ms": 4869,
          "warm_model": true
        }
      }
    },
    {
      "language": "ig",
      "model": "NCAIR1/Igbo-ASR",
      "source": "https://huggingface.co/datasets/benjaminogbonna/nigerian_common_voice_dataset",
      "config": "igbo",
      "split": "train",
      "row": 0,
      "accent": "nigerian",
      "reference": "Odeakwụkwọ ọkpụtọrọkpụ ụlọọrụ na-ahụ maka ọrụ ngo na steeti Anambra",
      "sha256": "5638a460d18299524b61657f6da8ed58b2e0cefefa53a4a2927e72650a536238",
      "bytes": 38925,
      "request_ms": 10207,
      "status": 200,
      "body": {
        "success": true,
        "language": "ig",
        "model": "NCAIR1/Igbo-ASR",
        "transcript": "ode akwụkwọ kpọtọrọ ọkpụ ụlọ ọrụ n'ahụ maka ọrụngo na steeti anambara.",
        "timings": {
          "container_setup_ms": 2180,
          "model_load_ms": 2567,
          "inference_ms": 6952,
          "worker_total_ms": 9678,
          "warm_model": false
        }
      },
      "passed": true,
      "warm_request_ms": 7383,
      "warm_status": 200,
      "warm_body": {
        "success": true,
        "language": "ig",
        "model": "NCAIR1/Igbo-ASR",
        "transcript": "ode akwụkwọ kpọtọrọ ọkpụ ụlọ ọrụ n'ahụ maka ọrụngo na steeti anambara.",
        "timings": {
          "container_setup_ms": 2180,
          "model_load_ms": 0,
          "inference_ms": 6663,
          "worker_total_ms": 6879,
          "warm_model": true
        }
      }
    }
  ],
  "health": {
    "status": 200,
    "body": {
      "status": "ok",
      "service": "beta-natlas-asr"
    }
  },
  "unauthenticated": {
    "status": 401,
    "body": {
      "detail": "Authentication required"
    }
  },
  "evidence_runs": [
    "https://modal.com/apps/yusufabdulwhab/main/ap-HYePjRTtUY1POqIMI9n48l",
    "https://modal.com/apps/yusufabdulwhab/main/ap-iZ3fsVkVNvyxOQFW15RrNu"
  ]
}
```
