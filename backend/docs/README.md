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
  - Segment flow uses `POST /api/tests/prepareSegmentUpload` + blob PUT + `POST /api/tests/expressionSegment`.
  - Finish still calls `POST /api/addTestToUser` but does metadata-only finalize (no full session blob required), then impression is finalized after all segment rows are scored.

See [BACKEND_MODULE_MAP.md](BACKEND_MODULE_MAP.md) for route-level details and `server.py` ownership.

**Run locally:** from `backend/`, activate venv, set `.env`, then:

```bash
uvicorn server:app --reload --port 8001
```

**Historical / planning** (cleanup already applied; optional reading):

- [changes/docs/BACKEND_DEAD_CODE_REPORT.md](../../changes/docs/BACKEND_DEAD_CODE_REPORT.md)
- [changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md](../../changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md)
