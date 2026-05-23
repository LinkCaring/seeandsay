# App shell & welcome (`js/app/`)

| File | Role |
|------|------|
| `app.js` | Root `App()` — routing (`page`), CSV load, `usePersistentState`, `MiliTestRun`, mounts `Welcome` / `Test` |
| `welcomeShared.js` | i18n, localStorage helpers, resume/tips modals (`MiliWelcomeModules`) |
| `welcomeLogin.js` | Login step: child profile, legal, mic gate, `createUser` |
| `welcomeScreens.js` | Intro screen, intro video, how-it-works + start game |
| `welcome.js` | Welcome orchestrator: nav, screen order, video autoplay effects |

**Load order:** `welcomeShared.js` → `welcomeLogin.js` → `welcomeScreens.js` → `welcome.js` (after `app.js` in `index.html`).

**Asset paths** (`resources/…`, `css/…`) stay relative to `frontend_demo/index.html`, not this folder.

Historical onboarding notes: [`changes/docs/FRONTEND_DEMO_CHANGELOG.md`](../../../changes/docs/FRONTEND_DEMO_CHANGELOG.md).

See [`docs/STRUCTURE.md`](../../docs/STRUCTURE.md).
