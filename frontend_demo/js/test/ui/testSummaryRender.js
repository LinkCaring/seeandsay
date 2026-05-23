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

    const parentStatusForReport = function (parentResult) {
      if (parentResult === "correct") return ctx.lang === "en" ? "Success" : "הצליח";
      if (parentResult === "partly") return ctx.lang === "en" ? "Partial" : "חלקי";
      if (parentResult === "wrong") return ctx.lang === "en" ? "Wrong / knew but didn't say" : "לא הצליח / ידע ולא אמר";
      return "—";
    };
    const parentScoreForReport = function (parentResult) {
      if (parentResult === "correct") return 2;
      if (parentResult === "partly") return 1;
      if (parentResult === "wrong") return 0;
      return null;
    };

    const getExpressionAiReportRowModels = function () {
      if (!ctx.expressionAiResult) return null;
      var rawRows = Array.isArray(expressionAiResult.per_question) ? expressionAiResult.per_question : [];
      var gradeMatchedCount = 0;
      var gradeComparedCount = 0;
      var rowModels = rawRows.map(function (r) {
        var qn = String((r && r.question_number) != null ? r.question_number : "");
        var parentResult = parentExprByQ[qn];
        var parentStatus = parentStatusForReport(parentResult);
        var parentScore = parentScoreForReport(parentResult);
        var aiScoreNum = (r && (r.ai_score === 0 || r.ai_score === 1 || r.ai_score === 2)) ? Number(r.ai_score) : null;
        var isMatch = parentScore != null && aiScoreNum != null ? (parentScore === aiScoreNum) : null;
        if (isMatch !== null) {
          gradeComparedCount += 1;
          if (isMatch) gradeMatchedCount += 1;
        }
        var matchLabel =
          isMatch === null
            ? "—"
            : isMatch
              ? (ctx.lang === "en" ? "Match" : "תואם")
              : (ctx.lang === "en" ? "Different" : "שונה");
        return {
          qn: qn || "—",
          parentStatus: parentStatus,
          parentScoreStr: parentScore == null ? "—" : String(parentScore),
          aiScoreStr: String((r && r.ai_score) != null ? r.ai_score : "—"),
          matchLabel: matchLabel,
          reason: String((r && r.ai_reason_short) || "—"),
          listen: String((r && r.ai_speaker_observation) || "—")
        };
      });
      return {
        rowModels: rowModels,
        gradeMatchedCount: gradeMatchedCount,
        gradeComparedCount: gradeComparedCount
      };
    };

    const renderExpressionAiReportInline = function () {
      if (!expressionAiResolved || !hasExpressionQuestions || !ctx.expressionAiResult) return null;
      var pack = getExpressionAiReportRowModels();
      if (!pack) return null;
      var rowModels = pack.rowModels;
      var thStyle = {
        border: "1px solid #cfd8e6",
        padding: "8px 6px",
        fontSize: "12px",
        background: "#eef2f8",
        color: "#1f3d53",
        fontWeight: 700
      };
      var tdStyle = {
        border: "1px solid #e2e8f0",
        padding: "8px 6px",
        fontSize: "12px",
        color: "#2c3e50",
        textAlign: "start",
        verticalAlign: "top",
        wordBreak: "break-word"
      };
      function th(label, extraStyle) {
        return React.createElement("th", { style: Object.assign({}, thStyle, extraStyle || {}), scope: "col" }, label);
      }
      function cell(text) {
        return React.createElement("td", { style: tdStyle }, text);
      }
      var thead = React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          th("Q#"),
          th(ctx.lang === "en" ? "Parent answer" : "תשובת הורה"),
          th(ctx.lang === "en" ? "Parent score" : "ציון הורה"),
          th("AI score"),
          th(ctx.lang === "en" ? "Reason" : "סיבה", { minWidth: "220px", width: "40%" }),
          th(ctx.lang === "en" ? "Listen" : "האזנה")
        )
      );
      var tbody;
      if (rowModels.length === 0) {
        tbody = React.createElement(
          "tbody",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement(
              "td",
              { colSpan: 6, style: Object.assign({}, tdStyle, { textAlign: "center" }) },
              ctx.lang === "en" ? "No per-question AI rows." : "אין שורות AI לפי שאלה."
            )
          )
        );
      } else {
        tbody = React.createElement(
          "tbody",
          null,
          rowModels.map(function (m, idx) {
            return React.createElement(
              "tr",
              { key: "expr-ai-row-" + idx },
              cell(m.qn),
              cell(m.parentStatus),
              cell(m.parentScoreStr),
              cell(m.aiScoreStr),
              cell(m.reason),
              cell(m.listen)
            );
          })
        );
      }
      return React.createElement(
        "div",
        { className: "session-expression-ai-report" },
        React.createElement(
          "h3",
          { className: "session-expression-ai-report__title" },
          ctx.lang === "en" ? "Expression AI feedback report" : "דוח משוב הבעה (AI)"
        ),
        React.createElement(
          "p",
          { className: "session-expression-ai-report__matchline" },
          React.createElement("strong", null, ctx.lang === "en" ? "Parent vs AI match: " : "התאמה הורה מול AI: "),
          String(pack.gradeMatchedCount) + " / " + String(pack.gradeComparedCount)
        ),
        React.createElement(
          "div",
          { className: "session-expression-ai-report__scroll" },
          React.createElement("table", { className: "session-expression-ai-report__table" }, thead, tbody)
        )
      );
    };

    const downloadExpressionAiReportDoc = function () {
      var pack = getExpressionAiReportRowModels();
      if (!pack) return;
      var testId = ctx.lastCompletedTestId || "unknown";
      var rowsHtml = pack.rowModels.length
        ? pack.rowModels.map(function (m) {
            return "<tr>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.qn +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.parentStatus +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.parentScoreStr +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.aiScoreStr +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.matchLabel +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.reason +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.listen +"</td>" +
              "</tr>";
          }).join("")
        : "<tr><td colspan='7' style='border:1px solid #bbb;padding:6px;'>No per-question AI rows.</td></tr>";
      var html = "<html><head><meta charset='utf-8'><title>Expression AI Report</title></head><body style='font-family:Arial,sans-serif;padding:16px;'>" +
        "<h2>Expression AI Feedback Report</h2>" +
        "<p><strong>" + (ctx.lang === "en" ? "Parent vs AI match" : "התאמה הורה מול AI") + ":</strong> " + pack.gradeMatchedCount + " / " + pack.gradeComparedCount + "</p>" +
        "<h3>Per-question rows</h3>" +
        "<table style='border-collapse:collapse;width:100%;font-size:13px;'><thead><tr>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Q#</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (ctx.lang === "en" ? "Parent answer" : "תשובת הורה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (ctx.lang === "en" ? "Parent score" : "ציון הורה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>AI score</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (ctx.lang === "en" ? "Match" : "התאמה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Reason</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Listen</th>" +
        "</tr></thead><tbody>" + rowsHtml + "</tbody></table>" +
        "</body></html>";
      var blob = new Blob(["\ufeff", html], { type: "application/msword" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "expression_ai_feedback_" + testId + ".doc";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const plsFeedbackText = function (eli, catId) {
      if (!eli) return "";
      if (catId === "integrative") return String(eli.feedback_integrative_language_he || "").trim();
      if (catId === "semantics") return String(eli.feedback_semantics_he || "").trim();
      if (catId === "structure") return String(eli.feedback_language_structure_he || "").trim();
      if (catId === "phonology") return String(eli.feedback_phonological_awareness_he || "").trim();
      return "";
    };
    const buildPlsNarrativeViewModel = function (eli) {
      if (!eli || eli.status !== "done") return null;
      var pos = Array.isArray(eli.positive_points_he) && eli.positive_points_he.length
        ? eli.positive_points_he
        : (Array.isArray(eli.observed_strengths) ? eli.observed_strengths : []);
      var imp = Array.isArray(eli.improvement_points_he) && eli.improvement_points_he.length
        ? eli.improvement_points_he
        : (Array.isArray(eli.observed_challenges) ? eli.observed_challenges : []);
      var intro = String(eli.summary_card_intro_he || "").trim();
      if (!intro) intro = String(eli.summary_paragraph_he || "").trim();
      var steps = Array.isArray(eli.recommended_next_steps_he) ? eli.recommended_next_steps_he : [];
      var hasExtended = !!(
        (eli.feedback_semantics_he && String(eli.feedback_semantics_he).trim()) ||
        (eli.feedback_integrative_language_he && String(eli.feedback_integrative_language_he).trim()) ||
        (eli.feedback_language_structure_he && String(eli.feedback_language_structure_he).trim()) ||
        (eli.feedback_phonological_awareness_he && String(eli.feedback_phonological_awareness_he).trim())
      );
      if (!intro && !pos.length && !imp.length) return null;
      return { intro: intro, positive: pos, improvement: imp, steps: steps, hasExtended: hasExtended };
    };
    const renderPlsNarrativeReport = function (eli) {
      var vm = buildPlsNarrativeViewModel(eli);
      if (!vm) return null;
      var plsCats = [
        { id: "integrative", emoji: "💬", labelHe: "מיומנויות שפה אינטגרטיביות", labelEn: "Integrative language skills" },
        { id: "semantics", emoji: "📚", labelHe: "סמנטיקה", labelEn: "Semantics" },
        { id: "structure", emoji: "🧱", labelHe: "מבנה שפה", labelEn: "Language structure" },
        { id: "phonology", emoji: "👂", labelHe: "מודעות פונולוגית", labelEn: "Phonological awareness" }
      ];
      var sel = plsCats.some(function (c) { return c.id === ctx.plsReportCategory; }) ? ctx.plsReportCategory : "semantics";
      var selMeta = plsCats.filter(function (c) { return c.id === sel; })[0] || plsCats[1];
      var feedbackBody = plsFeedbackText(eli, sel) || (ctx.lang === "en" ? "No category feedback available." : "אין משוב זמין לקטגוריה זו.");
      var stepIcons = ["🧩", "💬", "👂"];
      var heroBlock = React.createElement(
        "div",
        { className: "pls-narrative-report__hero" },
        React.createElement("div", { className: "pls-narrative-report__hero-illus", "aria-hidden": "true" }, "🤖"),
        React.createElement(
          "div",
          { className: "pls-narrative-report__hero-copy" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__hero-title" },
            ctx.lang === "en" ? "Summary after AI analysis" : "סיכום לאחר ניתוח בינה מלאכותית"
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__hero-text" },
            vm.intro
              ? vm.intro
              : (ctx.lang === "en"
                ? "Key insights from the sampled expression tasks — strengths and areas to reinforce."
                : "תובנות מרכזיות מהדגימות שנבדקו — נקודות חוזק ותחומים לחיזוק.")
          )
        )
      );
      var colBlock = React.createElement(
        "div",
        { className: "pls-narrative-report__columns" },
        React.createElement(
          "div",
          { className: "pls-narrative-report__col pls-narrative-report__col--positive" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__col-head" },
            React.createElement("span", { className: "pls-narrative-report__col-icon", "aria-hidden": "true" }, "✅"),
            ctx.lang === "en" ? "Positive points" : "נקודות חיוביות"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__list" },
            (vm.positive.length ? vm.positive : [ctx.lang === "en" ? "—" : "—"]).slice(0, 6).map(function (line, idx) {
              return React.createElement("li", { key: "pos-" + idx }, line);
            })
          )
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__col pls-narrative-report__col--improve" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__col-head" },
            React.createElement("span", { className: "pls-narrative-report__col-icon", "aria-hidden": "true" }, "📈"),
            ctx.lang === "en" ? "Points to strengthen" : "נקודות לחיזוק / שיפור"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__list" },
            (vm.improvement.length ? vm.improvement : [ctx.lang === "en" ? "—" : "—"]).slice(0, 6).map(function (line, idx) {
              return React.createElement("li", { key: "imp-" + idx }, line);
            })
          )
        )
      );
      if (!vm.hasExtended) {
        return React.createElement(
          "div",
          { className: "pls-narrative-report pls-narrative-report--legacy", dir: "rtl" },
          heroBlock,
          colBlock
        );
      }
      return React.createElement(
        "div",
        { className: "pls-narrative-report", dir: "rtl" },
        heroBlock,
        colBlock,
        React.createElement(
          "div",
          { className: "pls-narrative-report__wheel-wrap" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__wheel" },
            React.createElement(
              "div",
              { className: "pls-narrative-report__wheel-center" },
              ctx.lang === "en" ? "Choose a category — tap for feedback" : "בחרו קטגוריה — לחצו כדי לראות משוב"
            ),
            React.createElement(
              "div",
              { className: "pls-narrative-report__wheel-nodes" },
              plsCats.map(function (c) {
                var active = c.id === sel;
                return React.createElement(
                  "button",
                  {
                    key: c.id,
                    type: "button",
                    className: "pls-narrative-report__wheel-node" + (active ? " is-active" : ""),
                    onClick: function () { ctx.setPlsReportCategory(c.id); }
                  },
                  React.createElement("span", { className: "pls-narrative-report__wheel-emoji", "aria-hidden": "true" }, c.emoji),
                  React.createElement("span", { className: "pls-narrative-report__wheel-label" }, ctx.lang === "en" ? c.labelEn : c.labelHe)
                );
              })
            )
          )
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__by-cat" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__by-cat-title" },
            ctx.lang === "en" ? "Feedback by category" : "משוב לפי קטגוריה"
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__pill" },
            ctx.lang === "en" ? selMeta.labelEn : selMeta.labelHe
          ),
          React.createElement("div", { className: "pls-narrative-report__by-cat-body" }, feedbackBody)
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__next" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__next-title" },
            ctx.lang === "en" ? "Recommended next steps" : "תכנים מומלצים להמשך"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__next-list" },
            (vm.steps.length >= 1 ? vm.steps.slice(0, 3) : []).map(function (title, idx) {
              return React.createElement(
                "li",
                { key: "step-" + idx, className: "pls-narrative-report__next-row" },
                React.createElement("span", { className: "pls-narrative-report__next-arrow", "aria-hidden": "true" }, "←"),
                React.createElement("span", { className: "pls-narrative-report__next-ico", "aria-hidden": "true" }, stepIcons[idx] || "⭐"),
                React.createElement("span", { className: "pls-narrative-report__next-text" }, title)
              );
            })
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__next-foot" },
            ctx.lang === "en"
              ? "Suggestions are adapted to patterns seen in this evaluation sample."
              : "התכנים מותאמים לממצאים שעלו בהערכה."
          )
        )
      );
    };

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
      expressionAiResolved && hasExpressionQuestions && ctx.expressionAiResult
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "18px",
                width: "min(100%, 620px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "14px 14px 14px",
                textAlign: "center",
                background: "#f7f8fd",
                border: "1px solid #d7defb",
                borderRadius: "12px",
                display: "grid",
                gap: "10px"
              }
            },
            React.createElement(
              "div",
              { style: { fontWeight: 800, fontSize: "17px", color: "#20364a" } },
              ctx.lang === "en" ? "AI feedback is ready" : "משוב ה-AI מוכן"
            ),
            React.createElement(
              "div",
              { style: { fontSize: "14px", color: "#4b5d6f" } },
              ctx.lang === "en"
                ? "The same report is shown in the summary above. You can also download a Word file to share."
                : "אותו דוח מוצג למעלה בסיכום. אפשר גם להוריד קובץ Word לשיתוף."
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" } },
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: downloadExpressionAiReportDoc,
                  style: {
                    padding: "10px 14px",
                    fontSize: "14px",
                    backgroundColor: "#4a9a62",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    opacity: 0.96
                  }
                },
                ctx.lang === "en" ? "Download Word" : "הורדת Word"
              )
            )
          )
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
