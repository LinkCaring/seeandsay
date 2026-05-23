# Dead-code report (phase 9)

## Removed (user-approved 2026-05-22)

| # | Item | ~Lines removed |
|---|------|----------------|
| 1 | Commented alternate `formatQuestionResultsArray` | 7 |
| 2 | `handleLevelCompletion` | 4 |
| 4 | `transcription` state + `setTranscription` in `testSessionFinish.js` | ~4 |
| A | `downloadRecording` + `downloadTimestamps` + i18n keys | ~65 |

## Still not dead (do not remove)

| # | Item | Notes |
|---|------|--------|
| 3 | `isMobile` useMemo | **Used** at `test.js` for `minImgWidth` — report comment was wrong |
| 5 | `renderExpressionRefreshRecoveryModal` in `test.js` | Thin delegate to `testOverlays.js` — required |

## Modules

| # | Item | Notes |
|---|------|--------|
| 6 | `testExpressionAiPoll.js` | Ensure no duplicate recovery modal export after phase 4 move |
| 7 | Global `AVATAR_INTRO_*` in test.js | Should be gone; use `MiliTestModules` only |

## recording / session

| # | Item | Notes |
|---|------|--------|
| 8 | Legacy base64 upload path in `testSessionFinish` | Still used when blob helpers missing; keep until blob path is mandatory everywhere |

## Orchestrator size

- `test.js` ~3,050 lines; `testQuestionRender.js` ~610 lines; `testOverlays.js` ~480 lines; `testSummaryRender.js` ~1,090 lines.
- Removed ~180 lines unused hint CSS from `test.css` (no matching JS).
- Remaining in orchestrator: state, effects, ctx wiring; optional welcome onboarding copy polish.

## Suggested next extractions (not dead code)

- Comprehension scoring → `testScoring.js` (done)
- Session-complete page → `testSummaryRender.js` (done)
- Age/start/mic-check screens → `testStartScreens.js` (done)
- Global overlays → `testOverlays.js` (done)
- Optional polish: unused hint CSS, welcome copy, question-section JSX slice
