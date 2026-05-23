# MILI — backend layout

Single-process FastAPI app. Full map: [BACKEND_MODULE_MAP.md](./BACKEND_MODULE_MAP.md).

## Layout

```
backend/
  server.py              # Entry: routes + expression AI orchestration
  MongoDB.py             # User/test persistence
  azure_blob.py          # Session MP3 upload (SAS)
  AI_Models_API.py       # Gemini + audio helpers
  prompts.py             # LLM prompt strings
  requirements.txt
  runtime.txt
  .env                   # Local secrets (gitignored)

  docs/
    README.md            # This index
    BACKEND_MODULE_MAP.md
    BACKEND_STRUCTURE.md
```

## Rules

1. **Demo contract** — `/api/...` paths must stay compatible with [`frontend_demo/js/api/apiToMongo.js`](../../frontend_demo/js/api/apiToMongo.js) unless the frontend changes in the same PR.
2. **Audio** — primary path: `prepareUpload` → browser PUT to Azure → `addTestToUser` with `audioBlobPath`; `audioFile64` is legacy fallback.
3. **Expression AI** — queued from `add_test` via `BackgroundTasks`; client polls `expressionAiStatus`.
4. **Changelog** — behavior or route changes go in [`changes/CHANGES_*.md`](../../changes/).

## Related

- Frontend: [`frontend_demo/docs/STRUCTURE.md`](../../frontend_demo/docs/STRUCTURE.md)
- Repo overview: [`README.md`](../../README.md)
