---
name: submission-reliability-422
description: Diagnose and fix end-of-test submission failures (422 Unprocessable Content, missing POST after OPTIONS, aborted fetch), improve reliability when users close/leave the tab, and add high-signal logging around /api/addTestToUser and expression AI background jobs. Use when the user mentions 422, empty tests array, missing test persistence, or “user finished but no results”.
disable-model-invocation: true
---

# Submission reliability + 422

## Scope
- Focus: test persistence and backend acceptance for `POST /api/addTestToUser`.
- Symptoms covered:
  - `tests: []` in Mongo after `createUser`
  - backend logs show `OPTIONS /api/addTestToUser` but no `POST`
  - backend returns `422 Unprocessable Content`
  - big delays / “pending forever” after finish

## Quick triage (fastest signal)
1. Correlate a single attempt across:
   - Browser Network tab: request payload + response code for `/api/addTestToUser`
   - Backend logs: see if `POST /api/addTestToUser` was received
   - Mongo: does a `tests[n]` object exist for that `userId`? does it have `testId`?
2. Classify failure:
   - **No POST (only OPTIONS)** → client aborted / navigated away / network failed.
   - **422** → payload schema mismatch vs `AddTestRequest`.
   - **200 OK but expression AI missing** → background execution/retry/restart/scoring path.

## 422 checklist (FastAPI / Pydantic)
- Confirm `AddTestRequest` required fields match frontend JSON:
  - Ensure required string fields are never `null` (especially `audioFile64`, `timestamps` if typed as `str`).
  - Ensure ints are ints (`ageYears`, `ageMonths`, `userId`).
- Add explicit server-side logging of validation errors (body field name + type) for 422:
  - log `exc.errors()` in a request validation exception handler.
- Optional: accept `audioFile64: Optional[str]` and `timestamps: Optional[str]` on backend if “no recording” is a supported product path, then handle that intentionally in scoring.

## “OPTIONS but no POST” checklist (client abort)
- Confirm whether the client can navigate/close immediately after clicking Finish.
- Add a “Submitting…” blocking UI on finish screen until POST resolves.
- Consider `navigator.sendBeacon` only for small payloads (not base64 audio).
- Add retry on failure:
  - persist a small “pending submission” record in localStorage (testId + minimal data pointers),
  - re-attempt on next page load.

## Background scoring durability checklist
- If scoring runs as in-process background work:
  - restarts will lose progress; treat that as expected until Option B exists.
- Add status fields and timestamps (`queued_at`, `started_at`, `finished_at`, `error`) so the frontend can show actionable state.

## “Superpowers” vs open-source tools
- Prefer “superpowers” (Cursor + repo tools) for:
  - tracing request construction end-to-end (`test.js` → `apiToMongo.js` → `server.py`)
  - diffing payload schema vs Pydantic models
  - adding structured logs and correlating by `testId`
- Prefer open-source tools for:
  - synthetic load (k6 / locust) focused on `/api/addTestToUser`
  - browser automation for “close tab immediately after finish” (Playwright)

