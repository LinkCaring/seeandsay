# SMS results notification

When a parent enters an optional phone at login, the backend sends an SMS after expression AI completes (`status: done`). The message contains a token link valid for **7 days**.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SMS_KEY` | For SMS | sms4free API key |
| `SMS_USER` | For SMS | sms4free user |
| `SMS_PASS` | For SMS | sms4free password |
| `SMS_SENDER` | For SMS | Sender name/number |
| `MILI_PUBLIC_BASE_URL` | For SMS links | Frontend base URL, no trailing path issues — e.g. `http://localhost:8000/frontend_demo/` or `https://seeandsay.onrender.com/` |
| `RESULTS_TOKEN_TTL_DAYS` | No | Default `7` |

If SMS credentials are missing, AI still completes; sends are skipped (logged).

## API

- `POST /api/createUser` — optional `parentPhone`; duplicate user updates phone when provided.
- `PATCH /api/user/parentPhone` — `{ userId, parentPhone }`.
- `GET /api/results/by-token?t=...` — public results (no `userId`); `410` when expired.

## Frontend

- Login: optional phone field.
- Summary: SMS notice when phone was saved.
- Results: `?t={token}` or `?results={token}` opens `MiliResultsView` without session storage.
- **Routing (May 2026):** The shell only stays on the results page while the URL includes a token. Opening the normal game URL without `?t=` routes to welcome/home even if `localStorage.page` was previously `"results"` — this avoids showing “התוצאות לא נמצאו” on a normal app open. Mid-test resume keys (`currentIndex`, `questionResults`, …) are **not** cleared; users can alternate SMS link and home freely.
- **Errors on the results URL:** missing/invalid token → “התוצאות לא נמצאו”; expired token → “פג תוקף הקישור” (HTTP 410).

## Phase 4 (your step)

Add the four `SMS_*` values and `MILI_PUBLIC_BASE_URL` to `backend/.env` locally and on Render, then run a full test with your mobile number.
