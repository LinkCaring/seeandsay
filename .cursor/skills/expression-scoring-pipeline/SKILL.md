---
name: expression-scoring-pipeline
description: Build and operate an expression-question scoring pipeline using timestamps, audio segmentation, LLM prompting, validation, and aggregation. Use when implementing or refining automatic expression scoring.
---

# Expression Scoring Pipeline

## Purpose
Use this skill to implement reliable scoring for expression questions from recorded session audio and timestamps.

## When To Use
- User asks to score expression block automatically.
- Team is adding Gemini-based evaluation.
- Need prompt/schema validation and confidence-aware fallback.
- Need scaling plan with async job processing.

## Required Inputs
1. Expression question IDs in session order.
2. Question start/end timestamps.
3. Session audio blob or URL.
4. Scoring rubric (numeric scale and criteria).
5. Output contract expected by frontend/backend.

## Pipeline Steps
1. Extract expression-only windows from timestamps.
2. Slice/prepare audio per expression question.
3. Build strict scoring prompt with rubric and expected JSON output.
4. Send to model.
5. Validate response against schema.
6. Persist per-question results with confidence and flags.
7. Aggregate to block-level score.
8. Return structured result object to client.

## Prompting Rules
- Use low temperature for scoring consistency (for example 0.1-0.3).
- Force strict JSON output only.
- Provide explicit rubric dimensions:
  - relevance
  - linguistic richness
  - clarity/intelligibility
  - completeness
- Require uncertainty flags:
  - `low_audio`
  - `off_topic`
  - `unclear_response`
  - `needs_manual_review`

## Response Schema (Minimum)
```json
{
  "question_id": "string",
  "score": 0,
  "confidence": 0.0,
  "reason_short": "string",
  "flags": []
}
```

## Expressive-language impression (post-block, single multimodal call)
After per-question 0/1/2 scoring finishes, run **one** additional Gemini call: a text block of **all** comprehension results from `full_array` (correct/partly/wrong + `category_PLS` / `sub_category_PLS` from server CSV, no hints/goals) plus **up to 10** randomly chosen expression windows with audio. Expression samples include Hebrew question text and CSV hints (`category_PLS`, `sub_category_PLS`, `test goal`, `comments`, `hint`).

- **Purpose:** Careful parent-facing **impression** of expressive language (not diagnosis, not per-item grades). Hebrew instructions + structured JSON output.
- **Output schema** (see `backend/AI_Models_API.py` — `summarize_expressive_language_impression_gemini`): `summary_paragraph_he`, `sample_count_used`, `data_quality`, `observed_strengths`, `observed_challenges`, `phonology_separate_note_he`, `limitations_he`.
- **Token cap:** `GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS` (default 500).
- **Quota:** separate daily key `gemini_expressive_language_impression` (`GEMINI_IMPRESSION_DAILY_LIMIT`, default 200).
- **Persistence:** stored on the test document under `expressionAI.expressive_language_impression`; surfaced on the session summary screen when `status === "done"`.

## Validation And Safety
- Reject non-JSON outputs.
- Reject invalid ranges (`score`, `confidence`).
- If validation fails:
  1. Retry once with same input.
  2. If still invalid, mark as `needs_manual_review`.
- Keep raw model output for debugging (secure storage only).

## Aggregation Template
- Compute weighted average across expression questions.
- Discount low-confidence answers if required by policy.
- Return:
  - per-question scores
  - block score
  - confidence summary
  - quality flags

## Scaling Guidance
- Start with synchronous calls for small internal testing.
- For production scale, prefer async jobs with queue + worker:
  - enqueue request
  - process in worker
  - store results
  - poll/get status endpoint
- Add retry/backoff and dead-letter handling.

## Observability Checklist
- Track latency per request.
- Track model validation failures.
- Track retry rates and final fallback rates.
- Track score distribution drift over time.

## Common Pitfalls
- Mixing comprehension and expression timestamps.
- Accepting unvalidated free-text model responses.
- Overusing high temperature in scoring tasks.
- No fallback path when model output is malformed.
- **Python 3.13+:** stdlib `audioop` removed — pydub fails unless **`audioop-lts`** is installed (see `backend/requirements.txt`). Logs show `pydub is unavailable: No module named 'pyaudioop'` before any FFmpeg issue.
- **Linux/deploy:** FFmpeg must be on `PATH` for pydub to decode/export many formats (separate from pip).

## Current Repo Checkpoint
- Gemini expression scoring is integrated in `backend/server.py` under `/api/addTestToUser`.
- CSV rubric fields in use: `expected_full`, `expected_partial`, `expected_wrong`, plus optional `category_PLS`, `sub_category_PLS`, `test goal`, `comments`, `hint` for impression context.
- Daily and window guardrails are active through:
  - `GEMINI_DAILY_LIMIT` (default `100` in code)
  - `GEMINI_MAX_SEGMENT_SECONDS` (default `30`)
- After 0/1/2 scoring, **expressive-language impression** runs in the same background job (audio pool built from successful slices before the per-question scoring quota gate so slices stay available even if scoring quota is exhausted).
- Audio is now sliced by question timestamp window before Gemini scoring:
  1. Decode session base64 once.
  2. Resolve `[start, end)` per expression question from timestamps.
  3. Slice to per-question MP3 bytes.
  4. Send only sliced bytes to Gemini.
- New fallback reasons used in per-question results:
  - `missing_timestamp_start`
  - `audio_decode_failed`
  - `audio_slice_failed`
  - plus existing guardrail reasons (`quota_exceeded`, `segment_too_long`, etc.).

## Pause/Resume Recovery Notes
- If you need to temporarily pause this feature, do not remove persisted `expressionAI` payloads in Mongo.
- To troubleshoot quickly after a break:
  1. Verify `pydub` + (on 3.13+) `audioop-lts` are installed and ffmpeg is available on server runtime.
  2. Confirm timestamps format from frontend is still `[(q,t), ...]`.
  3. Run one test and inspect `expression_ai.per_question` flags for slice/decode issues.
  4. Keep legacy headlight scoring active while tuning Gemini behavior.

