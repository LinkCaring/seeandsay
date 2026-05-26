/**
 * Shared expression AI report rendering (summary screen + token results page).
 */
(function () {
  function parentStatusForReport(lang, parentResult) {
    if (parentResult === "correct") return lang === "en" ? "Success" : "הצליח";
    if (parentResult === "partly") return lang === "en" ? "Partial" : "חלקי";
    if (parentResult === "wrong") return lang === "en" ? "Wrong / knew but didn't say" : "לא הצליח / ידע ולא אמר";
    return "—";
  }

  function parentScoreForReport(parentResult) {
    if (parentResult === "correct") return 2;
    if (parentResult === "partly") return 1;
    if (parentResult === "wrong") return 0;
    return null;
  }

  function getExpressionAiReportRowModels(opts) {
    var expressionAiResult = opts.expressionAiResult;
    if (!expressionAiResult) return null;
    var lang = opts.lang || "he";
    var parentExprByQ = opts.parentExprByQ || {};
    var rawRows = Array.isArray(expressionAiResult.per_question) ? expressionAiResult.per_question : [];
    var gradeMatchedCount = 0;
    var gradeComparedCount = 0;
    var rowModels = rawRows.map(function (r) {
      var qn = String((r && r.question_number) != null ? r.question_number : "");
      var parentResult = parentExprByQ[qn];
      var parentStatus = parentStatusForReport(lang, parentResult);
      var parentScore = parentScoreForReport(parentResult);
      var aiScoreNum = r && (r.ai_score === 0 || r.ai_score === 1 || r.ai_score === 2) ? Number(r.ai_score) : null;
      var isMatch = parentScore != null && aiScoreNum != null ? parentScore === aiScoreNum : null;
      if (isMatch !== null) {
        gradeComparedCount += 1;
        if (isMatch) gradeMatchedCount += 1;
      }
      var matchLabel =
        isMatch === null
          ? "—"
          : isMatch
            ? lang === "en"
              ? "Match"
              : "תואם"
            : lang === "en"
              ? "Different"
              : "שונה";
      return {
        qn: qn || "—",
        parentStatus: parentStatus,
        parentScoreStr: parentScore == null ? "—" : String(parentScore),
        aiScoreStr: String(r && r.ai_score != null ? r.ai_score : "—"),
        matchLabel: matchLabel,
        reason: String((r && r.ai_reason_short) || "—"),
        listen: String((r && r.ai_speaker_observation) || "—"),
      };
    });
    return { rowModels: rowModels, gradeMatchedCount: gradeMatchedCount, gradeComparedCount: gradeComparedCount };
  }

  function downloadExpressionAiReportDoc(opts) {
    var pack = getExpressionAiReportRowModels(opts);
    if (!pack) return;
    var lang = opts.lang || "he";
    var fileId = opts.fileId || opts.testId || "results";
    var rowsHtml = pack.rowModels.length
      ? pack.rowModels
          .map(function (m) {
            return (
              "<tr>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.qn +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.parentStatus +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.parentScoreStr +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.aiScoreStr +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.matchLabel +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.reason +
              "</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>" +
              m.listen +
              "</td>" +
              "</tr>"
            );
          })
          .join("")
      : "<tr><td colspan='7' style='border:1px solid #bbb;padding:6px;'>No per-question AI rows.</td></tr>";
    var html =
      "<html><head><meta charset='utf-8'><title>Expression AI Report</title></head><body style='font-family:Arial,sans-serif;padding:16px;'>" +
      "<h2>Expression AI Feedback Report</h2>" +
      "<p><strong>" +
      (lang === "en" ? "Parent vs AI match" : "התאמה הורה מול AI") +
      ":</strong> " +
      pack.gradeMatchedCount +
      " / " +
      pack.gradeComparedCount +
      "</p>" +
      "<h3>Per-question rows</h3>" +
      "<table style='border-collapse:collapse;width:100%;font-size:13px;'><thead><tr>" +
      "<th style='border:1px solid #bbb;padding:6px;'>Q#</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>" +
      (lang === "en" ? "Parent answer" : "תשובת הורה") +
      "</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>" +
      (lang === "en" ? "Parent score" : "ציון הורה") +
      "</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>AI score</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>" +
      (lang === "en" ? "Match" : "התאמה") +
      "</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>Reason</th>" +
      "<th style='border:1px solid #bbb;padding:6px;'>Listen</th>" +
      "</tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table>" +
      "</body></html>";
    var blob = new Blob(["\ufeff", html], { type: "application/msword" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "expression_ai_feedback_" + fileId + ".doc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderWordDownloadBlock(opts) {
    if (!opts || !opts.expressionAiResult) return null;
    var lang = opts.lang || "he";
    var hintText =
      opts.hintText ||
      (lang === "en"
        ? "You can download a Word file to share."
        : "אפשר להוריד קובץ Word לשיתוף.");
    return React.createElement(
      "div",
      {
        className: "session-expression-ai-report__download-wrap",
        style: {
          marginTop: "18px",
          width: "min(100%, 620px)",
          marginLeft: "auto",
          marginRight: "auto",
          padding: "14px",
          textAlign: "center",
          background: "#f7f8fd",
          border: "1px solid #d7defb",
          borderRadius: "12px",
          display: "grid",
          gap: "10px",
        },
      },
      React.createElement(
        "div",
        { style: { fontWeight: 800, fontSize: "17px", color: "#20364a" } },
        lang === "en" ? "AI feedback is ready" : "משוב ה-AI מוכן"
      ),
      React.createElement(
        "div",
        { style: { fontSize: "14px", color: "#4b5d6f" } },
        hintText
      ),
      React.createElement(
        "div",
        { style: { display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" } },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: function () {
              downloadExpressionAiReportDoc(opts);
            },
            style: {
              padding: "10px 14px",
              fontSize: "14px",
              backgroundColor: "#4a9a62",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            },
          },
          lang === "en" ? "Download Word" : "הורדת Word"
        )
      )
    );
  }

  function renderExpressionAiInline(opts) {
    var lang = opts.lang || "he";
    if (!opts.expressionAiResolved || !opts.hasExpressionQuestions || !opts.expressionAiResult) return null;
    var pack = getExpressionAiReportRowModels(opts);
    if (!pack) return null;
    var rowModels = pack.rowModels;
    var thStyle = {
      border: "1px solid #cfd8e6",
      padding: "8px 6px",
      fontSize: "12px",
      background: "#eef2f8",
      color: "#1f3d53",
      fontWeight: 700,
    };
    var tdStyle = {
      border: "1px solid #e2e8f0",
      padding: "8px 6px",
      fontSize: "12px",
      color: "#2c3e50",
      textAlign: "start",
      verticalAlign: "top",
      wordBreak: "break-word",
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
        th(lang === "en" ? "Parent answer" : "תשובת הורה"),
        th(lang === "en" ? "Parent score" : "ציון הורה"),
        th("AI score"),
        th(lang === "en" ? "Reason" : "סיבה", { minWidth: "220px", width: "40%" }),
        th(lang === "en" ? "Listen" : "האזנה")
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
            lang === "en" ? "No per-question AI rows." : "אין שורות AI לפי שאלה."
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
        lang === "en" ? "Expression AI feedback report" : "דוח משוב הבעה (AI)"
      ),
      React.createElement(
        "p",
        { className: "session-expression-ai-report__matchline" },
        React.createElement("strong", null, lang === "en" ? "Parent vs AI match: " : "התאמה הורה מול AI: "),
        String(pack.gradeMatchedCount) + " / " + String(pack.gradeComparedCount)
      ),
      React.createElement(
        "div",
        { className: "session-expression-ai-report__scroll" },
        React.createElement("table", { className: "session-expression-ai-report__table" }, thead, tbody)
      )
    );
  }

  function plsFeedbackText(eli, catId) {
    if (!eli) return "";
    if (catId === "integrative") return String(eli.feedback_integrative_language_he || "").trim();
    if (catId === "semantics") return String(eli.feedback_semantics_he || "").trim();
    if (catId === "structure") return String(eli.feedback_language_structure_he || "").trim();
    if (catId === "phonology") return String(eli.feedback_phonological_awareness_he || "").trim();
    return "";
  }

  function buildPlsNarrativeViewModel(eli) {
    if (!eli || eli.status !== "done") return null;
    var pos =
      Array.isArray(eli.positive_points_he) && eli.positive_points_he.length
        ? eli.positive_points_he
        : Array.isArray(eli.observed_strengths)
          ? eli.observed_strengths
          : [];
    var imp =
      Array.isArray(eli.improvement_points_he) && eli.improvement_points_he.length
        ? eli.improvement_points_he
        : Array.isArray(eli.observed_challenges)
          ? eli.observed_challenges
          : [];
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
  }

  function renderPlsNarrative(opts) {
    var lang = opts.lang || "he";
    var eli = opts.eli;
    var vm = buildPlsNarrativeViewModel(eli);
    if (!vm) return null;
    var plsCats = [
      { id: "integrative", emoji: "💬", labelHe: "מיומנויות שפה אינטגרטיביות", labelEn: "Integrative language skills" },
      { id: "semantics", emoji: "📚", labelHe: "סמנטיקה", labelEn: "Semantics" },
      { id: "structure", emoji: "🧱", labelHe: "מבנה שפה", labelEn: "Language structure" },
      { id: "phonology", emoji: "👂", labelHe: "מודעות פונולוגית", labelEn: "Phonological awareness" },
    ];
    var sel = plsCats.some(function (c) {
      return c.id === opts.plsReportCategory;
    })
      ? opts.plsReportCategory
      : "semantics";
    var selMeta = plsCats.filter(function (c) {
      return c.id === sel;
    })[0] || plsCats[1];
    var feedbackBody =
      plsFeedbackText(eli, sel) || (lang === "en" ? "No category feedback available." : "אין משוב זמין לקטגוריה זו.");
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
          lang === "en" ? "Summary after AI analysis" : "סיכום לאחר ניתוח בינה מלאכותית"
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__hero-text" },
          vm.intro
            ? vm.intro
            : lang === "en"
              ? "Key insights from the sampled expression tasks — strengths and areas to reinforce."
              : "תובנות מרכזיות מהדגימות שנבדקו — נקודות חוזק ותחומים לחיזוק."
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
          lang === "en" ? "Positive points" : "נקודות חיוביות"
        ),
        React.createElement(
          "ul",
          { className: "pls-narrative-report__list" },
          (vm.positive.length ? vm.positive : ["—"]).slice(0, 6).map(function (line, idx) {
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
          lang === "en" ? "Points to strengthen" : "נקודות לחיזוק / שיפור"
        ),
        React.createElement(
          "ul",
          { className: "pls-narrative-report__list" },
          (vm.improvement.length ? vm.improvement : ["—"]).slice(0, 6).map(function (line, idx) {
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
            lang === "en" ? "Choose a category — tap for feedback" : "בחרו קטגוריה — לחצו כדי לראות משוב"
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
                  onClick: function () {
                    if (typeof opts.onPlsCategoryChange === "function") opts.onPlsCategoryChange(c.id);
                  },
                },
                React.createElement("span", { className: "pls-narrative-report__wheel-emoji", "aria-hidden": "true" }, c.emoji),
                React.createElement("span", { className: "pls-narrative-report__wheel-label" }, lang === "en" ? c.labelEn : c.labelHe)
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
          lang === "en" ? "Feedback by category" : "משוב לפי קטגוריה"
        ),
        React.createElement("div", { className: "pls-narrative-report__pill" }, lang === "en" ? selMeta.labelEn : selMeta.labelHe),
        React.createElement("div", { className: "pls-narrative-report__by-cat-body" }, feedbackBody)
      ),
      React.createElement(
        "div",
        { className: "pls-narrative-report__next" },
        React.createElement(
          "div",
          { className: "pls-narrative-report__next-title" },
          lang === "en" ? "Recommended next steps" : "תכנים מומלצים להמשך"
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
          lang === "en"
            ? "Suggestions are adapted to patterns seen in this evaluation sample."
            : "התכנים מותאמים לממצאים שעלו בהערכה."
        )
      )
    );
  }

  window.MiliExpressionAiReport = {
    getExpressionAiReportRowModels: getExpressionAiReportRowModels,
    renderExpressionAiInline: renderExpressionAiInline,
    renderPlsNarrative: renderPlsNarrative,
    buildPlsNarrativeViewModel: buildPlsNarrativeViewModel,
    downloadExpressionAiReportDoc: downloadExpressionAiReportDoc,
    renderWordDownloadBlock: renderWordDownloadBlock,
  };
})();
