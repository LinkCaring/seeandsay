# App shell & welcome (`js/app/`)

| File | Role |
|------|------|
| `app.js` | Root `App()` — `useAppPageState()` routing (`home` / `test` / `results`), CSV load, `MiliTestRun`, mounts `Welcome` / `Test` / `MiliResultsView` |
| `resultsView.js` | Public results by token (`?t=` / `?results=`); `getResultsByToken` |
| `welcomeShared.js` | i18n, localStorage helpers, resume/tips modals (`MiliWelcomeModules`) |
| `welcomeLogin.js` | Login step: child profile, legal, mic gate, `createUser` |
| `welcomeScreens.js` | Intro screen, intro video, how-it-works + start game |
| `welcome.js` | Welcome orchestrator: nav, screen order, video autoplay effects |

**Load order:** `resultsView.js` → `app.js` → `welcomeShared.js` → `welcomeLogin.js` → `welcomeScreens.js` → `welcome.js` (see `index.html`).

**Routing (`page` key):**

- `getResultsTokenFromUrl()` reads `?t=` or `?results=`.
- `getInitialAppPage()` — token in URL → `results`; otherwise never restore persisted `"results"` (maps to `home`).
- `useAppPageState()` persists `page` without sticking on results without a token.
- `reconcileResultsPageRouting` (mount effect) — token present → `results`; on results without token → `home`.

Test resume uses **other** `localStorage` keys (see `DEMO_TEST_RUN_LS_KEYS` in `app.js`); fixing results routing does not clear them.

**Asset paths** (`resources/…`, `css/…`) stay relative to `frontend_demo/index.html`, not this folder.

**Changelog:** [`../../../changes/CHANGES_2026-05-28_28.md`](../../../changes/CHANGES_2026-05-28_28.md).

Historical onboarding notes: [`changes/docs/FRONTEND_DEMO_CHANGELOG.md`](../../../changes/docs/FRONTEND_DEMO_CHANGELOG.md).

See [`docs/STRUCTURE.md`](../../docs/STRUCTURE.md).
