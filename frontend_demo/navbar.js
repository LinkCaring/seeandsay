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

  var RESET_ICON = "\uD83D\uDD03"; // 🔃 counterclockwise – start over / restart
  var BUNNY_PROGRESS_ICON = "\uD83D\uDC07"; // 🐇 full rabbit (walking) for progress bar

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

    var innerClass = isHome ? "top-header__inner" : "test-navbar__inner";
    var logoClass = isHome ? "top-header__logo" : "test-navbar__logo";
    var langClass = isHome ? "top-header__lang" : "test-navbar__lang";
    var btnClass = isHome ? "lang-pill" : "test-navbar__btn";

    var resetTitle = lang === "en" ? "Restart" : "התחל מחדש";
    var homeTitle = lang === "en" ? "Home" : "בית";
    var pauseTitle = isPaused ? (lang === "en" ? "Resume" : "המשך") : (lang === "en" ? "Pause" : "השהה");

    var logoEl = React.createElement("img", {
      className: logoClass,
      src: "resources/test_assets/general/LogoHeader.png",
      alt: t("app.brandAlt"),
    });

    var resetBtn = React.createElement("button", {
      type: "button",
      className: isHome ? "test-navbar__btn" : btnClass,
      onClick: function () { if (onReset) onReset(); },
      title: resetTitle,
      "aria-label": resetTitle,
    }, RESET_ICON);

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
    }, "\uD83C\uDFE0") : null; // 🏠

    var devBtn = showDev ? React.createElement("button", {
      type: "button",
      className: btnClass + (devMode ? " test-navbar__btn--dev-on" : ""),
      onClick: function () { if (setDevMode) setDevMode(!devMode); },
      title: "Dev mode",
      "aria-label": "Dev mode",
    }, "\uD83D\uDEE0") : null; // 🛠

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
      isPaused ? " \u25B6" : " \u23F8"  // ▶ ⏸
    ) : null;

    var finishBtn = isTest ? React.createElement("button", {
    type: "button",
    className: btnClass + " test-navbar__btn--finish",
    onClick: function () { if (onFinishTest) onFinishTest(); },
    title: lang === "en" ? "Finish test" : "סיים מבחן",
    "aria-label": lang === "en" ? "Finish test" : "סיים מבחן"
    }, "🏁") : null;

    if (isHome) {
      return React.createElement(
        "div",
        { className: innerClass },
        logoEl,
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          resetBtn,
          langGroup
        )
      );
    }

    return React.createElement(
      "div",
      { className: innerClass },
      logoEl,
      homeBtn,
      resetBtn,
      devBtn,
      pauseBtn,
      finishBtn,
      langGroup
    );
  }

  global.AppNavbar = AppNavbar;
  global.NAVBAR_RESET_ICON = RESET_ICON;
  global.NAVBAR_BUNNY_PROGRESS_ICON = BUNNY_PROGRESS_ICON;
})(typeof window !== "undefined" ? window : this);
