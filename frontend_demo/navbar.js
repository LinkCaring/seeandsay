/**
 * Single source for all app navigation (top bar only; no separate bottom nav).
 * Use AppNavbar with variant: "home" | "test" | "complete"
 *
 * - Every page: logo, reset, languages
 * - Home button: all pages except home (variant !== "home")
 * - Pause + Dev: only on test (variant === "test")
 */

(function (global) {
  var React = global.React;
  if (!React) return;

  var RESET_ICON = "replay";
  var BUNNY_PROGRESS_ICON = "\uD83D\uDC07"; // 🐇 full rabbit (walking) for progress bar
  var HOME_ICON_NAME = "home";
  var FINISH_ICON_NAME = "outlined_flag";
  var PAUSE_ACTIVE_ICON_NAME = "pause_circle";
  var PAUSE_PAUSED_ICON_NAME = "play_circle";

  function AppNavbar(props) {
    var variant = props.variant || "home";
    var lang = props.lang || "he";
    var t = props.t || function (k) { return k; };
    var onHome = props.onHome;
    var onReset = props.onReset;
    var setLang = props.setLang;
    var isHome = variant === "home";
    var isTest = variant === "test";
    var showHome = !isHome;
    var showDev = isTest && props.showDev;
    var showPause = isTest && props.showPause;
    var isPaused = props.isPaused;
    var pauseTest = props.pauseTest;
    var resumeTest = props.resumeTest;
    var devMode = props.devMode;
    var setDevMode = props.setDevMode;
    var isRecording = props.isRecording;
    var onFinishTest = props.onFinishTest;
    var currentQuestionIndex = props.currentQuestionIndex || 0;
    var totalQuestions = props.totalQuestions || 0;
    var onPrevQuestion = props.onPrevQuestion;
    var onNextQuestion = props.onNextQuestion;
    var innerClass = isHome ? "top-header__inner" : "test-navbar__inner";
    var logoClass = isHome ? "top-header__logo" : "test-navbar__logo";
    var langClass = isHome ? "top-header__lang" : "test-navbar__lang";
    var btnClass = isHome ? "lang-pill" : "test-navbar__btn";

    var resetTitle = lang === "en" ? "Restart" : "התחל מחדש";
    var homeTitle = lang === "en" ? "Home" : "בית";
    var pauseTitle = isPaused ? (lang === "en" ? "Resume" : "המשך") : (lang === "en" ? "Pause" : "השהה");

    var logoEl = React.createElement(
      "span",
      { className: "top-header__brand-wrap" },
      React.createElement("img", {
        className: logoClass,
        src: "resources/test_assets/general/LogoHeader.png",
        alt: t("app.brandAlt"),
        onError: function (e) {
          if (!e || !e.currentTarget) return;
          e.currentTarget.style.display = "none";
          var fallback = e.currentTarget.parentElement && e.currentTarget.parentElement.querySelector(".top-header__brand-fallback");
          if (fallback) fallback.style.display = "inline-flex";
        }
      }),
      React.createElement(
        "span",
        { className: "top-header__brand-fallback", style: { display: "none" } },
        lang === "en" ? "Walking in Language" : "צועדים בשפה"
      )
    );

    var resetBtn = React.createElement("button", {
      type: "button",
      className: isHome ? "test-navbar__btn" : btnClass,
      onClick: function () { if (onReset) onReset(); },
      title: resetTitle,
      "aria-label": resetTitle,
    }, React.createElement("span", {
      className: "material-symbols-outlined navbar-icon",
      "aria-hidden": "true"
    }, RESET_ICON));

    var langGroup = React.createElement(
      "div",
      { className: langClass },
      React.createElement("button", {
        type: "button",
        className: "lang-pill" + (lang === "he" ? " is-active" : ""),
        onClick: function () { if (setLang) setLang("he"); },
      }, t("app.lang.he")),
      React.createElement("button", {
        type: "button",
        className: "lang-pill" + (lang === "en" ? " is-active" : ""),
        onClick: function () { if (setLang) setLang("en"); },
      }, t("app.lang.en"))
    );

    var homeBtn = showHome ? React.createElement("button", {
      type: "button",
      className: btnClass,
      onClick: function () { if (onHome) onHome(); },
      title: homeTitle,
      "aria-label": homeTitle,
      style: isHome ? { fontSize: "16px", padding: "6px 10px", minWidth: "36px" } : undefined,
    }, React.createElement("span", {
      className: "material-symbols-outlined navbar-icon",
      "aria-hidden": "true"
    }, HOME_ICON_NAME)) : null;

    var devBtn = showDev ? React.createElement("button", {
      type: "button",
      className: btnClass + (devMode ? " test-navbar__btn--dev-on" : ""),
      onClick: function () { if (setDevMode) setDevMode(!devMode); },
      title: "Dev mode",
      "aria-label": "Dev mode",
    }, "\uD83D\uDEE0") : null; // 🛠


      var questionNav = isTest ? React.createElement(
  "div",
  { className: "test-navbar__question-nav" },
  React.createElement("button", {
    type: "button",
    className: "test-navbar__btn test-navbar__btn--qnav",
    onClick: function () { if (onPrevQuestion) onPrevQuestion(); },
    title: lang === "en" ? "Previous question" : "שאלה קודמת",
    "aria-label": lang === "en" ? "Previous question" : "שאלה קודמת",
    disabled: currentQuestionIndex <= 0
  }, "<"),
  React.createElement(
    "span",
    { className: "test-navbar__question-count" },
    (currentQuestionIndex + 1) + "/" + totalQuestions
  ),
  React.createElement("button", {
    type: "button",
    className: "test-navbar__btn test-navbar__btn--qnav",
    onClick: function () { if (onNextQuestion) onNextQuestion(); },
    title: lang === "en" ? "Next question" : "השאלה הבאה",
    "aria-label": lang === "en" ? "Next question" : "השאלה הבאה",
    disabled: currentQuestionIndex >= totalQuestions - 1
  }, ">")
) : null;


    var pauseBtn = showPause ? React.createElement("button", {
      type: "button",
      className: btnClass + " test-navbar__btn--pause" + (isPaused ? " is-paused" : ""),
      onClick: isPaused ? resumeTest : pauseTest,
      title: pauseTitle,
      "aria-label": pauseTitle,
    },
      React.createElement("span", {
        className: "rec-dot" + (!isRecording ? " rec-dot--off" : "") + (isPaused ? " rec-dot--paused" : ""),
      }),
      React.createElement("span", {
        className: "material-symbols-outlined navbar-icon navbar-icon--pause",
        "aria-hidden": "true"
      }, isPaused ? PAUSE_PAUSED_ICON_NAME : PAUSE_ACTIVE_ICON_NAME)
    ) : null;

    var finishBtn = isTest ? React.createElement("button", {
    type: "button",
    className: btnClass + " test-navbar__btn--finish",
    onClick: function () { if (onFinishTest) onFinishTest(); },
    title: lang === "en" ? "Finish test" : "סיים מבחן",
    "aria-label": lang === "en" ? "Finish test" : "סיים מבחן"
    }, React.createElement("span", {
      className: "material-symbols-outlined navbar-icon",
      "aria-hidden": "true"
    }, FINISH_ICON_NAME)) : null;

  
    if (isHome) {
      return React.createElement(
        "div",
        { className: innerClass + " top-header__inner--logo-only" },
        logoEl
      );
    }

    return React.createElement(
      "div",
      { className: innerClass },
      logoEl,
      homeBtn,
      resetBtn,
      questionNav,
      pauseBtn,
      finishBtn,
      langGroup
    );
  }

  global.AppNavbar = AppNavbar;
  global.NAVBAR_RESET_ICON = RESET_ICON;
  global.NAVBAR_BUNNY_PROGRESS_ICON = BUNNY_PROGRESS_ICON;
})(typeof window !== "undefined" ? window : this);
