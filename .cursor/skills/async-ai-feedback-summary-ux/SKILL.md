---
name: async-ai-feedback-summary-ux
description: Design and implement the session summary screen and async AI feedback UX, including “pending” state, polling, PDF-first presentation, and clear failure/retry paths. Use when working on summary UI design, expression AI pending/done/failed flows, or exporting results (PDF).
disable-model-invocation: true
---

# Async AI feedback + summary UX

## Goals
- Summary screen is useful immediately after completion.
- AI feedback appears later without confusing the user.
- System is resilient to:
  - user closing the tab,
  - backend restarts,
  - Gemini 503 spikes,
  - long scoring times.

## Required states (minimum)
- `pending`: show “AI feedback is being prepared” + last update time.
- `done`: show AI aggregates + per-question table + impression paragraph.
- `failed`: show “AI feedback unavailable” + reason + retry guidance.
- `skipped`: show “AI feedback not available for this session” (missing audio/timestamps).

## UI rules
- Never block the user from seeing comprehension results.
- When AI is pending, show one compact, non-clickable placeholder (avoid many empty tables).
- Provide a manual “Refresh AI results” action and/or automatic polling with backoff.

## PDF-first strategy
- Generate PDF from the final `expression_ai` payload (client-side or server-side).
- While pending, let user download a “basic summary” PDF (no AI) and later a “full summary” PDF.

## Implementation checkpoints
- Ensure `testId` is persisted and used for polling.
- Ensure backend payload always includes:
  - `status`, `started_at`, and either `finished_at` or `error`.

## “Superpowers” vs open-source tools
- Prefer “superpowers” for:
  - iterating on UX quickly inside the repo (React + CSS)
  - keeping payload shapes stable across frontend/backend
- Prefer open-source tools for:
  - PDF generation (e.g. `pdf-lib`, `jspdf`, or server-side reportlab) depending on constraints

