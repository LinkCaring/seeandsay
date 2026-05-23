# Backend module map

Entry point: [`server.py`](../server.py) (`uvicorn server:app`).  
Client contract: [`frontend_demo/js/api/apiToMongo.js`](../../frontend_demo/js/api/apiToMongo.js).  
Archived audit/planning: [changes/docs/BACKEND_DEAD_CODE_REPORT.md](../../changes/docs/BACKEND_DEAD_CODE_REPORT.md), [BACKEND_STRUCTURE_RECOMMENDATION.md](../../changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md).

---

## Request flow (MILI demo)

```mermaid
flowchart TB
  subgraph client [frontend_demo]
    API[apiToMongo.js]
  end
  subgraph server [backend runtime]
    S[server.py FastAPI routes]
    AB[azure_blob.py]
    DB[MongoDB.py]
    AI[AI_Models_API.py]
    PR[prompts.py]
  end
  CSV[frontend_demo/resources/query_database.csv]
  AZ[Azure Blob session.mp3]
  MONGO[(MongoDB SeeSayDB)]

  API -->|POST createUser prepareUpload addTestToUser| S
  API -->|GET expressionAiStatus testStatus recoverLatest| S
  API -->|PUT SAS URL| AZ
  S --> AB
  S --> DB
  S --> AI
  AI --> PR
  S --> CSV
  DB --> MONGO
  AB --> AZ
  S -->|BackgroundTasks| AI
```

1. **Login** — `POST /api/createUser` → `MongoDB.add_user`
2. **Finish session** — `POST /api/tests/prepareUpload` → SAS URL; browser **PUT** MP3 to Azure; `POST /api/addTestToUser` → save test + queue expression AI
3. **Background** — `_run_expression_ai_background` → Gemini per-question scores + Hebrew impression
4. **Summary poll** — `GET /api/expressionAiStatus?userId&testId`
5. **Recover** — `GET /api/testStatus`, `GET /api/tests/recoverLatest` when upload/metadata failed

---

## Live API routes

| Method | Path | Handler | Frontend |
|--------|------|---------|----------|
| GET | `/` | `home` | Deploy health (optional) |
| POST | `/api/createUser` | `create_user` | `createUser` |
| POST | `/api/tests/prepareUpload` | `prepare_upload` | `prepareAudioUpload` |
| POST | `/api/addTestToUser` | `add_test` | `updateUserTests` |
| GET | `/api/expressionAiStatus` | `expression_ai_status` | `getExpressionAiStatus` |
| GET | `/api/testStatus` | `test_status` | `getTestStatus` |
| GET | `/api/tests/recoverLatest` | `recover_latest_test` | `recoverLatestTest` |

Azure upload is **not** a FastAPI route — `putSessionAudioToBlob` PUTs to the SAS URL from `prepareUpload`.

**Removed (Tier 2):** `POST /api/VerifySpeaker` — was not used by `frontend_demo`.

---

## Every file under `backend/`

| Path | Runtime? | Role |
|------|----------|------|
| **`server.py`** | **Yes** | FastAPI app: CORS, routes, Pydantic models, rubric CSV load, test-result parsing, expression AI orchestration (~1.1k lines), `BackgroundTasks` |
| **`MongoDB.py`** | **Yes** | `SeeSayMongoStorage`: users, tests, `expressionAI` updates, daily Gemini quota (`api_usage` collection) |
| **`azure_blob.py`** | **Yes** | SAS upload URLs, blob path `tests/{userId}/{testId}/session.mp3`, existence poll after PUT |
| **`AI_Models_API.py`** | **Yes** | Audio decode/slice (pydub), Gemini expression scoring + impression; `score_expression_with_gemini` (base64 wrapper, kept) |
| **`prompts.py`** | **Yes** | Hebrew/structured prompts for Gemini (imported by `AI_Models_API`) |
| **`requirements.txt`** | Deploy | Python deps (FastAPI, pymongo, google-genai, pydub, …) |
| **`runtime.txt`** | Deploy | Python version pin for Render |
| **`.env`** | Local/deploy | Secrets: `MONGODB_URL`, `DATABASE_NAME`, Azure SAS, `GEMINI_API_KEY`, optional legacy keys — **not committed** |
| **`testRecording.m4a`** | No | Optional local sample audio for manual experiments; not imported by server |
| **`docs/README.md`** | No | Index of backend docs |
| **`docs/BACKEND_MODULE_MAP.md`** | No | This file |
**External data (not in `backend/`):** rubrics loaded from `frontend_demo/resources/query_database.csv` at server startup.

**Not present / removed:** `testings.py`, `Explaintion`, `TTS_Google.py` (Tier 1), VerifySpeaker + Speechmatics (Tier 2), `tools/` dev CLIs (blob smoke, TTS generator).

---

## `server.py` regions (logical modules today)

| Region (approx lines) | Responsibility |
|----------------------|----------------|
| 57–120 | Load `QUESTION_RUBRICS` from CSV |
| 126–308 | Parse `full_array`, timestamps, comprehension context for impression |
| 310–388 | Build pending/aggregate expression AI payloads |
| 430–458 | Pydantic: `CreateUserRequest`, `AddTestRequest`, `PrepareUploadRequest` |
| 460–1095 | HTTP route handlers |
| 587–1060 | `_compute_expression_ai_payload`, background task, stale impression finalize |

---

## `MongoDB.py` methods (in use)

| Method | Called from |
|--------|-------------|
| `add_user` | `create_user` |
| `get_user_test_by_id` | `add_test`, `test_status` |
| `get_latest_user_test` | `recover_latest_test` |
| `add_test_to_user` | `add_test` |
| `update_test_expression_ai` | Expression AI background |
| `get_test_expression_ai` | `expression_ai_status`, stale checks |
| `check_and_increment_daily_quota` | Gemini limits in pipeline |

---

## `AI_Models_API.py` symbols used by server

| Symbol | Purpose |
|--------|---------|
| `decode_base64_to_bytes` | Legacy `audioFile64` path |
| `slice_audio_window_bytes` | Per-question audio window |
| `score_expression_with_gemini_bytes` | Per-question Gemini JSON score |
| `summarize_expressive_language_impression_gemini` | Session Hebrew narrative |
| `score_expression_with_gemini` | Base64 wrapper (kept; not called from `server.py` today) |

---

## Still optional (not removed)

| Item | Why kept |
|------|----------|
| `audioFile64` in `add_test` | Frontend fallback + possible non-demo clients |
| `score_expression_with_gemini` | Requested keep |
| `openAI_client` in `AI_Models_API` | Reserved; no active route uses OpenAI today |
| Monolith `server.py` | Structure split is a separate approved phase |

---

## Run locally

```bash
cd backend
.\.venv\Scripts\activate
uvicorn server:app --reload --port 8001
```

Point `frontend_demo` at the same host/port (or production `seeandsay-backend.onrender.com`).
