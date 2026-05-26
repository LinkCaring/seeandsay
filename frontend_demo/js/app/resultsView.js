/**
 * Token-based results page (?t=...) — no localStorage session required.
 * Uses the same session-complete / session-immediate-summary shell as the in-app summary.
 */
function MiliResultsView(props) {
  var lang = props.lang || "he";
  var tokenState = React.useState(function () {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("t") || params.get("results") || "";
    } catch (e) {
      return "";
    }
  });
  var token = tokenState[0];
  var loadState = React.useState({ status: "loading", data: null, httpStatus: null });
  var load = loadState[0];
  var setLoad = loadState[1];
  var plsCatState = React.useState("semantics");
  var plsReportCategory = plsCatState[0];
  var setPlsReportCategory = plsCatState[1];

  React.useEffect(function fetchResults() {
    if (!token || !String(token).trim()) {
      setLoad({ status: "error", data: null, httpStatus: 400 });
      return;
    }
    var cancelled = false;
    setLoad({ status: "loading", data: null, httpStatus: null });
    (async function () {
      var resp = typeof getResultsByToken === "function" ? await getResultsByToken(token) : null;
      if (cancelled) return;
      if (!resp || !resp.success) {
        setLoad({
          status: resp && resp.status === 410 ? "expired" : "error",
          data: resp,
          httpStatus: resp && resp.status ? resp.status : null,
        });
        return;
      }
      setLoad({ status: "ready", data: resp, httpStatus: 200 });
    })();
    return function () {
      cancelled = true;
    };
  }, [token]);

  function formatExpiresAt(iso) {
    if (!iso) return "";
    try {
      var d = new Date(String(iso).replace("Z", ""));
      return d.toLocaleDateString(lang === "en" ? "en-US" : "he-IL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return String(iso);
    }
  }

  var expressionAi = load.data && load.data.expression_ai ? load.data.expression_ai : null;
  var aiStatus = expressionAi && expressionAi.status;
  var aiDone = aiStatus === "done";
  var aiFailed = aiStatus === "failed";
  var aiPending = !aiDone && !aiFailed;

  var reportOpts = {
    lang: lang,
    expressionAiResult: expressionAi,
    expressionAiResolved: aiDone || aiFailed,
    hasExpressionQuestions: true,
    parentExprByQ: {},
  };

  var plsBlock =
    window.MiliExpressionAiReport &&
    aiDone &&
    expressionAi &&
    expressionAi.expressive_language_impression &&
    expressionAi.expressive_language_impression.status === "done"
      ? window.MiliExpressionAiReport.renderPlsNarrative({
          lang: lang,
          eli: expressionAi.expressive_language_impression,
          plsReportCategory: plsReportCategory,
          onPlsCategoryChange: setPlsReportCategory,
        })
      : null;

  var mainContent;
  if (load.status === "loading") {
    mainContent = React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement(
        "div",
        { className: "session-immediate-summary" },
        React.createElement("p", { className: "muted", style: { textAlign: "center", margin: 0 } },
          lang === "en" ? "Loading results…" : "טוען תוצאות…"
        )
      )
    );
  } else if (load.status === "expired") {
    mainContent = React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement(
        "div",
        { className: "session-immediate-summary" },
        React.createElement("h2", { style: { textAlign: "center", margin: "0 0 8px" } },
          lang === "en" ? "Link expired" : "פג תוקף הקישור"
        ),
        React.createElement(
          "p",
          { className: "muted", style: { margin: 0 } },
          lang === "en"
            ? "This results link is no longer available (valid for 7 days)."
            : "קישור התוצאות אינו זמין עוד (תוקף 7 ימים)."
        )
      )
    );
  } else if (load.status === "error") {
    mainContent = React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement(
        "div",
        { className: "session-immediate-summary" },
        React.createElement("h2", { style: { textAlign: "center", margin: "0 0 8px" } },
          lang === "en" ? "Results not found" : "התוצאות לא נמצאו"
        ),
        React.createElement(
          "p",
          { className: "muted", style: { margin: 0 } },
          lang === "en" ? "Check that the link is complete and try again." : "בדקו שהקישור שלם ונסו שוב."
        )
      )
    );
  } else {
    mainContent = React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement(
        "div",
        { className: "session-immediate-summary" },
        React.createElement(
          "div",
          { className: "session-immediate-summary__hero" },
          React.createElement("div", { className: "session-immediate-summary__hero-icon", "aria-hidden": "true" }, "🤖"),
          React.createElement(
            "div",
            { className: "session-immediate-summary__hero-copy" },
            React.createElement(
              "div",
              { className: "session-immediate-summary__hero-title" },
              lang === "en" ? "Expression feedback" : "משוב הבעה"
            ),
            React.createElement(
              "div",
              { className: "session-immediate-summary__hero-subtitle" },
              lang === "en" ? "Results from your MILI session" : "תוצאות מהערכת MILI"
            )
          )
        ),
        aiPending
          ? React.createElement(
              "div",
              {
                style: {
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #d5dbe3",
                  background: "#f5f7fa",
                  color: "#34495e",
                  fontSize: "14px",
                  lineHeight: 1.4,
                  textAlign: "center",
                },
              },
              lang === "en"
                ? "Expression feedback is still being prepared. Refresh this page in a few minutes."
                : "משוב ההבעה עדיין בהכנה. רעננו את העמוד בעוד כמה דקות."
            )
          : null,
        aiFailed
          ? React.createElement(
              "p",
              { style: { color: "#8b3a3a", textAlign: "center", margin: 0 } },
              lang === "en" ? "Expression feedback could not be completed." : "לא ניתן היה להשלים את משוב ההבעה."
            )
          : null,
        window.MiliExpressionAiReport && aiDone
          ? window.MiliExpressionAiReport.renderExpressionAiInline(reportOpts)
          : null
      ),
      plsBlock,
      load.data && load.data.expiresAt
        ? React.createElement(
            "p",
            {
              style: {
                margin: 0,
                fontSize: "13px",
                color: "#5a6b7d",
                textAlign: "center",
              },
            },
            lang === "en"
              ? "This link is valid until " + formatExpiresAt(load.data.expiresAt) + "."
              : "הקישור תקף עד " + formatExpiresAt(load.data.expiresAt) + "."
          )
        : null
    );
  }

  return React.createElement(
    "div",
    { className: "app-container", "data-page": "results" },
    React.createElement(
      "header",
      { className: "top-header" },
      React.createElement(
        "div",
        { className: "top-header__inner" },
        React.createElement("span", { className: "brand-title" }, "MILI"),
        React.createElement(
          "span",
          { className: "app-version-label", style: { marginInlineStart: "8px", fontSize: "12px", opacity: 0.7 } },
          lang === "en" ? "Results" : "תוצאות"
        )
      )
    ),
    mainContent
  );
}
