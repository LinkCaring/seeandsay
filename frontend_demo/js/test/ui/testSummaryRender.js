/**
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
            React.createElement("div", { className: "session-visual-summary__donut-center" }, "\u263A")
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
      var expressionAiResult = ctx.expressionAiResult;
    const totalAnswered = ctx.correctAnswers + ctx.partialAnswers + ctx.wrongAnswers;
    const hasSessionRecording = !!(ctx.permission && ctx.sessionRecordingStarted);
    const expectedAgeGroup = (function () {
      const months = ctx.totalMonths();
      // Age input is validated to [24,72) months in confirmAge()
      if (months <= 30) return "2:00-2:06";
      if (months <= 36) return "2:07-3:00";
      if (months <= 48) return "3:00-4:00";
      if (months <= 60) return "4:00-5:00";
      return "5:00-6:00";
    })();
    const expectedAgeGroupDisplay = ctx.formatQuestionAgeBadge(expectedAgeGroup);

    const questionByNumber = (function () {
      const map = {};
      (ctx.questions || []).forEach(function (q) {
        if (!q) return;
        const n = parseInt(q.query_number, 10);
        if (!isNaN(n)) map[n] = q;
      });
      return map;
    })();

    const ageMatchedStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    const ageMatchedCompStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    ctx.questionResults.forEach(function (item) {
      const qNum = parseInt(item.questionNumber, 10);
      const q = questionByNumber[qNum];
      if (!q || q.age_group !== expectedAgeGroup) return;
      ageMatchedStats.total += 1;
      if (item.result === "correct") ageMatchedStats.correct += 1;
      else if (item.result === "partly") ageMatchedStats.partial += 1;
      else if (item.result === "wrong") ageMatchedStats.wrong += 1;
      if (item.questionType === "comprehension") {
        ageMatchedCompStats.total += 1;
        if (item.result === "correct") ageMatchedCompStats.correct += 1;
        else if (item.result === "partly") ageMatchedCompStats.partial += 1;
        else if (item.result === "wrong") ageMatchedCompStats.wrong += 1;
      }
    });

    

    // Split results by question type
    const compStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    const exprStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    ctx.questionResults.forEach(function (item) {
      const bucket = item.questionType === "expression" ? exprStats : compStats;
      bucket.total += 1;
      if (item.result === "correct") bucket.correct += 1;
      else if (item.result === "partly") bucket.partial += 1;
      else if (item.result === "wrong") bucket.wrong += 1;
    });
    // Cake-display-only variables (no impact on test-flow logic).
    // Display-only cake categories for expression summary.
    // Flow logic still uses result buckets: correct / partly / wrong.
    const expressionCakeCounts = { exact: 0, almost: 0, knewNotSay: 0, notThereYet: 0, total: 0 };
    ctx.questionResults.forEach(function (item) {
      if (!item || item.questionType !== "expression") return;
      expressionCakeCounts.total += 1;
      var category = item.expressionCakeCategory;
      if (!category) {
        category = item.result === "correct"
          ? "exact"
          : item.result === "partly"
            ? "almost"
            : "not_there_yet";
      }
      if (category === "exact") expressionCakeCounts.exact += 1;
      else if (category === "almost") expressionCakeCounts.almost += 1;
      else if (category === "knew_not_say") expressionCakeCounts.knewNotSay += 1;
      else expressionCakeCounts.notThereYet += 1;
    });
    const expressionCakeKnewButDidntSayCount = expressionCakeCounts.knewNotSay;
    const expressionCakeNotThereYetCount = expressionCakeCounts.notThereYet;
    const expressionCakeStats = {
      exact: expressionCakeCounts.exact,
      almost: expressionCakeCounts.almost,
      knewNotSay: expressionCakeKnewButDidntSayCount,
      notThereYet: expressionCakeNotThereYetCount,
      total: expressionCakeCounts.total
    };
    const comprehensionCakeStats = {
      correct: compStats.correct,
      partial: compStats.partial,
      wrong: compStats.wrong,
      total: compStats.total
    };

    const strongerLabel = (function () {
      if (compStats.correct > exprStats.correct) {
        return ctx.lang === "en" ? "Stronger in comprehension" : "חזק יותר בהבנה";
      }
      if (exprStats.correct > compStats.correct) {
        return ctx.lang === "en" ? "Stronger in expression" : "חזק יותר בהבעה";
      }
      return ctx.lang === "en" ? "Balanced between comprehension and expression" : "מאוזן בין הבנה להבעה";
    })();
    const totalStats = {
      total: compStats.total + exprStats.total,
      compTotal: compStats.total,
      exprTotal: exprStats.total
    };

    const hasExpressionQuestions = exprStats.total > 0;
    var expressionAiStatus = ctx.expressionAiResult && expressionAiResult.status;
    const expressionAiResolved =
      !hasExpressionQuestions ||
      (ctx.expressionAiResult &&
        (expressionAiStatus === "done" || expressionAiStatus === "failed"));
    const testUploadInProgress =
      ctx.sessionCompleted &&
      (ctx.testUploadState === "uploading" ||
        ctx.testUploadState === "uploading_blob" ||
        ctx.testUploadState === "saving_metadata" ||
        ctx.testUploadState === "preparing_recording");
    const testUploadFailed = ctx.sessionCompleted && ctx.testUploadState === "failed";
    const expressionFeedbackPending =
      hasExpressionQuestions &&
      !testUploadFailed &&
      (testUploadInProgress ||
        (ctx.lastCompletedTestId &&
          (!ctx.expressionAiResult ||
            expressionAiStatus === "pending" ||
            ctx.expressionAiLoading)));
    const expressionAiFailed =
      hasExpressionQuestions &&
      ctx.lastCompletedTestId &&
      expressionAiStatus === "failed";
    const expressionAiProgress = ctx.expressionAiResult && expressionAiResult.meta && expressionAiResult.meta.progress
      ? expressionAiResult.meta.progress
      : null;
    const expressionAiProcessed = expressionAiProgress && typeof expressionAiProgress.processed_questions === "number"
      ? expressionAiProgress.processed_questions
      : 0;
    const expressionAiTotal = expressionAiProgress && typeof expressionAiProgress.total_questions === "number"
      ? expressionAiProgress.total_questions
      : exprStats.total;
    const expressionAiPhase = expressionAiProgress && expressionAiProgress.phase
      ? String(expressionAiProgress.phase)
      : "pending";
    function expressionPhaseLabel(phaseKey) {
      if (ctx.lang === "en") {
        if (phaseKey === "queued") return "Feedback generation will start shortly";
        if (phaseKey === "processing_started") return "Started";
        if (phaseKey === "preparing_audio") return "Processing audio";
        if (phaseKey === "scoring_questions") return "Scoring questions";
        if (phaseKey === "uploading_audio") return "Uploading recording to cloud";
        if (phaseKey === "saving_metadata") return "Saving test results";
        if (phaseKey === "awaiting_audio") return "Waiting for recording in cloud";
        if (phaseKey === "building_impression") return "Building summary";
        if (phaseKey === "done") return "Done";
        if (phaseKey === "failed") return "Failed";
        return "Pending";
      }
      if (phaseKey === "queued") return "יצירת המשוב תתחיל בקרוב";
      if (phaseKey === "uploading_audio") return "מעלה הקלטה לענן…";
      if (phaseKey === "saving_metadata") return "שומר נתוני מבחן…";
      if (phaseKey === "awaiting_audio") return "ממתין להקלטה בענן…";
      if (phaseKey === "processing_started") return "התחיל עיבוד";
      if (phaseKey === "preparing_audio") return "מעבד שמע";
      if (phaseKey === "scoring_questions") return "מחשב ציונים";
      if (phaseKey === "building_impression") return "מכין סיכום";
      if (phaseKey === "done") return "הושלם";
      if (phaseKey === "failed") return "נכשל";
      return "ממתין";
    }
    const ageMatchedForDisplay =
      !hasExpressionQuestions || expressionAiResolved ? ageMatchedStats : ageMatchedCompStats;

    const parentExprByQ = {};
    ctx.questionResults.forEach(function (item) {
      if (item.questionType !== "expression") return;
      parentExprByQ[String(item.questionNumber)] = item.result;
    });

    const statsLine = function (titleHe, titleEn, stats) {
      const title = ctx.lang === "en" ? titleEn : titleHe;
      return title + ": " + stats.correct + " ✔ / " + stats.partial + " ~ / " + stats.wrong + " ✖ מתוך " + stats.total;
    };

    function parentEvalLabel(result) {
      if (result === "correct") return ctx.lang === "en" ? "Success" : "הצליח";
      if (result === "partly") return ctx.lang === "en" ? "Partial" : "חלקי";
      if (result === "wrong") return ctx.lang === "en" ? "Wrong" : "שגוי";
      return "—";
    }

    const getExpressionAiReportRowModels = function () {
      if (!window.MiliExpressionAiReport) return null;
      return window.MiliExpressionAiReport.getExpressionAiReportRowModels({
        lang: ctx.lang,
        expressionAiResult: expressionAiResult,
        parentExprByQ: parentExprByQ,
      });
    };

    const renderExpressionAiReportInline = function () {
      if (!window.MiliExpressionAiReport) return null;
      return window.MiliExpressionAiReport.renderExpressionAiInline({
        lang: ctx.lang,
        expressionAiResult: expressionAiResult,
        expressionAiResolved: expressionAiResolved,
        hasExpressionQuestions: hasExpressionQuestions,
        parentExprByQ: parentExprByQ,
      });
    };

    const downloadExpressionAiReportDoc = function () {
      if (!window.MiliExpressionAiReport || !window.MiliExpressionAiReport.downloadExpressionAiReportDoc) return;
      window.MiliExpressionAiReport.downloadExpressionAiReportDoc({
        lang: ctx.lang,
        expressionAiResult: expressionAiResult,
        parentExprByQ: parentExprByQ,
        fileId: ctx.lastCompletedTestId || "unknown",
      });
    };

    const renderPlsNarrativeReport = function (eli) {
      if (!window.MiliExpressionAiReport) return null;
      return window.MiliExpressionAiReport.renderPlsNarrative({
        lang: ctx.lang,
        eli: eli,
        plsReportCategory: ctx.plsReportCategory,
        onPlsCategoryChange: ctx.setPlsReportCategory,
      });
    };

    var parentPhoneForSms = "";
    try {
      parentPhoneForSms = JSON.parse(localStorage.getItem("parentPhone") || "\"\"");
    } catch (e) {
      parentPhoneForSms = "";
    }
    var hasParentPhoneForSms = !!(parentPhoneForSms && String(parentPhoneForSms).trim());

    return React.createElement(
  React.Fragment,
  null,

  // Navigation bar for completion screen — outside the summary card
  (function () {
    var AppNavbar = window.AppNavbar;
    if (!AppNavbar) {
      return React.createElement("div", { className: "session-complete__nav" }, null);
    }

    return React.createElement(
      "div",
      { className: "session-complete__nav" },
      React.createElement(
        "div",
        { className: "test-navbar" },
        React.createElement(AppNavbar, {
          variant: "complete",
          lang: ctx.lang,
          t: ctx.t,
          onHome: ctx.onHome,
          onReset: ctx.onReset,
          setLang: ctx.setLang,
        })
      )
    );
  })(),

  React.createElement(
    "div",
    { className: "session-complete" },

    React.createElement(
      "div",
      { className: "session-immediate-summary" },
      React.createElement(
        "div",
        { className: "session-immediate-summary__hero" },
        React.createElement("div", { className: "session-immediate-summary__hero-icon", "aria-hidden": "true" }, "\ud83c\udfc6"),
        React.createElement(
          "div",
          { className: "session-immediate-summary__hero-copy" },
          React.createElement(
            "div",
            { className: "session-immediate-summary__hero-title" },
            ctx.lang === "en" ? "Great job — test completed" : "כל הכבוד — סיימתם את ההערכה"
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__hero-subtitle" },
            ctx.lang === "en"
              ? "Here is a short game summary."
              : "לפניכם סיכום קצר של המשחק"
          )
        )
      ),
      React.createElement(
        "div",
        { className: "session-immediate-summary__stats" },
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-title" },
          ctx.lang === "en" ? "Overall snapshot" : "מבט כללי"
        ),
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-grid" },
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, ctx.lang === "en" ? "Age stage" : "גיל"),
            React.createElement("span", { className: "session-immediate-summary__stat-value session-immediate-summary__stat-value--small" }, expectedAgeGroupDisplay)
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile session-immediate-summary__stat-tile--strong" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, ctx.lang === "en" ? "Total questions" : "סה\"כ שאלות"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.total))
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, ctx.lang === "en" ? "Expression questions" : "שאלות הבעה"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.exprTotal))
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, ctx.lang === "en" ? "Comprehension questions" : "שאלות הבנה"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.compTotal))
          )
        ),
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-note" },
          ctx.lang === "en"
            ? "The evaluation included comprehension and expression, and was adjusted to the selected age stage."
            : "ההערכה כללה שאלות הבנה ושאלות הבעה, והותאמה לגיל הילד."
        )
      ),
      React.createElement(
        "div",
        { className: "session-visual-summary" },
        renderVisualSummaryCard({
          key: "comp",
          mode: "comprehension",
          cornerEmoji: "👂",
          titleEn: "Comprehension questions summary",
          titleHe: "סיכום שאלות הבנה",
          stats: comprehensionCakeStats
        }),
        renderVisualSummaryCard({
          key: "expr",
          mode: "expression",
          cornerEmoji: "🗣️",
          titleEn: "Expression questions summary",
          titleHe: "סיכום שאלות הבעה",
          items: [
            { key: "exact", color: "#9EDFC2", value: expressionCakeStats.exact, labelEn: "Exactly", labelHe: "בדיוק" },
            { key: "almost", color: "#BFE7F8", value: expressionCakeStats.almost, labelEn: "Almost", labelHe: "כמעט" },
            { key: "knew_not_say", color: "#F4D474", value: expressionCakeStats.knewNotSay, labelEn: "Knew but didn't say", labelHe: "ידע אבל לא אמר" },
            { key: "not_there_yet", color: "#F3A8AF", value: expressionCakeStats.notThereYet, labelEn: "Not there yet", labelHe: "לא שם עדיין" }
          ],
          stats: expressionCakeStats
        })
      ),
      renderExpressionAiReportInline(),
      expressionAiResolved
        ? React.createElement("div", { className: "session-immediate-summary__balance" }, strongerLabel)
        : null
    ),
      hasExpressionQuestions &&
      ctx.expressionAiResult &&
      expressionAiResult.expressive_language_impression &&
      expressionAiResult.expressive_language_impression.status === "done"
        ? renderPlsNarrativeReport(expressionAiResult.expressive_language_impression)
        : null,
      hasExpressionQuestions && testUploadInProgress
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #d5dbe3",
                background: "#f5f7fa",
                color: "#34495e",
                fontSize: "14px"
              }
            },
            ctx.lang === "en"
              ? ctx.testUploadState === "preparing_recording"
                ? "Preparing recording…"
                : ctx.testUploadState === "uploading_blob"
                  ? "Uploading recording to cloud…"
                  : ctx.testUploadState === "saving_metadata"
                    ? "Saving test results…"
                    : "Uploading recording and results…"
              : ctx.testUploadState === "preparing_recording"
                ? "מכין הקלטה…"
                : ctx.testUploadState === "uploading_blob"
                  ? "מעלה הקלטה לענן…"
                  : ctx.testUploadState === "saving_metadata"
                    ? "שומר נתוני מבחן…"
                    : "מעלה את ההקלטה והתוצאות…"
          )
        : null,
      hasExpressionQuestions && testUploadFailed
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e8b4b8",
                background: "#fff5f5",
                color: "#8b3a3a",
                fontSize: "14px",
                lineHeight: 1.4
              }
            },
            ctx.lang === "en" ? "Upload failed." : "העלאת הנתונים נכשלה.",
            ctx.testUploadError
              ? React.createElement("div", { style: { marginTop: "6px", fontSize: "12px", opacity: 0.9 } }, ctx.testUploadError)
              : null,
            hasSessionRecording
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "btn",
                    style: { marginTop: "10px" },
                    onClick: function () {
                      if (retryRecordingUploadRef.current) {
                        retryRecordingUploadRef.current();
                      }
                    },
                  },
                  ctx.lang === "en" ? "Retry recording upload" : "נסה שוב להעלות הקלטה"
                )
              : null,
            React.createElement(
              "button",
              {
                type: "button",
                className: "btn",
                style: { marginTop: "10px" },
                onClick: function () {
                  ctx.tryRecoverSavedTest();
                },
              },
              ctx.lang === "en" ? "Check if test was saved" : "בדוק אם המבחן נשמר"
            )
          )
        : null,
      hasExpressionQuestions && expressionAiFailed
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e8b4b8",
                background: "#fff5f5",
                color: "#8b3a3a",
                fontSize: "14px",
                lineHeight: 1.4
              }
            },
            ctx.lang === "en" ? "AI feedback could not be completed." : "לא ניתן היה להשלים את משוב הבעה.",
            ctx.expressionAiResult && expressionAiResult.error
              ? React.createElement("div", { style: { marginTop: "6px", fontSize: "12px" } }, String(expressionAiResult.error))
              : null,
            React.createElement(
              "button",
              {
                type: "button",
                disabled: ctx.expressionAiLoading,
                onClick: ctx.refreshExpressionAiStatus,
                style: {
                  marginTop: "8px",
                  padding: "8px 14px",
                  fontSize: "14px",
                  backgroundColor: ctx.expressionAiLoading ? "#9aa3b2" : "#6c8fb0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: ctx.expressionAiLoading ? "not-allowed" : "pointer"
                }
              },
              ctx.lang === "en" ? "Refresh AI status" : "רענון סטטוס AI"
            )
          )
        : null,
      hasExpressionQuestions && hasParentPhoneForSms && ctx.lastCompletedTestId
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #c5d9e8",
                background: "#eef6fc",
                color: "#1c3b53",
                fontSize: "14px",
                lineHeight: 1.45,
              },
            },
            ctx.lang === "en"
              ? "We will text you when expression feedback is ready. The link will be available for 7 days."
              : "נשלח אליכם SMS כשמשוב ההבעה יהיה מוכן. הקישור יהיה זמין למשך 7 ימים."
          )
        : null,
      hasExpressionQuestions && ctx.lastCompletedTestId && expressionFeedbackPending
        ? React.createElement(
            "div",
            { style: { marginTop: "12px", textAlign: "center", display: "grid", gap: "8px", justifyItems: "center" } },
            React.createElement(
              "div",
              {
                style: {
                  width: "min(100%, 560px)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #d5dbe3",
                  background: "#f5f7fa",
                  color: "#34495e",
                  fontSize: "14px",
                  lineHeight: 1.4
                }
              },
              React.createElement(
                "div",
                { style: { fontWeight: 700, marginBottom: "4px" } },
                ctx.lang === "en"
                  ? "Expression AI status: " + expressionPhaseLabel(expressionAiPhase)
                  : "סטטוס משוב הבעה: " + expressionPhaseLabel(expressionAiPhase)
              ),
              React.createElement(
                "div",
                null,
                ctx.lang === "en"
                  ? ("Progress: " + expressionAiProcessed + "/" + expressionAiTotal + " questions")
                  : ("התקדמות: " + expressionAiProcessed + "/" + expressionAiTotal + " שאלות")
              ),
              ctx.expressionAiPollError
                ? React.createElement(
                    "div",
                    { style: { marginTop: "6px", fontSize: "13px", color: "#8b3a3a" } },
                    ctx.expressionAiPollError
                  )
                : null
            ),
            React.createElement(
              "button",
              {
                type: "button",
                disabled: ctx.expressionAiLoading,
                onClick: ctx.refreshExpressionAiStatus,
                style: {
                  padding: "10px 18px",
                  fontSize: "15px",
                  backgroundColor: ctx.expressionAiLoading ? "#9aa3b2" : "#6c8fb0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: ctx.expressionAiLoading ? "not-allowed" : "pointer",
                  opacity: 0.95,
                  maxWidth: "min(100%, 520px)"
                }
              },
              ctx.expressionAiLoading
                ? (ctx.lang === "en" ? "Refreshing..." : "מרענן...")
                : (ctx.lang === "en"
                  ? "Refresh AI status"
                  : "רענון סטטוס AI")
            )
          )
        : null,
      expressionAiResolved && hasExpressionQuestions && ctx.expressionAiResult && window.MiliExpressionAiReport
        ? window.MiliExpressionAiReport.renderWordDownloadBlock({
            lang: ctx.lang,
            expressionAiResult: expressionAiResult,
            parentExprByQ: parentExprByQ,
            fileId: ctx.lastCompletedTestId || "unknown",
            showReadyTitle: false,
            hintText:
              ctx.lang === "en"
                ? "The same report is shown in the summary above. You can also download a Word file to share."
                : "אותו דוח מוצג למעלה בסיכום. אפשר גם להוריד קובץ Word לשיתוף.",
          })
        : null
      )
    );
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
