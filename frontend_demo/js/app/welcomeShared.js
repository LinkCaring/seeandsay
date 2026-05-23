/**
 * Welcome flow helpers: i18n, localStorage, resume/tips modals.
 */
(function () {
  var PRIVACY_POLICY_URL = "https://www.heb.linkcaring.com/privacy-policy";
  var TERMS_OF_USE_URL = "https://www.heb.linkcaring.com/terms-of-use";

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === "function") {
      return window.I18N.t(key);
    }
    return fallback || key;
  }

  function setPersistentValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function hasInProgressTestState() {
    var run = window.MiliTestRun;
    if (run && typeof run.hasInProgressTestState === "function") {
      return run.hasInProgressTestState();
    }
    return false;
  }

  function clearStoredTestRunKeepChildProfile() {
    var run = window.MiliTestRun;
    if (run && typeof run.clearStoredTestRunKeepChildProfile === "function") {
      run.clearStoredTestRunKeepChildProfile();
    }
  }

  function createWelcomeResumeHandlers(ctx) {
    return {
      maybeAskResume: function (stage) {
        if (!hasInProgressTestState()) return false;
        ctx.setResumePromptStage(stage);
        return true;
      },
      continueFromPrompt: function () {
        var stage = ctx.resumePromptStage;
        ctx.setResumePromptStage(null);
        if (stage === "beforeLogin") {
          setPersistentValue("forceFreshStartAfterMicCheck", false);
          ctx.setPage("test");
        }
      },
      startNewFromPrompt: function () {
        var stage = ctx.resumePromptStage;
        ctx.setResumePromptStage(null);
        if (stage === "beforeLogin") {
          clearStoredTestRunKeepChildProfile();
          try {
            localStorage.removeItem("seeandsayBlockResume");
          } catch (e) {}
          setPersistentValue("forceFreshStartAfterMicCheck", true);
          ctx.setActiveScreen("screen2_login");
        }
      },
    };
  }

  function renderResumeModal(ctx) {
    if (!ctx.resumePromptStage) return null;
    return React.createElement(
      "div",
      {
        className: "onboarding-modal-overlay",
        role: "dialog",
        "aria-modal": "true",
        onClick: function () {
          ctx.setResumePromptStage(null);
        },
      },
      React.createElement(
        "div",
        {
          className: "onboarding-modal",
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        React.createElement("h2", { className: "onboarding-title" },
          ctx.isEn ? "Continue previous game?" : "להמשיך משחק קודם?"
        ),
        React.createElement(
          "p",
          { className: "onboarding-subtitle", style: { marginBottom: "16px" } },
          ctx.isEn
            ? "A saved game was found. Continue where you left off or start a new game."
            : "נמצא משחק שמור. האם להתחיל משחק חדש או להמשיך מהמקום שהפסקתם?"
        ),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" } },
          React.createElement(
            "button",
            { type: "button", className: "onboarding-btn onboarding-btn--primary", onClick: ctx.resumeHandlers.continueFromPrompt },
            ctx.isEn ? "Start where you left off" : "המשיכו מהמקום שהפסקתם"
          ),
          React.createElement(
            "button",
            { type: "button", className: "onboarding-btn onboarding-btn--secondary", onClick: ctx.resumeHandlers.startNewFromPrompt },
            ctx.isEn ? "Start new game" : "התחילו משחק חדש"
          )
        )
      )
    );
  }

  function renderTipsModal(ctx) {
    if (!ctx.tipsOpen) return null;
    return React.createElement(
      "div",
      {
        className: "onboarding-modal-overlay",
        role: "dialog",
        "aria-modal": "true",
        onClick: function () {
          ctx.setTipsOpen(false);
        },
      },
      React.createElement(
        "div",
        {
          className: "onboarding-modal",
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        React.createElement("h2", { className: "onboarding-title" },
          ctx.isEn ? "Tips for a smooth game" : "טיפים חשובים למשחק"
        ),
        React.createElement(
          "div",
          { className: "onboarding-tips-list" },
          React.createElement("div", { className: "onboarding-tip-line" },
            "🔇 " + (ctx.isEn ? "Sit in a quiet place." : "שבו במקום שקט")
          ),
          React.createElement("div", { className: "onboarding-tip-line" },
            "⏳ " + (ctx.isEn ? "Let the child answer at their own pace." : "תנו לילד לענות בקצב שלו")
          ),
          React.createElement("div", { className: "onboarding-tip-line" },
            "💡 " + (ctx.isEn ? "Use hints only when needed." : "השתמשו ברמז רק כשצריך")
          ),
          React.createElement("div", { className: "onboarding-tip-line" },
            "🔊🎙️ " + (ctx.isEn
              ? "Make sure the device allows sound playback and microphone permissions."
              : "ודאו שהמכשיר מאפשר שמיעת צליל והרשאות מיקרופון")
          ),
          React.createElement("div", { className: "onboarding-tip-line" },
            "🌿 " + (ctx.isEn ? "The goal is to get a natural and reliable picture." : "המטרה היא לקבל תמונה טבעית ואמינה")
          )
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "onboarding-btn onboarding-btn--secondary",
            onClick: function () {
              ctx.setTipsOpen(false);
            },
          },
          ctx.isEn ? "Close" : "סגור"
        )
      )
    );
  }

  window.MiliWelcomeModules = window.MiliWelcomeModules || {};
  window.MiliWelcomeModules.PRIVACY_POLICY_URL = PRIVACY_POLICY_URL;
  window.MiliWelcomeModules.TERMS_OF_USE_URL = TERMS_OF_USE_URL;
  window.MiliWelcomeModules.tr = tr;
  window.MiliWelcomeModules.setPersistentValue = setPersistentValue;
  window.MiliWelcomeModules.hasInProgressTestState = hasInProgressTestState;
  window.MiliWelcomeModules.clearStoredTestRunKeepChildProfile = clearStoredTestRunKeepChildProfile;
  window.MiliWelcomeModules.createWelcomeResumeHandlers = createWelcomeResumeHandlers;
  window.MiliWelcomeModules.renderResumeModal = renderResumeModal;
  window.MiliWelcomeModules.renderTipsModal = renderTipsModal;
})();
