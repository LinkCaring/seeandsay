# Backend documentation

Active references for the running API (May 2026):

| Document | Purpose |
|----------|---------|
| [BACKEND_MODULE_MAP.md](BACKEND_MODULE_MAP.md) | **Start here** — files, live routes, request flow, `server.py` regions |
| [BACKEND_STRUCTURE.md](BACKEND_STRUCTURE.md) | Folder layout and change rules |

**Run locally:** from `backend/`, activate venv, set `.env`, then:

```bash
uvicorn server:app --reload --port 8001
```

**Historical / planning** (cleanup already applied; optional reading):

- [changes/docs/BACKEND_DEAD_CODE_REPORT.md](../../changes/docs/BACKEND_DEAD_CODE_REPORT.md)
- [changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md](../../changes/docs/BACKEND_STRUCTURE_RECOMMENDATION.md)
