function usePersistentState(key, initialValue) {
  const [state, setState] = React.useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load state for", key, e);
    }
    return initialValue;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save state for", key, e);
    }
  }, [key, state]);

  return [state, setState];
}

function App() {
  const [page, setPage] = usePersistentState("page", "home");
  const [lang, setLang] = React.useState(function () {
    return (window.I18N && window.I18N.getLang && window.I18N.getLang()) || "he";
  });
  const [csvLoaded, setCsvLoaded] = React.useState(false);
  const [allQuestions, setAllQuestions] = React.useState([]);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const t = function (key, vars) {
    return (window.I18N && window.I18N.t) ? window.I18N.t(key, vars) : key;
  };

  // Always sync language from URL (covers hard refresh, manual URL edits, and timing where I18N loads late)
  React.useEffect(function syncLangFromUrl() {
    function sync() {
      const next = (window.I18N && window.I18N.getLang && window.I18N.getLang()) || "he";
      setLang(next);
    }

    sync();
    window.addEventListener("popstate", sync);
    return function () {
      window.removeEventListener("popstate", sync);
    };
  }, []);

  React.useEffect(function syncDocumentLanguage() {
    const nextDir = (window.I18N && window.I18N.dir) ? window.I18N.dir(lang) : "rtl";
    document.documentElement.lang = lang;
    document.documentElement.dir = nextDir;
  }, [lang]);

  // Load CSV and start image loading as soon as the site opens
  React.useEffect(() => {
    Papa.parse("resources/query_database.csv", {
      download: true,
      header: true,
      complete: function (res) {
        const questions = res.data || [];
        setAllQuestions(questions);
        setCsvLoaded(true);

        // Start loading ALL images immediately (no priority yet)
        ImageLoader.startLoading(questions, []);
      },
    });
  }, []);

  // Reset all persistent states
  function resetAll() {
    localStorage.removeItem("ageYears");
    localStorage.removeItem("ageMonths");
    localStorage.removeItem("ageConfirmed");
    localStorage.removeItem("ageInvalid");
    localStorage.removeItem("currentIndex");
    localStorage.removeItem("correctAnswers");
    localStorage.removeItem("partialAnswers");
    localStorage.removeItem("wrongAnswers");
    localStorage.removeItem("permission");
    localStorage.removeItem("microphoneSkipped");
    localStorage.removeItem("voiceIdentifierConfirmed");
    localStorage.removeItem("testPaused");
    localStorage.removeItem("audioChunks");
    localStorage.removeItem("audioUrl");
    localStorage.removeItem("recPaused");
    localStorage.removeItem("devMode");
    localStorage.removeItem("idDigits");
    localStorage.removeItem("sessionCompleted");
    localStorage.removeItem("sessionRecordingStarted");

    // Clean up continuous session recording
    localStorage.removeItem("sessionRecordingActive");
    localStorage.removeItem("sessionRecordingUrl");
    localStorage.removeItem("sessionRecordingFinal");
    localStorage.removeItem("sessionRecordingChunks");
    localStorage.removeItem("recordingStartTime");
    localStorage.removeItem("questionTimestamps");

    // validation related
    localStorage.removeItem("readingValidated");
    localStorage.removeItem("readingValidationResult");
    localStorage.removeItem("readingRecordingBlob");


    //resultsrelated
    localStorage.removeItem("correctAnswers");
    localStorage.removeItem("partialAnswers");
    localStorage.removeItem("wrongAnswers");
    localStorage.removeItem("questionResults");

    window.location.reload();
  }




  let content;
  if (!csvLoaded) {
    content = React.createElement(
      "div",
      { className: "surface-card", style: { textAlign: "center" } },
      React.createElement("div", { className: "kicker" }, t("app.loading.title")),
      React.createElement(
        "p",
        { className: "muted" },
        t("app.loading.body")
      )
    );
  } else if (page === "test") {
    content = React.createElement(Test, { allQuestions: allQuestions, lang: lang, t: t });
  } else if (page === "help") {
    content = React.createElement(Help, { lang: lang, t: t });
  } else {
    content = React.createElement(Welcome, { lang: lang, t: t });
  }

  return React.createElement(
    "div",
    { className: "app-container" },
    React.createElement(
      "header",
      { className: "top-header" },
      React.createElement(
        "div",
        { className: "top-header__inner" },
        React.createElement("img", {
          className: "top-header__logo",
          src: "resources/test_assets/general/LogoHeader.png",
          alt: t("app.brandAlt"),
        }),
        React.createElement(
          "div",
          { className: "top-header__lang" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "lang-pill" + (lang === "he" ? " is-active" : ""),
              onClick: function () {
                const next = window.I18N.setLang("he");
                setLang(next);
              },
            },
            t("app.lang.he")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "lang-pill" + (lang === "en" ? " is-active" : ""),
              onClick: function () {
                const next = window.I18N.setLang("en");
                setLang(next);
              },
            },
            t("app.lang.en")
          )
        )
      )
    ),
    React.createElement("div", { className: "page-content" }, content),
    React.createElement(BottomNav, { page: page, setPage: setPage, lang: lang, t: t }),
    React.createElement(
      "button",
      {
        className: "reset-button",
        onClick: function () {
          setShowResetConfirm(true);
        },
      },
      t("app.reset")
    ),
    showResetConfirm
      ? React.createElement(
        "div",
        {
          style: {
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "16px"
          },
          role: "dialog",
          "aria-modal": "true",
          "aria-label": t("app.reset.title"),
          onClick: function () { setShowResetConfirm(false); }
        },
        React.createElement(
          "div",
          {
            style: {
              background: "white",
              borderRadius: "14px",
              padding: "24px 24px 18px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
              maxWidth: "400px",
              width: "100%",
              textAlign: "center",
              fontFamily: "var(--font-family)",
              position: "relative"
            },
            onClick: function (e) { e.stopPropagation(); }
          },
          React.createElement("div", { style: { fontSize: "22px", fontWeight: 700, marginBottom: "10px" } }, t("app.reset.title")),
          React.createElement("p", { style: { color: "#304348", marginBottom: "18px", lineHeight: 1.5 } }, t("app.reset.body")),
          React.createElement(
            "div",
            { style: { display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" } },
            React.createElement(
              "button",
              {
                type: "button",
                onClick: function () { setShowResetConfirm(false); resetAll(); },
                style: {
                  padding: "10px 16px",
                  background: "linear-gradient(135deg,#ff6b6b,#ff8a65)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                  minWidth: "120px"
                }
              },
              t("app.reset.yes")
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: function () { setShowResetConfirm(false); },
                style: {
                  padding: "10px 16px",
                  background: "#f0f4f7",
                  color: "#304348",
                  border: "1px solid rgba(48,67,72,0.15)",
                  borderRadius: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                  minWidth: "120px"
                }
              },
              t("app.reset.no")
            )
          )
        )
      )
      : null
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
