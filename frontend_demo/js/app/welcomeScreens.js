/**
 * Welcome onboarding screens: intro, intro video, how-it-works.
 */
(function () {
  var WM = function () {
    return window.MiliWelcomeModules || {};
  };

  function renderScreen1(ctx) {
    return React.createElement(
      "section",
      { className: "onboarding-screen onboarding-screen--s1" },
      React.createElement(
        "div",
        { className: "onboarding-s1-unified-card" },
        React.createElement(
          "h1",
          { className: "onboarding-s1-unified-card__title" },
          ctx.isEn
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  "span",
                  { className: "onboarding-s1-unified-card__title-line" },
                  "Children's language abilities measure"
                ),
                React.createElement(
                  "span",
                  {
                    className:
                      "onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--sub",
                  },
                  "(MILI)"
                )
              )
            : React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  "span",
                  {
                    className:
                      "onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--mili",
                  },
                  'מיל"י'
                ),
                React.createElement(
                  "span",
                  {
                    className:
                      "onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--group",
                  },
                  React.createElement(
                    "span",
                    {
                      className:
                        "onboarding-s1-unified-card__title-line--he-desc",
                    },
                    "מדד יכולות לשוניות ילדים"
                  ),
                  React.createElement(
                    "span",
                    {
                      className:
                        "onboarding-s1-unified-card__title-line--sub",
                    },
                    "(MILI)"
                  )
                )
              )
        ),
        React.createElement("div", {
          className: "onboarding-s1-unified-card__divider",
          role: "presentation",
          "aria-hidden": true,
        }),
        React.createElement(
          "p",
          { className: "onboarding-s1-unified-card__subtitle" },
          ctx.isEn
            ? "Play a short game together and see how your child speaks and develops."
            : "שחקו משחק קצר יחד ותבינו איך ילדכם מדבר ומתפתח"
        ),
        React.createElement(
          "div",
          { className: "onboarding-s1-unified-card__bullets" },
          React.createElement(
            "div",
            { className: "onboarding-list-row onboarding-list-row--emoji" },
            React.createElement("span", {
              className: "onboarding-list-row__emoji",
              "aria-hidden": true,
            }, "🎯"),
            React.createElement("span", null, ctx.isEn ? "Age-tailored game" : "משחק מותאם גיל")
          ),
          React.createElement(
            "div",
            { className: "onboarding-list-row onboarding-list-row--emoji" },
            React.createElement("span", {
              className: "onboarding-list-row__emoji",
              "aria-hidden": true,
            }, "📊"),
            React.createElement(
              "span",
              null,
              ctx.isEn ? "Results will be shown at the end of the game!" : "תוצאות יוצגו בסוף המשחק!"
            )
          )
        )
      ),
      React.createElement(
        "div",
        { className: "onboarding-illustration-slot" },
        React.createElement("img", {
          src: "resources/welcome_photo.jpg",
          alt: ctx.isEn ? "Parent and child playing together" : "הורה וילד משחקים יחד",
          className: "onboarding-illustration-slot__image",
        })
      )
    );
  }

  function renderScreen1Video(ctx) {
    return React.createElement(
      "section",
      { className: "onboarding-screen onboarding-screen--intro-video-only" },
      React.createElement("video", {
        ref: ctx.introVideoRef,
        className: "onboarding-intro-video-only__video",
        src: "resources/avatar/intro1.webm",
        autoPlay: true,
        playsInline: true,
        preload: "auto",
        onEnded: function () {
          ctx.introVideoAutoplayBlockedRef.current = false;
          ctx.setActiveScreen("screen3");
        },
        onError: function () {
          ctx.introVideoAutoplayBlockedRef.current = false;
          ctx.setActiveScreen("screen3");
        },
      })
    );
  }

  function renderScreen3(ctx) {
    var mods = WM();
    return React.createElement(
      "section",
      { className: "onboarding-screen onboarding-screen--s2" },
      React.createElement(
        "h2",
        { className: "onboarding-title" },
        ctx.isEn ? "How does it work?" : "איך זה עובד?"
      ),
      React.createElement(
        "div",
        { className: "onboarding-steps" },
        React.createElement(
          "article",
          { className: "onboarding-step-card" },
          React.createElement("span", { className: "onboarding-step-card__badge" }, "1"),
          React.createElement(
            "div",
            {
              className:
                "onboarding-step-card__icon onboarding-step-card__icon--plain-s2",
              "aria-hidden": true,
            },
            React.createElement("span", {
              className:
                "material-symbols-outlined onboarding-step-card__icon-glyph onboarding-step-card__icon-glyph--plain",
            }, "volume_up")
          ),
          React.createElement(
            "div",
            null,
            React.createElement("h3", null, ctx.isEn ? "Listen to the question" : "שומעים את השאלה"),
            React.createElement(
              "p",
              null,
              ctx.isEn
                ? "The system reads each question. You can replay via the speaker icon."
                : "האזינו לשאלה יחד עם הילד"
            )
          )
        ),
        React.createElement(
          "article",
          { className: "onboarding-step-card" },
          React.createElement("span", { className: "onboarding-step-card__badge" }, "2"),
          React.createElement(
            "div",
            {
              className:
                "onboarding-step-card__icon onboarding-step-card__icon--plain-s2",
              "aria-hidden": true,
            },
            React.createElement("span", {
              className:
                "material-symbols-outlined onboarding-step-card__icon-glyph onboarding-step-card__icon-glyph--plain onboarding-step-card__icon-glyph--plain-brown",
            }, "hourglass_top")
          ),
          React.createElement(
            "div",
            null,
            React.createElement("h3", null, ctx.isEn ? "Give the child time" : "נותנים לילד לענות"),
            React.createElement(
              "p",
              null,
              ctx.isEn
                ? "Wait for the child's response and allow independent thinking."
                : "תנו לילד זמן לחשוב ולענות לבד"
            )
          )
        ),
        React.createElement(
          "article",
          { className: "onboarding-step-card" },
          React.createElement("span", { className: "onboarding-step-card__badge" }, "3"),
          React.createElement(
            "div",
            {
              className:
                "onboarding-step-card__icon onboarding-step-card__icon--traffic-wrap",
            },
            React.createElement(
              "div",
              {
                className: "onboarding-step-traffic-preview",
                role: "img",
                "aria-label": ctx.isEn
                  ? "Traffic light: success, partial, did not succeed"
                  : "רמזור: הצליח, חלקית, לא הצליח",
              },
              React.createElement(
                "div",
                {
                  className:
                    "onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--green",
                },
                ctx.isEn ? "OK" : "הצליח"
              ),
              React.createElement(
                "div",
                {
                  className:
                    "onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--yellow",
                },
                ctx.isEn ? "Partial" : "חלקית"
              ),
              React.createElement(
                "div",
                {
                  className:
                    "onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--red",
                },
                ctx.isEn ? "Failed" : "לא הצליח"
              )
            )
          ),
          React.createElement(
            "div",
            null,
            React.createElement("h3", null, ctx.isEn ? "Rate the answer" : "דרגו את התשובה"),
            React.createElement(
              "p",
              null,
              ctx.isEn
                ? "At the end of each question, choose success level via traffic light."
                : "ספקו משוב בשאלות בהן הילד נדרש לדבר  "
            )
          )
        )
      ),
      React.createElement(
        "div",
        { className: "onboarding-cta-row onboarding-cta-row--single" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "onboarding-btn onboarding-btn--primary",
            onClick: function () {
              if (window.MiliTestSession && window.MiliTestSession.beginNewTestSessionIdentity) {
                window.MiliTestSession.beginNewTestSessionIdentity();
              }
              mods.setPersistentValue("awaitingExpressionMicCheck", false);
              mods.setPersistentValue("micCheckPassed", false);
              mods.setPersistentValue("currentIndex", "0");
              mods.setPersistentValue("sessionCompleted", false);
              mods.setPersistentValue("forceFreshStartAfterMicCheck", true);
              ctx.setPage("test");
            },
          },
          ctx.isEn ? "Start game" : "התחילו משחק"
        )
      )
    );
  }

  function renderWelcomeScreenBody(ctx) {
    if (ctx.activeScreen === "screen1") return renderScreen1(ctx);
    if (ctx.activeScreen === "screen2_login") {
      return WM().renderLoginScreen(ctx);
    }
    if (ctx.activeScreen === "screen1_video") return renderScreen1Video(ctx);
    if (ctx.activeScreen === "screen3") return renderScreen3(ctx);
    return null;
  }

  window.MiliWelcomeModules = window.MiliWelcomeModules || {};
  window.MiliWelcomeModules.renderWelcomeScreenBody = renderWelcomeScreenBody;
})();
