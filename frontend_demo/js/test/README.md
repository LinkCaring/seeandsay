# Test modules (`js/test/`)

Orchestrator: [`test.js`](./test.js). Submodule folders are for navigation only — all modules register on `window.MiliTestModules`. **Load order** is defined in [`index.html`](../../index.html) (do not reorder without checking dependencies).

| Folder | Modules |
|--------|---------|
| `utils/` | `testConstants`, `testAvatarVideo`, `testAgeUtils`, `testQuestionUtils` |
| `flow/` | `testExpressionTimers`, `testMicIntro`, `testStartScreens`, `testQuestionFlow` |
| `scoring/` | `testScoring` |
| `ui/` | `testPauseAfk`, `testOverlays`, `testQuestionRender`, `testSummaryRender` |
| `finish/` | `testSessionFinish`, `testExpressionAiPoll` |

Goals and QA matrix: [`docs/TEST_MODULE_MAP.md`](../../docs/TEST_MODULE_MAP.md).
