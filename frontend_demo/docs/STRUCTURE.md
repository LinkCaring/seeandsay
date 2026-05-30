# MILI — frontend_demo structure

No bundler — scripts load via [index.html](../index.html) in dependency order. Paths to `resources/` and `css/` are always relative to **`frontend_demo/`** (where `index.html` lives).

## Layout

```
frontend_demo/
  index.html                 # Entry + script load order
  expressionTiming.js        # window.MILI_EXPRESSION_ANSWER_MS
  recording.js               # SessionRecorder facade (loads js/record_session/*)
  tools/                     # Mechanical extract build scripts
  css/screens/               # Per-screen styles
  resources/                 # CSV, images, audio, avatar video
  docs/                      # TEST_MODULE_MAP, STRUCTURE, DEAD_CODE_REPORT

  js/
    app/                     # Shell + welcome flow + resultsView.js (token ?t=)
    api/                     # apiToMongo.js
    core/                    # i18n, ImageLoader
    components/              # navbar, help
    record_session/          # Session recorder + expressionSegmentRecorder.js (incremental)
    test/
      test.js                # Test() orchestrator (~3.5k lines)
      utils/                 # Pure helpers
      flow/                  # Timers, mic, intros, question load
      scoring/               # Comprehension scoring
      expression/            # expressionSegmentUploadQueue.js (incremental)
      ui/                    # Pause/AFK, overlays (incl. incremental interrupt), summary
      finish/                # Session complete, expression AI poll, incremental drain + finish retry burst
```

## Global namespaces

| Global | Source |
|--------|--------|
| `window.MiliTestModules` | `js/test/**` factories + helpers |
| `window.MiliRecordingParts` | `js/record_session/*` |
| `window.SessionRecorder` | `recording.js` facade |
| `window.MiliTestRun` | `js/app/app.js` |
| `window.MiliTestSession` | `js/api/apiToMongo.js` |
| `window.I18N` | `js/core/i18n.js` |
| `window.AppNavbar` | `js/components/navbar.js` |
| `ImageLoader` | `js/core/loader.js` |

## Welcome / login

`welcome.js` orchestrates screens `screen1`, `screen2_login`, `screen1_video`, `screen3`. Screen bodies and login live in `welcomeScreens.js` / `welcomeLogin.js`; resume/tips modals in `welcomeShared.js`.

Historical UX notes: `changes/docs/FRONTEND_DEMO_CHANGELOG.md`.

## Rules

1. **Folder moves** only change `index.html` script paths; not `resources/` URLs inside JS.
2. **Load order** in `index.html` is part of the public API (see `TEST_MODULE_MAP.md`).
3. Behavior changes need explicit approval; update `changes/CHANGES_*.md`.

## Backend (separate)

Flat FastAPI layout today — see [`backend/docs/BACKEND_MODULE_MAP.md`](../../backend/docs/BACKEND_MODULE_MAP.md).
