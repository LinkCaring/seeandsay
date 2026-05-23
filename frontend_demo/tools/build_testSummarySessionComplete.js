const fs = require("fs");
const path = require("path");

const testPath = path.join(__dirname, "..", "js", "test", "test.js");
const outPath = path.join(__dirname, "..", "js", "test", "ui", "testSummaryRender.js");
const lines = fs.readFileSync(testPath, "utf8").split(/\r?\n/);
const bodyLines = lines.slice(2954, 3918);

const ctxVars = [
  "correctAnswers",
  "partialAnswers",
  "wrongAnswers",
  "permission",
  "sessionRecordingStarted",
  "questions",
  "questionResults",
  "lang",
  "expressionAiResult",
  "testUploadState",
  "sessionCompleted",
  "lastCompletedTestId",
  "expressionAiLoading",
  "testUploadError",
  "expressionAiPollError",
  "plsReportCategory",
  "setPlsReportCategory",
  "onHome",
  "onReset",
  "setLang",
  "retryRecordingUploadRef",
  "tryRecoverSavedTest",
  "refreshExpressionAiStatus",
  "totalMonths",
  "formatQuestionAgeBadge",
  "t",
];

const skipReplace = new Set([
  "renderVisualSummaryCard",
  "buildVisualSummarySegments",
  "React",
  "SessionRecorder",
  "window",
  "document",
  "URL",
  "Blob",
  "Object",
  "Array",
  "String",
  "Number",
  "Math",
  "parseInt",
  "isNaN",
  "setInterval",
  "clearInterval",
  "console",
  "setTimeout",
  "clearTimeout",
]);

function transformLine(line) {
  let s = line;
  for (const v of ctxVars) {
    if (skipReplace.has(v)) continue;
    const re = new RegExp("(?<![.\\w])" + v + "(?![.\\w])", "g");
    s = s.replace(re, "ctx." + v);
  }
  return s;
}

const body = bodyLines.map(transformLine).join("\n");

const header = `/**
 * Session-complete visual summary donut cards + full completion screen.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestSummaryRender(getCtx) {
    function buildVisualSummarySegments(stats, mode, customItems) {
      var ctx = getCtx();
      var total = Math.max(1, Number(stats && stats.total) || 0);
      if (Array.isArray(customItems) && customItems.length > 0) {
        var customCursor = 0;
        return customItems.map(function (item, index) {
          var value = Number(item && item.value) || 0;
          var pct = (value / total) * 100;
          var seg = {
            key: (item && item.key) || ("custom_" + index),
            color: (item && item.color) || "#d5dde5",
            value: value,
            label: ctx.lang === "en" ? (item && item.labelEn) : (item && item.labelHe),
            start: customCursor,
            end: customCursor + pct
          };
          customCursor += pct;
          return seg;
        });
      }
      var isExpression = mode === "expression";
      var items = [
        {
          key: "correct",
          color: "#9EDFC2",
          value: Number(stats && stats.correct) || 0,
          labelEn: isExpression ? "Exactly" : "Succeeded",
          labelHe: isExpression ? "בדיוק" : "הצליח"
        },
        {
          key: "partial",
          color: "#F4D474",
          value: Number(stats && stats.partial) || 0,
          labelEn: isExpression ? "Knew but didn't say" : "Not on first attempt",
          labelHe: isExpression ? "כמעט ידע אבל לא אמר" : "לא בניסיון הראשון"
        },
        {
          key: "wrong",
          color: "#F3A8AF",
          value: Number(stats && stats.wrong) || 0,
          labelEn: "Not there yet",
          labelHe: "לא הצליח"
        }
      ];
      var cursor = 0;
      return items.map(function (item) {
        var pct = (item.value / total) * 100;
        var seg = {
          key: item.key,
          color: item.color,
          value: item.value,
          label: ctx.lang === "en" ? item.labelEn : item.labelHe,
          start: cursor,
          end: cursor + pct
        };
        cursor += pct;
        return seg;
      });
    }

    function renderVisualSummaryCard(opts) {
      var ctx = getCtx();
      var stats = opts && opts.stats ? opts.stats : { correct: 0, partial: 0, wrong: 0, total: 0 };
      var segments = buildVisualSummarySegments(stats, opts.mode, opts.items);
      var gradient = segments
        .map(function (seg) {
          return seg.color + " " + seg.start.toFixed(2) + "% " + seg.end.toFixed(2) + "%";
        })
        .join(", ");
      return React.createElement(
        "div",
        { className: "session-visual-summary__card", key: opts.key },
        React.createElement(
          "h3",
          { className: "session-visual-summary__card-title" },
          ctx.lang === "en" ? opts.titleEn : opts.titleHe
        ),
        React.createElement("div", { className: "session-visual-summary__corner-emoji", "aria-hidden": "true" }, opts.cornerEmoji || ""),
        React.createElement(
          "div",
          { className: "session-visual-summary__chart-wrap" },
          React.createElement(
            "div",
            {
              className: "session-visual-summary__donut",
              style: { background: "conic-gradient(" + gradient + ")" }
            },
            React.createElement("div", { className: "session-visual-summary__donut-center" }, "\\u263A")
          )
        ),
        React.createElement(
          "div",
          { className: "session-visual-summary__legend" },
          segments.map(function (seg) {
            return React.createElement(
              "div",
              { className: "session-visual-summary__legend-row", key: opts.key + "-" + seg.key },
              React.createElement("span", { className: "session-visual-summary__legend-dot", style: { backgroundColor: seg.color } }),
              React.createElement("span", { className: "session-visual-summary__legend-label" }, seg.label),
              React.createElement("span", { className: "session-visual-summary__legend-value" }, String(seg.value))
            );
          })
        )
      );
    }

    function renderSessionCompleteScreen() {
      var ctx = getCtx();
`;

const footer = `
    }

    return {
      buildVisualSummarySegments: buildVisualSummarySegments,
      renderVisualSummaryCard: renderVisualSummaryCard,
      renderSessionCompleteScreen: renderSessionCompleteScreen,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestSummaryRender = createTestSummaryRender;
})();
`;

fs.writeFileSync(outPath, header + body + footer, "utf8");
console.log("Wrote", outPath, "lines", (header + body + footer).split("\n").length);
