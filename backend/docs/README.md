# Backend documentation

Active references for the running API (May 2026):

| Document | Purpose |
|----------|---------|
| [BACKEND_MODULE_MAP.md](BACKEND_MODULE_MAP.md) | **Start here** — files, live routes, request flow, `server.py` regions |
| [BACKEND_STRUCTURE.md](BACKEND_STRUCTURE.md) | Folder layout and change rules |

## Recording modes (frontend choice, backend behavior)

The frontend sends `clientInfo.expressionAudioMode` from login (`legacy` or `incremental`), and backend finalization/scoring behavior branches by that mode:

- **`legacy`**
  - Test keeps continuous recording and question timestamps.
  - Finish flow uses `POST /api/tests/prepareUpload` + blob PUT (`session.mp3`) + `POST /api/addTestToUser`.
  - Expression AI runs from full-session audio slices.

- **`incremental`**
  - Expression questions upload short per-question audio segments during the test.
  - Segment flow uses `POST /api/tests/prepareSegmentUpload` + blob PUT + `POST /api/tests/expressionSegment` (idempotent per-question upsert in Mongo).
  - Client retries failed segment uploads up to 3 times per question; `clientInfo.segmentUpload` at finalize records per-question upload state for ops.
  - Draft shell tests can be created early; segments merge on finalize.
  - Finish still calls `POST /api/addTestToUser` but does **metadata-only** finalize (no full session blob required).
  - Before impression build, `_ensure_incremental_expression_rows_complete` waits for all expression rows (`retrying_missing` phase), with configurable retries and `processing_failed` fallback (`ai_score` 1) when scoring cannot complete.
  - Progress reports full `total_questions` only after all rows exist; results SMS sends on incremental finalize completion when a parent phone is on file.
  - Public results: `GET /api/results/by-token?t=...` (410 when expired).

**Optional env (incremental scoring):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `INCREMENTAL_SCORE_RETRY_ATTEMPTS` | `5` | Retries while expression rows are missing at finalize |
| `INCREMENTAL_SCORE_RETRY_DELAY_SEC` | `2` | Delay between retries |

See [BACKEND_MODULE_MAP.md](BACKEND_MODULE_MAP.md) for route-level details and `server.py` ownership. Frontend upload retry and finish recovery: [`../../changes/CHANGES_2026-05-30_30.md`](../../changes/CHANGES_2026-05-30_30.md). Prior incremental work: [`../../changes/CHANGES_2026-05-28_28.md`](../../changes/CHANGES_2026-05-28_28.md).

**Run locally:** from `backend/`, activate venv, set `.env`, then:

```bash
uvicorn server:app --reload --port 8001
```

**Historical / planning** (cleanup already applied; optional reading):

- [changes/docs/BACKEND_DEAD_CODE_REPORT.md](../../changes/docs/BACKEND_DEAD_CODE_REPORT.md)
- [changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md](../../changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md)
