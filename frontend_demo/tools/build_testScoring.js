const fs = require("fs");
const path = require("path");

const testPath = path.join(__dirname, "..", "js", "test", "test.js");
const outPath = path.join(__dirname, "..", "js", "test", "scoring", "testScoring.js");
const lines = fs.readFileSync(testPath, "utf8").split(/\r?\n/);

const slice = []
  .concat(lines.slice(2283, 2320))
  .concat(lines.slice(2362, 2831));

const ctxVars = [
  "comprehensionAdvanceLockRef",
  "fireworksTimerRef",
  "hintEverOpenedRef",
  "singleComprehensionRetryRef",
  "multiWrongClicksRef",
  "multiAutoHintDoneRef",
  "orderedRescueActiveRef",
  "orderedRescueTargetRef",
  "maskAwaitingSecondRef",
  "consecutiveExprFailRef",
  "consecutiveCompFailRef",
  "questionType",
  "images",
  "nonClickableImage",
  "answerType",
  "target",
  "allClickedAnswers",
  "multiAnswers",
  "multiAttemptCount",
  "clickedMultiAnswers",
  "minCorrectAnswers",
  "orderedAnswers",
  "orderedClickSequence",
  "maskCanvas",
  "questions",
  "questionResults",
  "consecutiveSuccessStreak",
  "updatedQuestionResults",
  "currentQuestion",
  "currentIdx",
];

const setters = [
  "setClickedCorrect",
  "setFireworksVisible",
  "setMultiAttemptCount",
  "setAllClickedAnswers",
  "setClickedMultiAnswers",
  "setOrderedClickSequence",
  "setShowContinue",
  "setQuestionResults",
  "setConsecutiveSuccessStreak",
];

const ctxFns = [
  "resetAfkTimer",
  "playTryAgainAudio",
  "openHintProgrammatic",
  "adjustCountsForResult",
  "startThreeInRowCelebration",
  "requestCompleteSessionOrConfirm",
  "openIncompleteSummaryConfirm",
  "tryGateExpressionMicCheckBeforeNavigatingTo",
  "tryDeferExpressionIntroBeforeNavigatingTo",
  "updateCurrentQuestionIndex",
  "getCurrentQuestionIndex",
  "getQuestionTypeLabel",
  "shouldApplyAdaptiveWrongLogic",
  "findFirstExpressionQuestionIndex",
  "dedupeQuestionResultsKeepLastAttempt",
  "countQuestionsByType",
  "countAnsweredByType",
];

function transformLine(line) {
  let s = line;
  if (s.startsWith("  ")) s = "    " + s.slice(2);
  s = s.replace(/const handleClick = function/, "function handleClick");
  s = s.replace(/const handleContinue = function/, "function handleContinue");
  for (const v of ctxVars.concat(setters).concat(ctxFns)) {
    const re = new RegExp("(?<![.\\w])" + v + "(?![.\\w])", "g");
    s = s.replace(re, "ctx." + v);
  }
  return s;
}

let body = slice.map(transformLine).join("\n");

const injectCtx = [
  "finalizeComprehensionResult",
  "finalizeComprehensionSuccess",
  "handleClick",
  "checkMaskClick",
  "handleContinue",
];
for (const name of injectCtx) {
  const re = new RegExp("(    function " + name + "\\([^)]*\\) \\{)\\n", "g");
  body = body.replace(re, "$1\n      var ctx = getCtx();\n");
}

const header = `/**
 * Comprehension image clicks, auto-score, traffic beeps, handleContinue advance.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestScoring(getCtx) {
    function playTrafficFeedback(result) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const now = audioCtx.currentTime;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "sine";
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
          o.connect(g);
          g.connect(audioCtx.destination);
          const seq = result === "success" ? [660, 880] : result === "partial" ? [440] : [330, 220];
          o.frequency.setValueAtTime(seq[0], now);
          if (seq.length > 1) o.frequency.setValueAtTime(seq[1], now + 0.11);
          o.start(now);
          o.stop(now + 0.24);
          setTimeout(function () { audioCtx.close && audioCtx.close(); }, 400);
        }
      } catch (e) {
        // ignore
      }
    }

`;

const footer = `
    return {
      playTrafficFeedback: playTrafficFeedback,
      handleClick: handleClick,
      handleContinue: handleContinue,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestScoring = createTestScoring;
})();
`;

fs.writeFileSync(outPath, header + body + footer, "utf8");
console.log("Wrote", outPath, "lines", (header + body + footer).split("\n").length);
