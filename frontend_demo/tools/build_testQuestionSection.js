const fs = require("fs");
const path = require("path");

const testPath = path.join(__dirname, "..", "js", "test", "test.js");
const outPath = path.join(__dirname, "..", "js", "test", "ui", "testQuestionRender.js");
const lines = fs.readFileSync(testPath, "utf8").split(/\r?\n/);
const bodyLines = lines.slice(3125, 3497);

const ctxVars = [
  "currentIdx",
  "currentQuestion",
  "questions",
  "questionAudio",
  "replayQuestionAudio",
  "isAudioPlaying",
  "lang",
  "questionType",
  "currentQuestionAgeBadge",
  "currentQuestionAgeGroup",
  "usePhoneLikeGrid",
  "currentImageCount",
  "isTwoRow",
  "topRowCount",
  "topRowBigger",
  "images",
  "imagesGridStyle",
  "imagesContainerClassName",
  "answerType",
  "clickedMultiAnswers",
  "clickedCorrect",
  "target",
  "orderedAnswers",
  "orderedClickSequence",
  "nonClickableImage",
  "handleClick",
  "handleImageFallbackError",
  "commentText",
  "tr",
];

const skipReplace = new Set([
  "renderImage",
  "renderExpressionImage",
  "renderBottomActions",
  "renderDevAudioToggle",
  "renderExpectedAnswerNote",
  "React",
  "Object",
  "Array",
  "String",
  "Math",
  "Number",
]);

function transformLine(line) {
  let s = line;
  for (const v of ctxVars) {
    if (skipReplace.has(v)) continue;
    const re = new RegExp("(?<![.\\w])" + v + "(?![\\w])", "g");
    s = s.replace(re, "ctx." + v);
  }
  s = s.replace(/renderExpectedAnswerNote\(\)/g, "renderExpectedAnswerNote()");
  s = s.replace(/renderBottomActions\(\)/g, "renderBottomActions()");
  s = s.replace(/renderDevAudioToggle\(\)/g, "renderDevAudioToggle()");
  return s;
}

let body = bodyLines.map(transformLine).join("\n");
body = body.replace(/ctx\.images-container/g, "images-container");
body = body.replace(/: null\s*\n\s*\)\s*\n\s*\),/g, ": null\n  ),");
body = body.replace(/(\s+)images\.(slice|map)/g, "$1ctx.images.$2");

const header = `/**
 * Question section: query row, comprehension/expression image grids, bottom actions.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestQuestionRender(getCtx) {
    function renderBottomActions() {
      var ctx = getCtx();
      if (ctx.questionType === "E") {
        var evalProgressRatio = Math.max(0, Math.min(1, ctx.expressionEvalMsLeft / ctx.EXPRESSION_EVAL_DELAY_MS));
        var evalSecondsLeft = Math.max(0, Math.ceil(ctx.expressionEvalMsLeft / 1000));
        var showExpressionCountdown = ctx.expressionEvalArmed && !ctx.evaluationEnabled && !ctx.trafficPopupOpen && !ctx.showContinue;
        return React.createElement(
          "div",
          { className: "question-bottom-actions question-bottom-actions--expression" },
          React.createElement(
            "div",
            { className: "question-bottom-actions__row" },
            React.createElement("span", { className: "question-bottom-actions__slot", "aria-hidden": true }),
            React.createElement(
              "button",
              {
                type: "button",
                className: "question-bottom-actions__eval-btn question-bottom-actions__btn--plain",
                onClick: function () { ctx.setTrafficPopupOpen(true); },
                disabled: ctx.trafficPopupOpen || ctx.showContinue,
                title: ctx.tr("test.evaluate.label"),
                "aria-label": ctx.tr("test.evaluate.label"),
              },
              React.createElement(
                "span",
                { className: "question-bottom-actions__eval-compact" },
                React.createElement("span", { className: "question-bottom-actions__emoji question-bottom-actions__emoji--eval" }, "🚦"),
                React.createElement("span", { className: "question-bottom-actions__eval-label" }, ctx.tr("test.evaluate.label"))
              )
            ),
            showExpressionCountdown
              ? React.createElement(
                  "span",
                  {
                    className: "expression-eval-countdown expression-eval-countdown--inline expression-eval-countdown--bar-end",
                    "aria-live": "polite",
                  },
                  React.createElement("span", { className: "expression-eval-countdown__icon", "aria-hidden": "true" }, "\\u23F3"),
                  React.createElement(
                    "span",
                    { className: "expression-eval-countdown__track expression-eval-countdown__track--vertical" },
                    React.createElement("span", { className: "expression-eval-countdown__fill expression-eval-countdown__fill--vertical", style: { height: (evalProgressRatio * 100).toFixed(1) + "%" } })
                  ),
                  React.createElement("span", { className: "expression-eval-countdown__text expression-eval-countdown__text--vertical" }, evalSecondsLeft + "s")
                )
              : null
          )
        );
      }
      if (ctx.questionType === "C") {
        return null;
      }
      return null;
    }

    function renderDevAudioToggle() {
      var ctx = getCtx();
      if (!ctx.devMode || ctx.sessionCompleted) return null;
      return React.createElement(
        "div",
        { className: "dev-audio-toggle-wrap" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "dev-audio-toggle-btn" + (ctx.questionAudioMuted ? " is-muted" : ""),
            onClick: function () {
              ctx.setQuestionAudioMuted(function (prev) { return !prev; });
            },
            title: ctx.questionAudioMuted
              ? (ctx.lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
              : (ctx.lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
            "aria-label": ctx.questionAudioMuted
              ? (ctx.lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
              : (ctx.lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
            "aria-pressed": ctx.questionAudioMuted
          },
          ctx.questionAudioMuted ? "🔇" : "🔊"
        )
      );
    }

    function renderExpectedAnswerToggle() {
      return null;
    }

    function renderExpectedAnswerNote() {
      var ctx = getCtx();
      if (ctx.questionType !== "E" || !ctx.commentText || ctx.commentText.trim() === "") return null;
      return React.createElement(
        "div",
        { className: "question-bottom-actions__note question-bottom-actions__note--plain question-expected-answer-above" },
        React.createElement(
          "strong",
          { className: "question-bottom-actions__note-label" },
          ctx.lang === "en" ? "Expected answer: " : "הכוונה להורה: "
        ),
        ctx.commentText
      );
    }

    function renderQuestionSection() {
      var ctx = getCtx();
`;

const footer = `
    }

    return {
      renderBottomActions: renderBottomActions,
      renderDevAudioToggle: renderDevAudioToggle,
      renderExpectedAnswerToggle: renderExpectedAnswerToggle,
      renderExpectedAnswerNote: renderExpectedAnswerNote,
      renderQuestionSection: renderQuestionSection,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestQuestionRender = createTestQuestionRender;
})();
`;

fs.writeFileSync(outPath, header + body + footer, "utf8");
console.log("Wrote", outPath, "lines", (header + body + footer).split("\n").length);
