# Backend structure recommendation

> **Archived** (May 2026) — not implemented. Current layout: [`backend/docs/BACKEND_STRUCTURE.md`](../../backend/docs/BACKEND_STRUCTURE.md).

Organizational proposal only — **same logic, split files**. No moves or refactors until you approve phases in [`BACKEND_DEAD_CODE_REPORT.md`](BACKEND_DEAD_CODE_REPORT.md).

**Current state:** Single [`server.py`](../server.py) (~1,150 lines) mixes HTTP routes, Pydantic models, rubric CSV loading, test-result parsing, expression AI orchestration, and Mongo/Azure I/O.

---

## Goals

1. **Find things fast** — routes, AI, storage, and dev tools in predictable folders.
2. **Shrink the monolith** — match boundaries that already exist as function groups in `server.py`.
3. **Explicit imports** — replace `from AI_Models_API import *` with named imports from `ai/models_api.py`.
4. **Keep deploy simple** — entry point remains one ASGI app (`app.main:app` or equivalent).

---

## Proposed layout

```
backend/
  README.md                      # How to run + pointer to docs/
  .env.example                   # (optional) documented env vars
  requirements.txt
  runtime.txt
  app/
    main.py                      # FastAPI factory, CORS, include routers
    config.py                    # Mongo URI, Gemini limits, Azure, CORS
  api/
    routes/
      health.py                  # GET /
      users.py                   # POST /api/createUser
      tests.py                   # prepareUpload, addTestToUser, testStatus, recoverLatest
      expression_ai.py           # GET /api/expressionAiStatus
      speaker.py                 # POST /api/VerifySpeaker — deprecated or removed after approval
    schemas.py                   # CreateUserRequest, AddTestRequest, …
  services/
    expression_ai_pipeline.py    # _compute_expression_ai_payload, background task, stale finalize
    rubric_loader.py             # CSV → QUESTION_RUBRICS
    test_results_parser.py       # full_array / timestamp parsing helpers
  storage/
    mongodb.py                   # SeeSayMongoStorage (trim after dead-code approval)
    azure_blob.py                # move from root; API unchanged
  ai/
    models_api.py                # rename from AI_Models_API.py
    prompts.py
  tools/                         # dev-only; not required for production request path
    blob_smoke_phase_a.py
    tts_generate_audio.py        # rename from TTS_Google.py
  docs/
    BACKEND_DEAD_CODE_REPORT.md
    BACKEND_STRUCTURE_RECOMMENDATION.md
  archive/                       # optional after approval
    testings.py
    Explaintion
```

**ASGI entry (after migration):** e.g. `uvicorn app.main:app` — update Render start command when you move files.

---

## Slice boundaries (from current `server.py`)

These groups should move together to avoid circular imports.

| Current location | Proposed module | Functions / symbols |
|------------------|-----------------|---------------------|
| Lines 57–120 | `services/rubric_loader.py` | `_csv_row_to_rubric`, `_load_question_rubrics`, module-level `QUESTION_RUBRICS` |
| Lines 126–308 | `services/test_results_parser.py` | `_parse_section_results_from_full_array`, `_parse_expression_results_from_full_array`, `_parse_comprehension_results_from_full_array`, `_question_text_for_gender`, `_build_comprehension_impression_context_he`, `_parse_question_timestamps`, `_timestamp_window_for_question` |
| Lines 310–388 | `services/expression_ai_pipeline.py` | `_aggregate_expression_ai`, `_parent_result_to_score`, `_build_parent_ai_comparison`, `_build_pending_expression_ai_payload` |
| Lines 587–1060 | `services/expression_ai_pipeline.py` | `_compute_expression_ai_payload`, `_build_failed_expression_ai_payload`, `_finalize_stuck_pending_expression_ai`, `_expression_ai_payload_is_terminal`, `_run_expression_ai_background`, `_maybe_finalize_stale_building_impression` |
| Lines 430–462 | `api/schemas.py` | All `BaseModel` request types |
| Lines 466–1100 | `api/routes/*.py` | Route handlers (thin: validate, call storage/services) |
| Top of file | `app/config.py` + `app/main.py` | `load_dotenv`, `SeeSayMongoStorage`, CORS, `BackgroundTasks` wiring |

**Shared dependency direction:**

```
api/routes  →  services  →  storage, ai
                ↓
            app/config (env, singletons)
```

---

## Per-file migration map

| Current file | Role today | Proposed home | Safe to remove after approval |
|--------------|------------|---------------|-------------------------------|
| [`server.py`](../server.py) | Monolith: routes + AI + parsing | Split into `app/`, `api/`, `services/` | N/A — becomes thin `main` + routers |
| [`MongoDB.py`](../MongoDB.py) | `SeeSayMongoStorage` | `storage/mongodb.py` | Methods in dead-code report §4 |
| [`azure_blob.py`](../azure_blob.py) | SAS upload URLs | `storage/azure_blob.py` | None |
| [`AI_Models_API.py`](../AI_Models_API.py) | Gemini, Speechmatics, audio utils | `ai/models_api.py` | Dead symbols in dead-code report §5 |
| [`prompts.py`](../prompts.py) | LLM prompt strings | `ai/prompts.py` | None |
| [`requirements.txt`](../requirements.txt) | Dependencies | Root (unchanged) | `speechmatics-python` if VerifySpeaker removed |
| [`runtime.txt`](../runtime.txt) | Python version for Render | Root | None |
| [`testings.py`](../testings.py) | Local scratch (`from server import *`) | `archive/testings.py` | Entire file |
| [`TTS_Google.py`](../TTS_Google.py) | Offline question audio generation | `tools/tts_generate_audio.py` | None if kept as dev tool |
| [`Explaintion`](../Explaintion) | Stale API notes | `archive/` or delete | Entire file |
| [`tools/blob_smoke_phase_a.py`](../tools/blob_smoke_phase_a.py) | CLI blob smoke | `tools/` (unchanged) | None |

---

## Route → router mapping

| Route | Current handler | Proposed router file |
|-------|-----------------|----------------------|
| `GET /` | `home` | `api/routes/health.py` |
| `POST /api/createUser` | `create_user` | `api/routes/users.py` |
| `POST /api/tests/prepareUpload` | `prepare_upload` | `api/routes/tests.py` |
| `POST /api/addTestToUser` | `add_test` | `api/routes/tests.py` |
| `GET /api/testStatus` | `test_status` | `api/routes/tests.py` |
| `GET /api/tests/recoverLatest` | `recover_latest_test` | `api/routes/tests.py` |
| `GET /api/expressionAiStatus` | `expression_ai_status` | `api/routes/expression_ai.py` |
| `POST /api/VerifySpeaker` | `verify_speaker` | `api/routes/speaker.py` — **delete module** if route approved for removal |

Prefix all routers with `/api` where applicable; mount in `app/main.py`.

---

## `app/config.py` (suggested contents)

Centralize env reads currently scattered in `server.py` / `MongoDB.py` / `azure_blob.py`:

| Variable area | Examples |
|---------------|----------|
| MongoDB | `MONGODB_URI`, `MONGODB_DB`, `MONGODB_COLLECTION` |
| Azure Blob | `AZURE_STORAGE_*`, container name |
| Gemini | Daily quota limits, model names |
| CORS | Allowed origins (today `*` in middleware) |

Inject `storage` and quota helpers into route dependencies or a small `app/deps.py` if you prefer FastAPI `Depends`.

---

## Phased migration (no logic edits)

### Phase A — Documentation only *(done)*

- [`BACKEND_DEAD_CODE_REPORT.md`](BACKEND_DEAD_CODE_REPORT.md)
- This file

### Phase B — Delete approved dead code

- Items checked in dead-code report approval table
- Update `requirements.txt` if Speechmatics removed

### Phase C — Physical moves (copy-paste, same algorithms)

1. Create `storage/`, move `mongodb.py`, `azure_blob.py`; fix imports in `server.py` first OR jump to `app/main.py`.
2. Create `ai/`, move `models_api.py`, `prompts.py`; replace `import *` with explicit imports.
3. Extract `services/` modules; import from routes.
4. Split `api/routes/` + `schemas.py`.
5. Replace `server.py` with `app/main.py`; keep `server.py` as one-line shim `from app.main import app` temporarily if Render still points at `server:app`.
6. Move dev files to `tools/` / `archive/`.
7. Add root `README.md` with run instructions.

### Phase D — Optional polish

- `.env.example` for new contributors
- Trim `MongoDB.py` to methods actually called
- Rename user-facing log strings to MILI (cosmetic; hostname unchanged)

---

## Monolith note

The largest block is **expression AI** (~500 lines in `_compute_expression_ai_payload` plus background/stale helpers). Keep it in **one service module** initially; only split further (e.g. `impression_builder.py` vs `per_question_scorer.py`) if you need unit tests per stage.

Rubric CSV path today is relative to `server.py` / working directory — when moving to `services/rubric_loader.py`, resolve path from `config` or `Path(__file__).parent` so Render cwd does not break loads.

---

## What stays unchanged (by design)

| Item | Reason |
|------|--------|
| Repo name `seeandsay` | User decision |
| Azure / Mongo key names in documents | Existing data |
| Production URL `seeandsay-backend.onrender.com` | Deployed hostname |
| HTTP paths `/api/...` | Frontend `apiToMongo.js` contract |

---

## Related

- Elimination candidates: [`BACKEND_DEAD_CODE_REPORT.md`](BACKEND_DEAD_CODE_REPORT.md)
- Frontend integration: [`frontend_demo/README.md`](../../frontend_demo/README.md)
