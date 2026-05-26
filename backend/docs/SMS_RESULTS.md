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
- Results: `?t={token}` opens `MiliResultsView` without session storage.

## Phase 4 (your step)

Add the four `SMS_*` values and `MILI_PUBLIC_BASE_URL` to `backend/.env` locally and on Render, then run a full test with your mobile number.
