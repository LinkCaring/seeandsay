/**
 * Pre-question gates: age invalid, expression mic check, compr/exp intro videos, preparing recording.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestStartScreens(getCtx) {
    function tryRenderStartScreen() {
      var ctx = getCtx();

      if (!ctx.ageConfirmed || ctx.ageInvalid) {
        return React.createElement(
          "div",
          {
            className: "age-invalid",
            style: { display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" },
          },
          React.createElement(
            "div",
            null,
            ctx.lang === "en" ? "Please start from the welcome flow." : "נא להתחיל ממסכי הפתיחה."
          ),
          React.createElement(
            "button",
            { className: "continue-button", type: "button", onClick: ctx.onHome },
            ctx.lang === "en" ? "Back to welcome" : "חזרה לפתיחה"
          )
        );
      }

      if (ctx.isExpressionMicCheckGateActive()) {
        var levelPercent = Math.max(0, Math.min(100, Math.round(ctx.micCheckLevel * 100)));
        return React.createElement(
          "div",
          { className: "microphone-check-screen" },
          React.createElement("h2", null, ctx.tr("test.mic.check.title")),
          React.createElement("p", null, ctx.tr("test.mic.check.body")),
          React.createElement(
            "div",
            { className: "mic-level-meter", role: "img", "aria-label": ctx.tr("test.mic.check.target") },
            React.createElement("div", { className: "mic-level-meter__target" }),
            React.createElement("div", {
              className: "mic-level-meter__fill",
              style: { width: levelPercent + "%" },
            })
          ),
          React.createElement("p", { className: "mic-level-meter__label" }, ctx.tr("test.mic.check.target")),
          ctx.micCheckReady
            ? React.createElement("p", { className: "mic-check-success" }, ctx.tr("test.mic.check.done"))
            : null,
          ctx.micPermissionError
            ? React.createElement(
                "p",
                {
                  style: {
                    marginTop: "8px",
                    color: "#b71c1c",
                    fontSize: "14px",
                    textAlign: "center",
                  },
                },
                ctx.micPermissionError
              )
            : null,
          React.createElement(
            "div",
            { style: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" } },
            !ctx.micCheckReady
              ? React.createElement(
                  "button",
                  {
                    className: "continue-button",
                    onClick: ctx.startMicrophoneCheck,
                    disabled: ctx.micCheckRunning,
                  },
                  ctx.micCheckRunning
                    ? ctx.lang === "en"
                      ? "Listening..."
                      : "מאזינים..."
                    : ctx.tr("test.mic.check.start")
                )
              : null,
            ctx.micCheckReady
              ? React.createElement(
                  "button",
                  { className: "continue-button", onClick: ctx.continueFromExpressionMicCheck },
                  ctx.tr("test.mic.check.continue")
                )
              : null
          )
        );
      }

      if (ctx.voiceIdentifierConfirmed && !ctx.comprIntroVideoComplete && !ctx.sessionCompleted) {
        return React.createElement(
          "section",
          { className: "test-screen test-screen--comp-intro" },
          React.createElement("video", {
            ref: ctx.comprIntroVideoRef,
            className:
              "test-comp-intro__video" +
              (ctx.comprIntroVideoSources.isFallback ? " test-avatar-intro__video--solid-bg" : ""),
            src: ctx.comprIntroVideoSources.src,
            autoPlay: true,
            playsInline: true,
            preload: "auto",
            onEnded: ctx.finishComprehensionIntroVideo,
            onError: ctx.handleComprIntroVideoError,
          })
        );
      }

      if (
        !ctx.sessionCompleted &&
        !ctx.expIntroVideoComplete &&
        ctx.pendingExpressionIntroIndex >= 0 &&
        (ctx.micCheckPassed || ctx.microphoneSkipped)
      ) {
        return React.createElement(
          "section",
          { className: "test-screen test-screen--exp-intro" },
          React.createElement("video", {
            ref: ctx.expIntroVideoRef,
            className:
              "test-exp-intro__video" +
              (ctx.expIntroVideoSources.isFallback ? " test-avatar-intro__video--solid-bg" : ""),
            src: ctx.expIntroVideoSources.src,
            autoPlay: true,
            playsInline: true,
            preload: "auto",
            onEnded: ctx.finishExpressionIntroVideo,
            onError: ctx.handleExpIntroVideoError,
          })
        );
      }

      if (ctx.testUploadState === "preparing_recording") {
        var prepWaitSec = 120;
        if (typeof SessionRecorder !== "undefined" && SessionRecorder.getConversionWaitMs) {
          prepWaitSec = Math.round(SessionRecorder.getConversionWaitMs() / 1000);
        }
        return React.createElement(
          "section",
          {
            className: "test-screen test-screen--preparing-recording",
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "min(70vh, calc(100dvh - var(--app-header-height, 64px)))",
              padding: "24px 16px",
              textAlign: "center",
            },
          },
          React.createElement(
            "div",
            {
              className: "kicker",
              style: { marginBottom: 12, fontSize: 18, fontWeight: 700, color: "#304348" },
            },
            ctx.lang === "en" ? "Preparing recording…" : "מכין הקלטה…"
          ),
          React.createElement(
            "p",
            { className: "muted", style: { maxWidth: 420, lineHeight: 1.5, margin: 0 } },
            ctx.lang === "en"
              ? "Please keep this page open. Longer sessions may take up to " + prepWaitSec + " seconds."
              : "אנא השאירו את הדף פתוח. מבחנים ארוכים עשויים לקחת עד " + prepWaitSec + " שניות."
          )
        );
      }

      return null;
    }

    return {
      tryRenderStartScreen: tryRenderStartScreen,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestStartScreens = createTestStartScreens;
})();
