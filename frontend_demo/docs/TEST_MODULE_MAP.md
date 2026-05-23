# test.js module map

Refactor status: modules under [`frontend_demo/js/`](../js/) — `app/`, `api/`, `core/`, `components/`, `record_session/`, `test/` (with `utils/`, `flow/`, `scoring/`, `ui/`, `finish/`). Orchestrator: [`js/test/test.js`](../js/test/test.js) (~3.1k lines).  
Load order: [index.html](../index.html). Wider layout: [STRUCTURE.md](./STRUCTURE.md). Dead code: [DEAD_CODE_REPORT.md](./DEAD_CODE_REPORT.md).

## External dependencies

| Global | Source | Used for |
|--------|--------|----------|
| `React` | CDN | UI |
| `SessionRecorder` | recording.js | Mic, MP3, timestamps, 12:30 cap |
| `ImageLoader` | js/core/loader.js | Question images |
| `prepareAudioUpload`, `putSessionAudioToBlob`, `updateUserTests`, … | js/api/apiToMongo.js | Finish upload |
| `MiliTestSession` | js/api/apiToMongo.js | testId identity |
| `MiliTestRun` | js/app/app.js | Resume / fresh start |
| `AppNavbar` | js/components/navbar.js | Test navbar |
| `window.MILI_EXPRESSION_ANSWER_MS` | expressionTiming.js | 20s expression window |
| `usePersistentState` | (app/loader) | localStorage-backed state |

## Line regions (original test.js ~6393)

| Lines (approx) | Module | Goal |
|----------------|--------|------|
| 1–82 | testAvatarVideo.js | WebM/MP4 intro fallback |
| 96–100, flags | testConstants.js | Expression timing flags |
| 1138–1377 (pure age) | testAgeUtils.js | Age math, badges, adaptive gate |
| 1197–1213, 3229–3300 | testQuestionUtils.js | Question type labels, format results, load CSV list |
| 140–216 | testExpressionTimers.js | Eval countdown, answer-end marks |
| 319–408, 1703–1731, 1237–1281 | testMicIntro.js | Mic check, compr/exp intro navigation |
| ~2905–3050 | testStartScreens.js | Age invalid, mic gate UI, compr/exp intro video, preparing recording |
| 2284–2831 (was) | testScoring.js | Comprehension clicks, auto-score, `handleContinue`, traffic beeps |
| 2190–3223 | testPauseAfk.js | Pause, AFK, expression traffic choice |
| 3333–3570, 3224+ flow | testQuestionFlow.js | loadQuestion, index, question reset |
| 3575–3852 | testSessionFinish.js | completeSession, upload, AI poll hooks |
| 3550–3569, 4264+ | testExpressionAiPoll.js | Recovery, refresh modal |
| 4020–4250, 4733+ | testOverlays.js | Confetti/clapping/recovery; paused + AFK + traffic + incomplete-summary overlays |
| ~3126–3497 (was) | testQuestionRender.js | Navbar, loading screen, query row, image grids, bottom actions |
| ~2955–3918 (was) | testSummaryRender.js | Session-complete screen, donut cards, AI report, PLS narrative |
| 83–6393 remainder | test.js | Orchestrator: state, effects, compose |

## Shared state (lives in Test until Phase 5)

Persistent (localStorage): `ageYears`, `ageMonths`, `idDigits`, `currentIndex`, `questionResults`, scores, mic flags, intro flags, `sessionCompleted`, …

Ephemeral: traffic popup, expression timers, upload state, image load flags, AFK timers.

## Script load order (index.html)

```
expressionTiming.js
js/core/i18n.js
js/record_session/recordingTimestamps.js
js/record_session/recordingCapture.js
js/record_session/recordingEncode.js
recording.js
js/core/loader.js
js/api/apiToMongo.js
js/components/navbar.js
js/components/help.js
js/test/utils/testConstants.js … testQuestionUtils.js
js/test/flow/testExpressionTimers.js … testQuestionFlow.js
js/test/scoring/testScoring.js
js/test/ui/testPauseAfk.js … testSummaryRender.js
js/test/finish/testSessionFinish.js, testExpressionAiPoll.js
js/test/test.js
js/app/app.js, welcomeShared.js, welcomeLogin.js, welcomeScreens.js, welcome.js
```

## QA regression matrix

Run after each phase:

1. New game → new `testId`; short expression → incomplete-finish dialog.
2. Full test → preparing → blob PUT → summary → expression AI poll.
3. Home → Continue mid-test (same index, same `testId`).
4. Home → Start game after finish (new `testId`, empty `questionResults`).
5. Pause / AFK; expression 20s + traffic sheet.
6. Mic skip vs record; compr/exp intro.
7. Upload retry after failure (optional).
8. Dev Ctrl+Q jump (if dev code touched).
9. Early Finish dialog (incomplete test): opens via `pauseTest()` (same as navbar pause); recording + expression 20s freeze; no `markQuestionEnd` while dialog open (`MiliTestFinishDialog`); navbar pause hidden; Stay calls `resumeTest()`; finish anyway uses `completeSession` only (no resume).

## Dead-code removed (2026-05-22, user-approved)

- Commented alternate `formatQuestionResultsArray` block in `test.js`.
- `handleLevelCompletion` (unused wrapper).
- `transcription` state + `setTranscription` in session finish upload handler.
- Orphan `downloadRecording` / `downloadTimestamps` on session-complete screen + i18n keys.
