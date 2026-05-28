/**
 * Global overlays: confetti, clapping, refresh recovery, pause, AFK, traffic popup, early-finish dialog.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestOverlays(getCtx) {
    function renderConfettiOverlay() {
      var ctx = getCtx();
      if (!ctx.fireworksVisible) return null;
      var pieceCount = 72;
      var palette = ["#ff5f6d", "#ffb347", "#ffd166", "#7bd389", "#43c6ac", "#4facfe", "#b983ff"];
      return React.createElement(
        "div",
        { className: "confetti-overlay", "aria-hidden": "true" },
        Array.from({ length: pieceCount }).map(function (_, i) {
          var left = (i * 11 + (i % 5) * 7) % 100;
          var delay = (i % 9) * 0.06;
          var duration = 2.2 + (i % 8) * 0.25;
          var drift = ((i % 9) - 4) * 28;
          var pieceWidth = 10 + (i % 4) * 3;
          var pieceHeight = 16 + (i % 5) * 3;
          var color = palette[i % palette.length];
          return React.createElement("span", {
            key: "confetti-" + i,
            className: "confetti-overlay__piece",
            style: {
              left: left + "%",
              width: pieceWidth + "px",
              height: pieceHeight + "px",
              backgroundColor: color,
              animationDelay: delay + "s",
              animationDuration: duration + "s",
              "--confetti-drift": drift + "px",
              transform: "translateY(-14vh) rotate(" + ((i * 31) % 360) + "deg)"
            }
          });
        })
      );
    }

    function renderClappingAvatarOverlay() {
      var ctx = getCtx();
      if (!ctx.showClappingAvatar) return null;
      return React.createElement(
        "div",
        {
          className: "clapping-avatar-overlay",
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 10003,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          },
          "aria-hidden": "true"
        },
        React.createElement("video", {
          className: "clapping-avatar-overlay__video",
          style: {
            width: "min(88vw, 860px)",
            height: "min(78vh, 860px)",
            objectFit: "contain",
            filter: "drop-shadow(0 10px 22px rgba(0, 0, 0, 0.22))"
          },
          src: "resources/avatar/clapping.webm",
          autoPlay: true,
          playsInline: true,
          preload: "auto",
          muted: false,
          onEnded: function () {
            ctx.streakVideoDoneRef.current = true;
            ctx.maybeFinishStreakCelebration();
          },
          onError: function () {
            ctx.streakVideoDoneRef.current = true;
            ctx.maybeFinishStreakCelebration();
          }
        })
      );
    }

    function renderExpressionRefreshRecoveryModal() {
      var ctx = getCtx();
      if (!ctx.expressionRefreshRecovery) return null;
      if (!ctx.isPastMicCheckAndInExpressionPhase()) return null;
      var isForce = ctx.expressionRefreshRecovery === "forceHome";
      var title = isForce
        ? (ctx.lang === "en" ? "Session data lost" : "נתוני המשחק אבדו")
        : (ctx.lang === "en" ? "Expression recording lost" : "הקלטת ההבעה אבדה");
      var body = isForce
        ? (ctx.lang === "en"
          ? "After refreshing the page, comprehension progress could not be restored. Please start a new game from the home screen. You will not be able to continue from your last saved point."
          : "לאחר רענון הדף לא ניתן לשחזר את התקדמות הבנה. יש להתחיל משחק חדש ממסך הבית. לא תהיה אפשרות להמשיך מהנקודה האחרונה שנשמרה.")
        : (ctx.lang === "en"
          ? "The browser refresh stopped the microphone recording. Your comprehension answers are saved. Choose whether to start the expression section again from the first expression question, or return home."
          : "רענון הדף עצר את הקלטת המיקרופון. תשובות הבנה נשמרו. אפשר להתחיל מחדש את חלק ההבעה מהשאלה הראשונה בהבעה, או לחזור למסך הבית.");
      return React.createElement(
        "div",
        {
          className: "traffic-popup-overlay",
          role: "dialog",
          "aria-modal": "true",
          style: { zIndex: 10050 },
        },
        React.createElement(
          "div",
          {
            className: "traffic-popup",
            onClick: function (e) {
              e.stopPropagation();
            },
          },
          React.createElement("h2", { className: "traffic-popup__title" }, title),
          React.createElement(
            "p",
            { style: { margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, color: "#304348", textAlign: "center" } },
            body
          ),
          isForce
            ? React.createElement(
                "button",
                {
                  type: "button",
                  className: "continue-button",
                  onClick: ctx.finishExpressionRefreshForceHome,
                  style: { width: "100%", maxWidth: 320 },
                },
                ctx.lang === "en" ? "Back to home" : "חזרה לדף הבית"
              )
            : React.createElement(
                "div",
                { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "continue-button",
                    onClick: ctx.restartExpressionAfterRefresh,
                    style: { minWidth: 140 },
                  },
                  ctx.lang === "en" ? "Restart expression" : "התחלת הבעה מחדש"
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: ctx.finishExpressionRefreshChoiceHome,
                    style: {
                      minWidth: 120,
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(48,67,72,0.2)",
                      background: "#f4f7f9",
                      color: "#304348",
                      fontWeight: 600,
                      cursor: "pointer",
                    },
                  },
                  ctx.lang === "en" ? "Home" : "דף הבית"
                )
              )
        )
      );
    }

    function getTrafficOptionExample(resultKey) {
      var ctx = getCtx();
      var idx = ctx.getCurrentQuestionIndex ? ctx.getCurrentQuestionIndex() : 0;
      var q = ctx.questions && ctx.questions[idx];
      if (!q) return "";
      if (resultKey === "success") return String(q.expected_full_parents || "").trim();
      if (resultKey === "partial") return String(q.expected_partial || "").trim();
      return String(q.expected_wrong || "").trim();
    }

    function renderTrafficOptionExample(resultKey) {
      var ctx = getCtx();
      var exampleText = getTrafficOptionExample(resultKey);
      if (!exampleText) return null;
      return React.createElement(
        "div",
        { className: "traffic-option__desc" },
        React.createElement("span", { className: "traffic-option__example-prefix" }, ctx.tr("test.trafficPopup.examplePrefix") + " "),
        exampleText
      );
    }

    function renderIncrementalSegmentInterruptModal() {
      var ctx = getCtx();
      if (!ctx.incrementalSegmentInterrupt) return null;
      if (typeof ctx.getExpressionAudioMode === "function" && ctx.getExpressionAudioMode() !== "incremental") {
        return null;
      }
      if (ctx.sessionCompleted) return null;
      var qn = ctx.incrementalSegmentInterrupt.questionNumber;
      var uploadState =
        typeof ctx.getIncrementalSegmentUploadState === "function"
          ? ctx.getIncrementalSegmentUploadState(qn)
          : "none";
      var title = ctx.tr("test.incremental.interrupted.title");
      var body;
      var canRestartWhenMicReady = false;
      if (uploadState === "completed") {
        body = ctx.tr("test.incremental.interrupted.alreadySent");
      } else if (uploadState === "in_flight") {
        body = ctx.tr("test.incremental.interrupted.uploadInFlight");
        canRestartWhenMicReady = true;
      } else {
        body = ctx.tr("test.incremental.interrupted.body");
        canRestartWhenMicReady = true;
      }
      var micReady = !!ctx.incrementalRestartMicReady;
      var showRestart = canRestartWhenMicReady && micReady;
      var showDismiss = uploadState === "completed";
      var micHint =
        canRestartWhenMicReady && !micReady
          ? ctx.tr("test.incremental.interrupted.micDisabled")
          : null;
      var restartRequiredHint =
        canRestartWhenMicReady && micReady
          ? ctx.tr("test.incremental.interrupted.restartRequired")
          : null;
      return React.createElement(
        "div",
        {
          className: "incremental-segment-interrupt-screen",
          role: "dialog",
          "aria-modal": "true",
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
            background: "#f4f7f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          },
        },
        React.createElement(
          "div",
          {
            className: "traffic-popup",
            style: { maxWidth: "min(92vw, 480px)", width: "100%", margin: 0 },
            onClick: function (e) {
              e.stopPropagation();
            },
          },
          React.createElement("h2", { className: "traffic-popup__title" }, title),
          React.createElement(
            "p",
            { style: { margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, color: "#304348", textAlign: "center" } },
            body
          ),
          micHint
            ? React.createElement(
                "p",
                {
                  style: {
                    margin: "0 0 16px",
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "#e65100",
                    textAlign: "center",
                  },
                },
                micHint
              )
            : null,
          restartRequiredHint
            ? React.createElement(
                "p",
                {
                  style: {
                    margin: "0 0 16px",
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "#304348",
                    textAlign: "center",
                  },
                },
                restartRequiredHint
              )
            : null,
          React.createElement(
            "div",
            { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" } },
            showRestart
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "continue-button",
                    onClick: function () {
                      ctx.restartCurrentIncrementalExpressionQuestion();
                    },
                    style: { minWidth: 160 },
                  },
                  ctx.tr("test.incremental.interrupted.restart")
                )
              : null,
            showDismiss
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: ctx.dismissIncrementalSegmentInterruptModal,
                    style: {
                      minWidth: 120,
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(48,67,72,0.2)",
                      background: "#f4f7f9",
                      color: "#304348",
                      fontWeight: 600,
                      cursor: "pointer",
                    },
                  },
                  ctx.tr("test.incremental.interrupted.dismiss")
                )
              : null
          )
        )
      );
    }

    function renderRecordingInterruptedBanner() {
      var ctx = getCtx();
      if (!ctx.recordingInterruptedBannerOpen) return null;
      if (ctx.sessionCompleted) return null;
      return React.createElement(
        "div",
        {
          className: "recording-interrupted-banner",
          role: "alert",
          style: {
            position: "fixed",
            top: "calc(var(--app-header-height, 64px) + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10040,
            width: "min(92vw, 520px)",
            background: "#fff3e0",
            border: "1px solid #ffb74d",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          },
        },
        React.createElement(
          "strong",
          { style: { color: "#e65100", fontSize: "15px" } },
          ctx.tr("test.rec.interrupted.title")
        ),
        React.createElement(
          "p",
          { style: { margin: 0, fontSize: "14px", lineHeight: 1.45, color: "#304348" } },
          ctx.tr("test.rec.interrupted.body")
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "continue-button",
            style: { alignSelf: "center", minWidth: "120px" },
            onClick: ctx.dismissRecordingInterruptedBanner,
          },
          ctx.tr("test.rec.interrupted.dismiss")
        )
      );
    }

    function renderPausedOverlay() {
      var ctx = getCtx();
      if (!ctx.isPaused || ctx.incompleteSummaryConfirmOpen) return null;
      return React.createElement(
        "div",
        {
          className: "paused-overlay",
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }
        },
        React.createElement("h1", { style: { color: "white", fontSize: "clamp(36px, 10vw, 52px)", marginBottom: "14px", textAlign: "center", lineHeight: 1.1, maxWidth: "90vw" } }, ctx.tr("test.paused.title")),
        React.createElement("p", { style: { color: "white", fontSize: "clamp(17px, 4.6vw, 24px)", marginBottom: "22px", textAlign: "center", lineHeight: 1.35, maxWidth: "90vw" } },
          ctx.tr("test.paused.body")
        ),
        React.createElement(
          "button",
          {
            onClick: ctx.resumeTest,
            style: {
              padding: "12px 28px",
              fontSize: "clamp(17px, 4.5vw, 22px)",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold"
            }
          },
          ctx.tr("test.paused.cta")
        ),
        React.createElement(
          "button",
          {
            onClick: ctx.onHome,
            style: {
              marginTop: "12px",
              padding: "10px 22px",
              fontSize: "clamp(15px, 4vw, 19px)",
              backgroundColor: "#2E5D73",
              color: "white",
              border: "1px solid #7FA2B3",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600"
            }
          },
          ctx.lang === "en" ? "🏠 Back to home" : "🏠 חזרה לבית"
        )
      );
    }

    function renderAfkWarningOverlay() {
      var ctx = getCtx();
      if (!ctx.showAfkWarning || ctx.isPaused) return null;
      return React.createElement(
        "div",
        {
          className: "afk-warning-overlay",
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9998
          }
        },
        React.createElement(
          "div",
          {
            style: {
              backgroundColor: "white",
              padding: "40px",
              borderRadius: "12px",
              textAlign: "center",
              maxWidth: "400px"
            }
          },
          React.createElement("h2", { style: { marginBottom: "20px", fontSize: "28px" } }, ctx.tr("test.afk.title")),
          React.createElement("p", { style: { marginBottom: "30px", fontSize: "18px", color: "#666" } },
            ctx.tr("test.afk.body")
          ),
          React.createElement(
            "button",
            {
              onClick: ctx.handleAfkResponse,
              style: {
                padding: "12px 30px",
                fontSize: "18px",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold"
              }
            },
            ctx.tr("test.afk.cta")
          )
        )
      );
    }

    function renderTrafficPopup() {
      var ctx = getCtx();
      if (!ctx.trafficPopupOpen) return null;
      return React.createElement(
        "div",
        {
          className: "traffic-popup-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": ctx.tr("test.trafficLight.aria"),
          onClick: function () {
            // Don't allow dismiss: evaluation is required to proceed
          }
        },
        React.createElement(
          "div",
          {
            className: "traffic-popup",
            onClick: function (e) {
              e.stopPropagation();
            }
          },
          (function () {
            if (ctx.questionType === "E" && ctx.evaluationEnabled) return null;
            var fallbackBack = ctx.lang === "en" ? "↪️ Back" : "↪️ חזור";
            var fallbackAria = ctx.lang === "en" ? "Back to question" : "חזרה לשאלה";
            var backAria = (function () {
              var s = ctx.tr("test.trafficPopup.backAria");
              return s && s !== "test.trafficPopup.backAria" ? s : fallbackAria;
            })();
            return React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-popup__back",
                onClick: ctx.cancelTrafficPopup,
                "aria-label": backAria
              },
              fallbackBack.charAt(0)
            );
          })(),
          React.createElement(
            "div",
            { className: "traffic-popup__grid" },
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--green",
                onClick: function () { ctx.handleTrafficPopupChoice("success"); },
                disabled: !!ctx.trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, ctx.tr("test.trafficPopup.green.title")),
              renderTrafficOptionExample("success")
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--lime",
                onClick: function () { ctx.handleTrafficPopupChoice("partial"); },
                disabled: !!ctx.trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, ctx.tr("test.trafficPopup.orange.title")),
              renderTrafficOptionExample("partial")
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--amber",
                onClick: function () { ctx.handleTrafficPopupChoice("midFailure"); },
                disabled: !!ctx.trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, ctx.tr("test.trafficPopup.midFailure.title"))
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--yellow",
                onClick: function () { ctx.handleTrafficPopupChoice("failure"); },
                disabled: !!ctx.trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, ctx.tr("test.trafficPopup.red.title")),
              renderTrafficOptionExample("failure")
            )
          ),
          ctx.trafficPopupChoice
            ? React.createElement(
              "div",
              { className: "traffic-popup__feedback" },
              ctx.trafficPopupChoice === "success"
                ? (ctx.lang === "en" ? "Great!" : "כל הכבוד!")
                : ctx.trafficPopupChoice === "partial"
                  ? (ctx.lang === "en" ? "Noted." : "רשמנו.")
                  : (ctx.lang === "en" ? "We'll practice." : "נתרגל שוב.")
            )
            : null
        )
      );
    }

    function renderIncompleteSummaryConfirm() {
      var ctx = getCtx();
      if (!ctx.incompleteSummaryConfirmOpen) return null;
      return React.createElement(
        "div",
        {
          className: "traffic-popup-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": ctx.tr("test.incompleteSummary.title"),
          onClick: function () {
            ctx.stayAfterIncompleteSummaryConfirm();
          },
        },
        React.createElement(
          "div",
          {
            className: "traffic-popup",
            onClick: function (e) {
              e.stopPropagation();
            },
          },
          React.createElement("h2", { className: "traffic-popup__title" }, ctx.tr("test.incompleteSummary.title")),
          React.createElement("p", { style: { margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, color: "#304348", textAlign: "center" } }, ctx.tr("test.incompleteSummary.body")),
          React.createElement(
            "div",
            { className: "onboarding-cta-row", style: { maxWidth: "100%", marginTop: 4 } },
            React.createElement(
              "button",
              {
                type: "button",
                className: "onboarding-btn onboarding-btn--secondary",
                onClick: function () {
                  ctx.stayAfterIncompleteSummaryConfirm();
                },
              },
              ctx.tr("test.incompleteSummary.stay")
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "onboarding-btn onboarding-btn--primary",
                onClick: function () {
                  ctx.finishAnywayFromIncompleteSummaryConfirm();
                },
              },
              ctx.tr("test.incompleteSummary.finish")
            )
          )
        )
      );
    }

    return {
      renderConfettiOverlay: renderConfettiOverlay,
      renderClappingAvatarOverlay: renderClappingAvatarOverlay,
      renderExpressionRefreshRecoveryModal: renderExpressionRefreshRecoveryModal,
      renderPausedOverlay: renderPausedOverlay,
      renderRecordingInterruptedBanner: renderRecordingInterruptedBanner,
      renderIncrementalSegmentInterruptModal: renderIncrementalSegmentInterruptModal,
      renderAfkWarningOverlay: renderAfkWarningOverlay,
      renderTrafficPopup: renderTrafficPopup,
      renderIncompleteSummaryConfirm: renderIncompleteSummaryConfirm,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestOverlays = createTestOverlays;
})();
