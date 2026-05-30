# MILI (See&Say)

**MILI** (מיל"י) is a browser-based language game for children: onboarding, age-tailored comprehension and expression questions, selectable expression recording strategy (`legacy` or `incremental`), and a results screen with optional AI feedback on expressive answers.

This repository holds the **web demo** (`frontend_demo/`) and the **API** (`backend/`). The git repo is still named `seeandsay`; production API host is `seeandsay-backend.onrender.com`. User-facing branding is **MILI**; storage keys and infra names were kept for compatibility.

---

## Repository map

| Folder | Role |
|--------|------|
| **[`frontend_demo/`](frontend_demo/)** | **Deployable web app** — React (CDN), no bundler; loads via [`index.html`](frontend_demo/index.html). Questions, images, audio, CSS, and all client logic. |
| **[`backend/`](backend/)** | **FastAPI API** — users, tests, Azure session audio, MongoDB, Gemini expression scoring. Entry: `uvicorn server:app`. |
| **[`changes/`](changes/)** | **Engineering log** — dated `CHANGES_*.md` plus [`changes/docs/`](changes/docs/) for historical notes and archived backend audits. |
| **[`.github/`](.github/)** | CI / GitHub Pages workflow (if enabled for your fork). |
| **[`.cursor/`](.cursor/)** | Editor rules and agent skills (optional for contributors). |
| **`docs/plans/`** | Local planning artifacts (not part of runtime). |

**Not in this repo (separate):**

- **Content dashboard** — desktop Tkinter app for editing `query_database.csv` and images; syncs to [seeandsay-resources](https://github.com/almoggiat/seeandsay-resources). Copy updated assets into `frontend_demo/resources/`.
- **Legacy trees** — old `frontend/` copies were removed; deploy **only** `frontend_demo/`.

---

## How the pieces fit together

```mermaid
flowchart LR
  subgraph browser [Browser — frontend_demo]
    UI[MILI UI]
    REC[SessionRecorder]
    SEG[Expression segment recorder + queue]
    API_JS[apiToMongo.js]
  end
  subgraph api [backend — FastAPI]
    SRV[server.py]
    DB[(MongoDB)]
    BLOB[Azure Blob]
    GEM[Gemini]
  end
  CSV[query_database.csv]

  UI --> REC
  UI --> SEG
  UI --> API_JS
  API_JS -->|REST /api/*| SRV
  REC -->|PUT session.mp3 (legacy)| BLOB
  SEG -->|PUT qN segment (incremental)| BLOB
  SRV --> DB
  SRV --> BLOB
  SRV --> GEM
  SRV --> CSV
```

1. **Onboarding** — child profile, consents, mic check → `POST /api/createUser`.
2. **Choose mode at login** — `legacy` (full-session upload at finish) or `incremental` (per-expression uploads during the test).
3. **Test**
   - `legacy`: continuous recording with per-question timestamps.
   - `incremental`: each expression question creates a short segment and queues background upload/scoring.
4. **Finish**
   - `legacy`: `prepareUpload` → upload `session.mp3` → `addTestToUser` with timestamps.
   - `incremental`: enqueue last segment before advance/finish, optional 30s finish retry burst for failed uploads, drain upload queue (up to 60s), then `addTestToUser` metadata-only finalize (always, even when zero segments uploaded); release mic on success; reconcile score counters from deduped results.
5. **Background** — server runs expression AI (Gemini) from full-session slices (`legacy`) or per-question segments (`incremental`). Incremental finalize waits for all expression rows (retries + `processing_failed` fallback), then builds impression; optional SMS when AI is `done`.
6. **Summary** — client polls `GET /api/expressionAiStatus`; summary UI completes only on terminal `done` with full progress (or explicit fallbacks).
7. **SMS results link** — `?t=` / `?results=` opens token results (`MiliResultsView`) without login. Normal app open without a token always lands on welcome/home (stale `localStorage.page === "results"` does not block the game; test resume keys are unchanged).

---

## Quick start (local)

### 1. Frontend

From the **repo root**:

```bash
python -m http.server 8000
```

Open **`http://localhost:8000/frontend_demo/`** (trailing slash matters).

### 2. Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Create backend/.env (MongoDB, Azure SAS, GEMINI_API_KEY — see team)
uvicorn server:app --reload --port 8001
```

On localhost, [`apiToMongo.js`](frontend_demo/js/api/apiToMongo.js) uses port **8001** when the page is served from **8000**.

### 3. Smoke check

- Login → select recording mode (`legacy` or `incremental`) → start test → finish session.
- Legacy network flow: `createUser`, `prepareUpload`, blob PUT (`session.mp3`), `addTestToUser`, `expressionAiStatus`.
- Incremental network flow: `createUser`, repeated `prepareSegmentUpload` + segment blob PUT + `expressionSegment`, then `addTestToUser`, `expressionAiStatus`.

---

## Documentation index

| Area | Start here |
|------|------------|
| **Whole demo (UI)** | [`frontend_demo/README.md`](frontend_demo/README.md) |
| Frontend layout & load order | [`frontend_demo/docs/STRUCTURE.md`](frontend_demo/docs/STRUCTURE.md) |
| Test module map | [`frontend_demo/docs/TEST_MODULE_MAP.md`](frontend_demo/docs/TEST_MODULE_MAP.md) |
| **API** | [`backend/docs/BACKEND_MODULE_MAP.md`](backend/docs/BACKEND_MODULE_MAP.md) |
| Backend layout & rules | [`backend/docs/BACKEND_STRUCTURE.md`](backend/docs/BACKEND_STRUCTURE.md) |
| SMS + token results | [`backend/docs/SMS_RESULTS.md`](backend/docs/SMS_RESULTS.md) |
| Recent engineering changes | [`changes/CHANGES_2026-05-30_30.md`](changes/CHANGES_2026-05-30_30.md) (iOS segment upload retry); [`changes/CHANGES_2026-05-28_28.md`](changes/CHANGES_2026-05-28_28.md) (incremental pipeline, interrupt recovery) |

---

## `frontend_demo/` at a glance

| Path | Purpose |
|------|---------|
| `index.html` | Script load order (treat as public API) |
| `js/app/` | Shell, welcome flow, routing (`home` / `test` / token `results`), `resultsView.js` |
| `js/test/` | Game orchestrator (`test.js`) + modules (`utils/`, `flow/`, `scoring/`, `ui/`, `finish/`) |
| `js/api/` | HTTP client to backend |
| `js/record_session/` | Continuous recorder (loaded via `recording.js`) |
| `resources/` | `query_database.csv`, images, question audio, avatar video |
| `css/screens/` | Per-screen styles |
| `docs/` | Structure, module map, dead-code notes |

Globals use **`Mili*`**; `localStorage` keys still use **`seeandsay*`** so existing saves work.

---

## `backend/` at a glance

| File | Purpose |
|------|---------|
| `server.py` | FastAPI routes, rubric load, expression AI pipeline |
| `MongoDB.py` | Users, tests, `expressionAI`, API quotas |
| `azure_blob.py` | SAS URLs and blob verification for session MP3 |
| `AI_Models_API.py` | Audio slice/decode, Gemini scoring + impression |
| `prompts.py` | Prompt templates for Gemini |
| `requirements.txt` / `runtime.txt` | Dependencies and Python version (e.g. Render) |

Rubrics are read from **`frontend_demo/resources/query_database.csv`** at startup.

---

## Content workflow (educators)

1. Edit questions/media in the **Dashboard** (external app).
2. Sync or copy into **`frontend_demo/resources/`** (CSV + `test_assets/` + `questions_audio/`).
3. Reload the demo in the browser (hard refresh after asset changes).

---

## Deploy notes

| Piece | Typical target |
|-------|----------------|
| Frontend | Static host or GitHub Pages — publish **`frontend_demo/`** contents |
| Backend | Render — `uvicorn server:app`, env vars from `.env` template |
| Secrets | Never commit `backend/.env` |

---

## Incremental expression (May 2026 highlights)

Client footer / `MILI_APP_VERSION`: **5.6**. Login persists `expressionAudioMode` (`legacy` | `incremental`).

| Area | Behavior |
|------|----------|
| During test | Per-question segment recorder + upload queue (3 retries per question, Q-keyed blob retention); 20s countdown freezes during segment upload drain and on segment interrupt |
| Mic / call loss | Incremental-only full-screen interrupt + per-question re-record (blocked after server register); mic probe at timer arm if mic was off during prompt; legacy `recordingInterruptedBanner` unchanged for legacy mode |
| Finish | 30s finish retry burst (failed uploads only), then 60s queue drain, always metadata finalize; `releaseCaptureStream` on incremental success; session score counters reconciled at finish; `clientInfo.segmentUpload` for ops |
| Summary / AI | Expression AI polling and summary gating unchanged — no 30s cap on feedback or impression display |
| Results URL | `?t=` shows SMS results; opening the game without a token does not stick on “results not found” |

Details and QA notes: [`changes/CHANGES_2026-05-30_30.md`](changes/CHANGES_2026-05-30_30.md).

---

## Conventions

- **Changelog:** append to the active `changes/CHANGES_YYYY-MM-DD_MM-DD.md` when behavior changes.
- **API contract:** keep `/api/...` paths in sync with `frontend_demo/js/api/apiToMongo.js`.
- **Scope:** prefer small, focused diffs; question-only or docs-only PRs when possible.

---

## License & contact

Educational / research project. Credentials and `.env` values are shared privately by the team.
