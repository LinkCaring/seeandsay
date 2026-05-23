# Backend dead code report

> **Archived** (May 2026) — Tier 1–2 cleanup is done. For the current backend, use [`backend/docs/BACKEND_MODULE_MAP.md`](../../backend/docs/BACKEND_MODULE_MAP.md).

Audit date: May 2026. **Tier 1 + Tier 2 applied** (May 2026). Kept by request: `audioFile64`, `score_expression_with_gemini`.

**Source of truth for “in use”:** [`frontend_demo/js/api/apiToMongo.js`](../../frontend_demo/js/api/apiToMongo.js) and call sites in [`testSessionFinish.js`](../../frontend_demo/js/test/finish/testSessionFinish.js) / [`test.js`](../../frontend_demo/js/test/test.js).

**Active runtime entry:** [`backend/server.py`](../server.py) (~1,150 lines) — imports [`MongoDB.py`](../MongoDB.py), [`azure_blob.py`](../azure_blob.py), [`AI_Models_API.py`](../AI_Models_API.py) (`import *`), [`prompts.py`](../prompts.py).

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| API routes used by MILI demo | 7 (+ Azure PUT via SAS) | Keep |
| API routes unused by demo | 0 live | VerifySpeaker removed (Tier 2) |
| Whole files not in request path | 4 | Archive or keep as dev tools |
| `MongoDB.py` methods unused by server | 7 | Trim after approval |
| `AI_Models_API.py` symbols unused by expression pipeline | Several | Trim with VerifySpeaker decision |
| Legacy fallbacks still intentional | 2 | Keep until blob-only is guaranteed |

---

## 1. Frontend → backend API matrix

| Frontend function | HTTP | Backend handler | Demo usage |
|-------------------|------|-----------------|------------|
| `createUser` | `POST /api/createUser` | `create_user` | Welcome login |
| `prepareAudioUpload` | `POST /api/tests/prepareUpload` | `prepare_upload` | Session finish — SAS URL |
| `putSessionAudioToBlob` | `PUT` to Azure URL | *(not FastAPI)* | Session finish — uses [`azure_blob.py`](../azure_blob.py) |
| `updateUserTests` | `POST /api/addTestToUser` | `add_test` | Session finish — scores + triggers background AI |
| `getExpressionAiStatus` | `GET /api/expressionAiStatus` | `expression_ai_status` | Summary screen poll |
| `recoverLatestTest` | `GET /api/tests/recoverLatest` | `recover_latest_test` | Manual recover after upload failure |
| `getTestStatus` | `GET /api/testStatus` | `test_status` | Auto-recover when upload failed but test exists server-side |
| — | ~~`POST /api/VerifySpeaker`~~ | — | **Removed** (Tier 2) |
| — | `GET /api/getUser/{id}` | *(commented out)* | **Not exposed** |

**Health:** `GET /` — not called from demo; useful for deploy checks. **Keep.**

---

## 2. Whole files

| File | In runtime server? | Recommendation | Approval |
|------|-------------------|----------------|----------|
| [`server.py`](../server.py) | Yes — main app | Keep; split per [`BACKEND_STRUCTURE_RECOMMENDATION.md`](BACKEND_STRUCTURE_RECOMMENDATION.md) | — |
| [`MongoDB.py`](../MongoDB.py) | Yes — imported | Keep; trim unused methods | Partial |
| [`azure_blob.py`](../azure_blob.py) | Yes | Keep | — |
| [`AI_Models_API.py`](../AI_Models_API.py) | Yes — `import *` | Keep; replace star import; trim dead symbols | Partial |
| [`prompts.py`](../prompts.py) | Yes — via AI_Models_API | Keep | — |
| [`requirements.txt`](../requirements.txt) | Deploy | Keep; drop `speechmatics-python` if VerifySpeaker removed | Partial |
| [`runtime.txt`](../runtime.txt) | Deploy | Keep | — |
| ~~`testings.py`~~ | — | **Deleted** (Tier 1) | [x] |
| ~~`TTS_Google.py`~~ / ~~`tools/tts_generate_audio.py`~~ | — | Tier 1 move, then **deleted** with `tools/` | [x] |
| ~~`Explaintion`~~ | — | **Deleted** (Tier 1) | [x] |
| ~~`tools/blob_smoke_phase_a.py`~~ | — | **Deleted** with `tools/` folder | [x] |
| ~~`tools/tts_generate_audio.py`~~ | — | **Deleted** with `tools/` folder | [x] |

---

## 3. `server.py` — routes and models

### Routes — elimination candidates

| Item | Lines (approx) | Evidence | Approval |
|------|----------------|----------|----------|
| `POST /api/VerifySpeaker` + `verify_speaker` | 1106–1129 | No frontend client; old reading-verify flow removed from demo | [ ] |
| `SpeakerVerificationRequest` model | 455–458 | Only used by VerifySpeaker | [ ] |
| Commented `GET /api/getUser/{user_id}` | — | **Removed** (Tier 1) | [x] |
| `GetFinalTranscriptionRequest` model | — | **Removed** (Tier 1) | [x] |

### Imports / stubs — document only

| Item | Notes | Approval |
|------|-------|----------|
| `UploadFile` import | — | **Removed** (Tier 1) | [x] |
| `updated_transcription` in `add_test` | Always `"None"`; not populated by Speechmatics in current flow | [ ] keep field for API compat |
| Home message `"See&Say FastAPI backend"` | Cosmetic; could say MILI | [ ] optional |

### `server.py` — functions (all used unless noted)

| Function group | Lines (approx) | Used by |
|----------------|----------------|---------|
| `_csv_row_to_rubric`, `_load_question_rubrics` | 57–120 | Expression AI (CSV rubrics) |
| `_parse_*`, `_timestamp_*` | 126–308 | `add_test` background AI |
| `_aggregate_expression_ai`, `_build_parent_ai_comparison`, `_build_pending_expression_ai_payload` | 310–388 | Expression AI payloads |
| Route handlers | 466–1100 | HTTP API |
| `_compute_expression_ai_payload` | 587–895 | Background expression scoring |
| `_build_failed_expression_ai_payload`, `_finalize_stuck_pending_expression_ai`, `_expression_ai_payload_is_terminal` | 896–955 | AI error / stale handling |
| `_run_expression_ai_background`, `_maybe_finalize_stale_building_impression` | 956–1060 | BackgroundTasks |

---

## 4. `MongoDB.py` — method usage

**Called from `server.py` today:**

| Method | Used by |
|--------|---------|
| `add_user` | `create_user` |
| `get_user_test_by_id` | `add_test`, `test_status`, idempotent retry |
| `get_latest_user_test` | `recover_latest_test` |
| `add_test_to_user` | `add_test` |
| `update_test_expression_ai` | Expression AI background + stale finalize |
| `get_test_expression_ai` | `expression_ai_status`, stale checks |
| `check_and_increment_daily_quota` | Gemini / impression quotas in `_compute_expression_ai_payload` |

**Not called from `server.py` (candidates to remove after approval):**

| Method | Lines (approx) | Why orphan | Approval |
|--------|----------------|------------|----------|
| ~~`get_user_config`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`get_latest_test`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`get_active_users`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`deactivate_user`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`get_all_users`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`get_stats`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`get_user_audioFile_from_64base`~~ | — | **Removed** (Tier 1) | [x] |
| ~~`create_storage`~~ | — | **Removed** (Tier 1) | [x] |

**Risk:** Deleting admin methods is safe for the demo API. Fixing `user_id` vs `userId` inconsistency is a **separate** migration task — do not “fix” and delete in one step without review.

---

## 5. `AI_Models_API.py` — symbol usage

**Used by expression AI pipeline (`server.py` → `_compute_expression_ai_payload`):**

| Symbol | Role |
|--------|------|
| `decode_base64_to_bytes` | Legacy audio path |
| `slice_audio_window_bytes` | Per-question audio windows |
| `score_expression_with_gemini_bytes` | Per-question Gemini score |
| `summarize_expressive_language_impression_gemini` | Session impression (Hebrew narrative) |

**Used only if `VerifySpeaker` is kept:**

| Symbol | Role |
|--------|------|
| `speaker_verification` | VerifySpeaker endpoint |
| `speechmatics_runner_from_bytes` | Inside `speaker_verification` |
| `speaker_recognition` | Inside `speaker_verification` |

**Candidates to remove (after approval / if VerifySpeaker removed):**

| Symbol | Notes | Approval |
|--------|-------|----------|
| ~~Commented `openai_whisper_runner` / `openai_llm_runner`~~ | — | **Removed** (Tier 1) | [x] |
| `score_expression_with_gemini` | Wrapper; kept per request — may be used later | — keep |
| `openAI_client` / OpenAI import | Only for commented whisper/llm | [ ] if OpenAI unused |

**Dependency note:** Removing VerifySpeaker allows removing **`speechmatics-python`** from [`requirements.txt`](../requirements.txt) if nothing else needs it.

---

## 6. `azure_blob.py`

All exported helpers are used:

| Symbol | Used by |
|--------|---------|
| `is_configured` | `prepare_upload`, `add_test` |
| `session_blob_path` | `prepare_upload` |
| `build_upload_url` | `prepare_upload` |
| `verify_blob_exists` | `add_test` when `audioBlobPath` set |

**Keep entire module.**

---

## 7. `prompts.py`

Imported only by `AI_Models_API.py` for Gemini prompts. **Keep.**

---

## 8. Legacy paths (not dead — keep for now)

| Path | Frontend | Backend | Notes |
|------|----------|---------|-------|
| `audioBlobPath` + SAS PUT | Primary finish upload | `prepare_upload` + `verify_blob_exists` | Production path |
| `audioFile64` base64 in `updateUserTests` | Fallback in `testSessionFinish.js` if blob helpers missing | `add_test`, `_compute_expression_ai_payload` | Do not remove until demo always uses blob and no other API clients send base64 |

---

## 9. Master approval checklist

Do not delete until you check each row.

| # | Item | Approved |
|---|------|----------|
| 1 | Remove `POST /api/VerifySpeaker` + `SpeakerVerificationRequest` | [x] Tier 2 |
| 2 | Remove commented `get_user` route block | [ ] |
| 3 | Remove `GetFinalTranscriptionRequest` model | [x] Tier 1 |
| 4 | Remove `UploadFile` import from `server.py` | [x] Tier 1 |
| 5 | Archive/delete `testings.py` | [x] Tier 1 |
| 6 | Archive/delete `Explaintion` | [x] Tier 1 |
| 7 | Move `TTS_Google.py` to `tools/` or archive | [x] Tier 1 → `tools/tts_generate_audio.py` |
| 8 | Trim unused `MongoDB.py` methods (§4 table) | [x] Tier 1 |
| 9 | Trim dead symbols in `AI_Models_API.py` (§5 table) | [x] Tier 1 (commented OpenAI runners only; kept `score_expression_with_gemini`) |
| 10 | Remove `speechmatics-python` from requirements (only if #1 approved) | [x] Tier 2 |
| 11 | Remove `audioFile64` backend path (only after frontend blob-only + no other clients) | [ ] |

---

## 10. Risks and assumptions

1. **`import *` from `AI_Models_API`** — hides real dependencies; any refactor should use explicit imports ([`BACKEND_STRUCTURE_RECOMMENDATION.md`](BACKEND_STRUCTURE_RECOMMENDATION.md)).
2. **Other API consumers** — audit assumes only `frontend_demo` hits this backend. If mobile, Postman, or old builds still call VerifySpeaker or base64-only, keep those paths.
3. **MongoDB field names** — `userId` is canonical for live paths; older methods using `user_id` / `team_id` are likely broken even if revived.
4. **Production hostname** — `seeandsay-backend.onrender.com` in `apiToMongo.js` is infrastructure, not renamed in this audit.

---

## Related

- Future layout: [`BACKEND_STRUCTURE_RECOMMENDATION.md`](BACKEND_STRUCTURE_RECOMMENDATION.md)
- Frontend API client: [`frontend_demo/js/api/apiToMongo.js`](../../frontend_demo/js/api/apiToMongo.js)
- Running changelog: [`changes/CHANGES_2026-05-21_22-05.md`](../../changes/CHANGES_2026-05-21_22-05.md)
