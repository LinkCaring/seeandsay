/**
 * Test navbar, loading screen, question section, bottom actions.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestQuestionRender(getCtx) {
    function renderBottomActions() {
      var ctx = getCtx();
      if (ctx.questionType === "E") {
        var evalProgressRatio = Math.max(0, Math.min(1, ctx.expressionEvalMsLeft / ctx.EXPRESSION_EVAL_DELAY_MS));
        var evalSecondsLeft = Math.max(0, Math.ceil(ctx.expressionEvalMsLeft / 1000));
        var showExpressionCountdown = ctx.expressionEvalArmed && !ctx.evaluationEnabled && !ctx.trafficPopupOpen && !ctx.showContinue;
        return React.createElement(
          "div",
          { className: "question-bottom-actions question-bottom-actions--expression" },
          React.createElement(
            "div",
            { className: "question-bottom-actions__row" },
            React.createElement("span", { className: "question-bottom-actions__slot", "aria-hidden": true }),
            React.createElement(
              "button",
              {
                type: "button",
                className: "question-bottom-actions__eval-btn question-bottom-actions__btn--plain",
                onClick: function () { ctx.setTrafficPopupOpen(true); },
                disabled: ctx.trafficPopupOpen || ctx.showContinue,
                title: ctx.tr("test.evaluate.label"),
                "aria-label": ctx.tr("test.evaluate.label"),
              },
              React.createElement(
                "span",
                { className: "question-bottom-actions__eval-compact" },
                React.createElement("span", { className: "question-bottom-actions__emoji question-bottom-actions__emoji--eval" }, "🚦"),
                React.createElement("span", { className: "question-bottom-actions__eval-label" }, ctx.tr("test.evaluate.label"))
              )
            ),
            showExpressionCountdown
              ? React.createElement(
                  "span",
                  {
                    className: "expression-eval-countdown expression-eval-countdown--inline expression-eval-countdown--bar-end",
                    "aria-live": "polite",
                  },
                  React.createElement("span", { className: "expression-eval-countdown__icon", "aria-hidden": "true" }, "\u23F3"),
                  React.createElement(
                    "span",
                    { className: "expression-eval-countdown__track expression-eval-countdown__track--vertical" },
                    React.createElement("span", { className: "expression-eval-countdown__fill expression-eval-countdown__fill--vertical", style: { height: (evalProgressRatio * 100).toFixed(1) + "%" } })
                  ),
                  React.createElement("span", { className: "expression-eval-countdown__text expression-eval-countdown__text--vertical" }, evalSecondsLeft + "s")
                )
              : null
          )
        );
      }
      if (ctx.questionType === "C") {
        return null;
      }
      return null;
    }

    function renderDevAudioToggle() {
      var ctx = getCtx();
      if (!ctx.devMode || ctx.sessionCompleted) return null;
      return React.createElement(
        "div",
        { className: "dev-audio-toggle-wrap" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "dev-audio-toggle-btn" + (ctx.questionAudioMuted ? " is-muted" : ""),
            onClick: function () {
              ctx.setQuestionAudioMuted(function (prev) { return !prev; });
            },
            title: ctx.questionAudioMuted
              ? (ctx.lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
              : (ctx.lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
            "aria-label": ctx.questionAudioMuted
              ? (ctx.lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
              : (ctx.lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
            "aria-pressed": ctx.questionAudioMuted
          },
          ctx.questionAudioMuted ? "🔇" : "🔊"
        )
      );
    }

    function renderExpectedAnswerToggle() {
      return null;
    }

    function renderExpectedAnswerNote() {
      var ctx = getCtx();
      if (ctx.questionType !== "E" || !ctx.commentText || ctx.commentText.trim() === "") return null;
      return React.createElement(
        "div",
        { className: "question-bottom-actions__note question-bottom-actions__note--plain question-expected-answer-above" },
        React.createElement(
          "strong",
          { className: "question-bottom-actions__note-label" },
          ctx.lang === "en" ? "Expected answer: " : "הכוונה להורה: "
        ),
        ctx.commentText
      );
    }

    function renderTestNavbar() {
      var ctx = getCtx();
      var isRecording = ctx.permission && ctx.sessionRecordingStarted;
      var showControls = ctx.voiceIdentifierConfirmed && !ctx.sessionCompleted;
      var exprBlockNext = ctx.questionType === "E" && (!ctx.expressionTrafficSubmitted || ctx.expressionAdvanceLock);
      var exprBlockPrev = ctx.questionType === "E" && ctx.evaluationEnabled && ctx.trafficPopupOpen;
      var AppNavbar = window.AppNavbar;
      if (!AppNavbar) {
        return React.createElement("div", { className: "test-navbar" }, null);
      }
      return React.createElement(
        "div",
        { className: "test-navbar" },
        React.createElement(AppNavbar, {
          variant: "test",
          lang: ctx.lang,
          t: ctx.t,
          onHome: ctx.onHome,
          onReset: ctx.onReset,
          setLang: ctx.setLang,
          showDev: false,
          showPause: showControls && !ctx.incompleteSummaryConfirmOpen,
          pauseDisabled: ctx.incompleteSummaryConfirmOpen,
          isPaused: ctx.isPaused,
          pauseTest: ctx.pauseTest,
          resumeTest: ctx.resumeTest,
          devMode: ctx.devMode,
          setDevMode: ctx.setDevMode,
          isRecording: !!isRecording,
          currentQuestionIndex: ctx.getCurrentQuestionIndex(),
          totalQuestions: ctx.questions.length,
          navPrevDisabled: exprBlockPrev,
          navNextDisabled: exprBlockNext,
          onPrevQuestion: ctx.goToPreviousQuestion,
          onNextQuestion: function () {
            var currentIdx = ctx.getCurrentQuestionIndex();
            if (exprBlockNext) return;
            if (currentIdx < ctx.questions.length - 1) {
              ctx.updateCurrentQuestionIndex(currentIdx + 1);
            }
          },
          onFinishTest: function () {
            ctx.requestFinishTest();
          },
        })
      );
    }

    function renderQuestionLoadingScreen() {
      var ctx = getCtx();
      return React.createElement(
        "div",
        { className: "question-loading-screen" },
        React.createElement("h2", null, ctx.tr("test.loadingQuestion.title")),
        React.createElement("p", null, ctx.tr("test.loadingQuestion.body")),
        ctx.showQuestionLoadingRecovery
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "p",
                { style: { marginTop: "12px", color: "#5c6b70", maxWidth: "320px", textAlign: "center", lineHeight: 1.5 } },
                ctx.lang === "en"
                  ? "Loading is taking longer than expected. You can retry or return home."
                  : "הטעינה מתעכבת מהרגיל. אפשר לנסות שוב או לחזור לדף הבית."
              ),
              React.createElement(
                "div",
                { style: { marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: ctx.retryCurrentQuestionLoading,
                    style: {
                      padding: "10px 16px",
                      border: "none",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg,#4caf50,#66bb6a)",
                      color: "white",
                      fontWeight: 700,
                      cursor: "pointer",
                      minWidth: "120px"
                    }
                  },
                  ctx.lang === "en" ? "Retry loading" : "נסה לטעון שוב"
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: ctx.onHome,
                    style: {
                      padding: "10px 16px",
                      border: "1px solid rgba(48,67,72,0.2)",
                      borderRadius: "10px",
                      background: "#f4f7f9",
                      color: "#304348",
                      fontWeight: 600,
                      cursor: "pointer",
                      minWidth: "120px"
                    }
                  },
                  ctx.lang === "en" ? "Back to home" : "חזרה לדף הבית"
                )
              )
            )
          : null
      );
    }

    function renderQuestionSection() {
      var ctx = getCtx();
      return React.createElement(
  "div",
  { className: "question-section", key: "question-section-" + ((ctx.currentQuestion && ctx.currentQuestion.query_number) || ctx.currentIdx) },
  React.createElement(
    "div",
    { className: "question-section__query-row" },
    ctx.questionAudio
      ? React.createElement(
          "button",
          {
            type: "button",
            className: "replay-audio-btn",
            onClick: ctx.replayQuestionAudio,
            disabled: ctx.isAudioPlaying,
            "aria-label": ctx.tr("test.audio.playQuestion"),
          },
          React.createElement("span", {
            className: "material-symbols-outlined replay-audio-btn__icon",
            "aria-hidden": "true"
          }, "volume_up"),
          React.createElement("span", { className: "replay-audio-btn__label" }, "")
        )
      : null,
    React.createElement("h2", { className: "query-text" }, (ctx.questions[ctx.currentIdx] && ctx.questions[ctx.currentIdx].query) || ""),
    React.createElement(
      "span",
      {
        className: "material-symbols-outlined question-type-indicator",
        "aria-hidden": "true",
        title: ctx.questionType === "E"
          ? (ctx.lang === "en" ? "Expression question" : "שאלת הבעה")
          : (ctx.lang === "en" ? "Comprehension question" : "שאלת הבנה")
      },
      ctx.questionType === "E" ? "mic" : "touch_app"
    ),
    ctx.currentQuestionAgeBadge
      ? React.createElement(
          "span",
          {
            className: "question-age-indicator",
            title: ctx.lang === "en"
              ? ("Target age for this question: " + ctx.currentQuestionAgeGroup)
              : ("גיל היעד לשאלה: " + ctx.currentQuestionAgeGroup),
            "aria-label": ctx.lang === "en"
              ? ("Target age " + ctx.currentQuestionAgeGroup)
              : ("גיל יעד " + ctx.currentQuestionAgeGroup)
          },
          React.createElement("span", { className: "question-age-indicator__label", "aria-hidden": "true" }, "שנים"),
          React.createElement(
            "span",
            { className: "question-age-indicator__text" },
            ctx.currentQuestionAgeBadge
          ),
          React.createElement("span", { className: "question-age-indicator__emoji", "aria-hidden": "true" }, "🎂")
        )
      : null
  ),

    renderExpectedAnswerNote(),

ctx.questionType === "C"
  ? React.createElement(
      "div",
      {
        className:
          "comprehension-container" +
          (ctx.usePhoneLikeGrid && ctx.currentImageCount === 3 ? " comprehension-container--three-up" : "") +
          (ctx.usePhoneLikeGrid && ctx.currentImageCount >= 4 ? " comprehension-container--two-col" : "")
      },
      (function () {
        const shouldUseThreeUp = ctx.usePhoneLikeGrid && ctx.currentImageCount === 3;
        const shouldUseFiveUp = ctx.usePhoneLikeGrid && ctx.currentImageCount === 5;
        const shouldUseTwoColumnGrid = ctx.usePhoneLikeGrid && ctx.currentImageCount >= 4;
        const shouldUseSingleColumn = ctx.usePhoneLikeGrid && ctx.currentImageCount === 2;

        const comprehensionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          :shouldUseThreeUp || shouldUseFiveUp ? { display: "flex", flexDirection: "column", gap: "12px" }
          : shouldUseTwoColumnGrid
            ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }
            : (ctx.isTwoRow ? { display: "flex", flexDirection: "column", gap: "6px" } : ctx.imagesGridStyle);

        function renderImage(img, i, extraClassName) {
          const imgIndex = i + 1;
          const isCorrectMulti = ctx.answerType === "multi" && ctx.clickedMultiAnswers.includes(imgIndex);
          const isTargetSingle = ctx.answerType === "single" && img === ctx.target && ctx.clickedCorrect;
          const isOrderedCorrect =
            ctx.answerType === "ordered" &&
            ctx.orderedAnswers.length > 0 &&
            imgIndex === ctx.orderedAnswers[0] &&
            ctx.orderedClickSequence.length > 0 &&
            ctx.orderedClickSequence[0] === ctx.orderedAnswers[0];
          const showGreenBorder =
            isCorrectMulti ||
            isTargetSingle ||
            isOrderedCorrect ||
            (ctx.answerType === "mask" && ctx.clickedCorrect);
          const isNonClickable = ctx.nonClickableImage && imgIndex === ctx.nonClickableImage;

          return React.createElement(
            "div",
            {
              key: i,
              className: "image-wrapper" + (extraClassName ? " " + extraClassName : ""),
              style: {
                position: "relative",
                width: "100%",
                opacity: isNonClickable ? 0.5 : 1,
                cursor: isNonClickable ? "not-allowed" : "pointer"
              }
            },
            React.createElement("img", {
              src: img,
              alt: "option " + (i + 1),
              className: extraClassName === "top-row-big" ? "image top-row-big" : "image",
              "data-base-src": img,
              "data-fallback-png-first": ctx.answerType === "mask" ? "1" : undefined,
              "data-fallback-index": "0",
              style: Object.assign(
                { width: "100%", maxWidth: "100%" },
                showGreenBorder
                  ? {
                      border: "4px solid #00ff00",
                      borderRadius: "16px",
                      boxShadow: "0 0 20px rgba(0,255,0,0.8)"
                    }
                  : {}
              ),
              onError: ctx.handleImageFallbackError,
              onClick: function (e) { ctx.handleClick(img, e); },
            })
          );
        }

        if (!ctx.usePhoneLikeGrid && ctx.isTwoRow) {
          const topCountDynamic = ctx.topRowCount;
          const bottomImages = ctx.images.slice(topCountDynamic);

          return React.createElement(
            "div",
            {
              className: ctx.imagesContainerClassName,
              style: comprehensionGridStyle,
              "data-count": ctx.currentImageCount,
              "data-question-type": "C",
            },
            React.createElement(
              "div",
              { className: "two-row-layout" },
              React.createElement(
                "div",
                {
                  className: "image-row top-row",
                  style: { gridTemplateColumns: "repeat(" + topCountDynamic + ", 1fr)", gap: "6px" }
                },
                ctx.images.slice(0, topCountDynamic).map(function (img, i) {
                  return renderImage(img, i, ctx.topRowBigger ? "top-row-big" : "");
                })
              ),
              bottomImages.length > 0
                ? React.createElement(
                    "div",
                    {
                      className: "image-row bottom-row",
                      style: { gridTemplateColumns: "repeat(" + bottomImages.length + ", 1fr)", gap: "6px" }
                    },
                    bottomImages.map(function (img, i) {
                      return renderImage(img, topCountDynamic + i, "");
                    })
                  )
                : null
            )
          );
        }

        if (shouldUseThreeUp) {
          return React.createElement(
            "div",
            {
              className: ctx.imagesContainerClassName + " images-container--three-up",
              style: comprehensionGridStyle,
              "data-count": ctx.currentImageCount,
              "data-question-type": "C",
            },
            React.createElement(
              "div",
              { className: "images-container--three-up-top" },
              ctx.images.slice(0, 2).map(function (img, i) {
                return renderImage(img, i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--three-up-bottom" },
              ctx.images.slice(2, 3).map(function (img, i) {
                return renderImage(img, 2 + i, "");
              })
            )
          );
        }

        if (shouldUseFiveUp) {
          return React.createElement(
            "div",
            {
              className: ctx.imagesContainerClassName + " images-container--five-up",
              style: comprehensionGridStyle,
              "data-count": ctx.currentImageCount,
              "data-question-type": "C",
            },
            React.createElement(
              "div",
              { className: "images-container--five-up-bottom" },
              ctx.images.slice(4, 5).map(function (img, i) {
                return renderImage(img, 4 + i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              ctx.images.slice(0, 2).map(function (img, i) {
                return renderImage(img, i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              ctx.images.slice(2, 4).map(function (img, i) {
                return renderImage(img, 2 + i, "");
              })
            )
          );
        }

        return React.createElement(
          "div",
          {
            className:
              ctx.imagesContainerClassName +
              (shouldUseSingleColumn ? " images-container--single-column" : "") +
              (shouldUseTwoColumnGrid ? " images-container--two-col" : ""),
            style: comprehensionGridStyle,
            "data-count": ctx.currentImageCount,
            "data-question-type": "C",
          },
          ctx.images.map(function (img, i) {
            return renderImage(img, i, "");
          })
        );
      })()
    )
  : null,

ctx.questionType === "E"
  ? React.createElement(
      "div",
      { className: "expression-container" },
      (function () {
        const shouldUseSingleColumn = ctx.usePhoneLikeGrid && ctx.currentImageCount === 2;
        const shouldUseThreeUp = ctx.usePhoneLikeGrid && ctx.currentImageCount === 3;
        const shouldUseFiveUp = ctx.usePhoneLikeGrid && ctx.currentImageCount === 5;
        const shouldUseTwoColumnGrid = ctx.usePhoneLikeGrid && ctx.currentImageCount >= 4;

        const expressionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          : shouldUseThreeUp || shouldUseFiveUp ? { display: "flex", flexDirection: "column", gap: "12px" }
          : shouldUseTwoColumnGrid
            ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }
            : ctx.imagesGridStyle;

        function renderExpressionImage(img, i) {
          return React.createElement(
            "div",
            {
              key: i,
              className: "image-wrapper",
              style: { width: "100%" }
            },
            React.createElement("img", {
              src: img,
              alt: "option " + (i + 1),
              className: "image",
              style: { width: "100%", maxWidth: "100%" },
              "data-base-src": img,
              "data-fallback-index": "0",
              onError: ctx.handleImageFallbackError
            })
          );
        }

        if (shouldUseThreeUp) {
          return React.createElement(
            "div",
            {
              className: ctx.imagesContainerClassName + " images-container--three-up",
              style: expressionGridStyle,
              "data-count": ctx.currentImageCount,
              "data-question-type": "E",
            },
            React.createElement(
              "div",
              { className: "images-container--three-up-top" },
              ctx.images.slice(0, 2).map(function (img, i) {
                return renderExpressionImage(img, i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--three-up-bottom" },
              ctx.images.slice(2, 3).map(function (img, i) {
                return renderExpressionImage(img, 2 + i);
              })
            )
          );
        }

        if (shouldUseFiveUp) {
          return React.createElement(
            "div",
            {
              className: ctx.imagesContainerClassName + " images-container--five-up",
              style: expressionGridStyle,
              "data-count": ctx.currentImageCount,
              "data-question-type": "E",
            },
            React.createElement(
              "div",
              { className: "images-container--five-up-bottom" },
              ctx.images.slice(4, 5).map(function (img, i) {
                return renderExpressionImage(img, 4 + i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              ctx.images.slice(0, 2).map(function (img, i) {
                return renderExpressionImage(img, i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              ctx.images.slice(2, 4).map(function (img, i) {
                return renderExpressionImage(img, 2 + i);
              })
            )
          );
        }

        return React.createElement(
          "div",
          {
            className:
              ctx.imagesContainerClassName +
              (shouldUseSingleColumn ? " images-container--single-column" : "") +
              (shouldUseTwoColumnGrid ? " images-container--two-col" : ""),
            style: expressionGridStyle,
            "data-count": ctx.currentImageCount,
            "data-question-type": "E",
          },
          ctx.images.map(function (img, i) {
            return renderExpressionImage(img, i);
          })
        );
      })()
    )
  : null,
      renderBottomActions(),
      renderDevAudioToggle(),
  );
    }

    return {
      renderBottomActions: renderBottomActions,
      renderDevAudioToggle: renderDevAudioToggle,
      renderExpectedAnswerToggle: renderExpectedAnswerToggle,
      renderExpectedAnswerNote: renderExpectedAnswerNote,
      renderTestNavbar: renderTestNavbar,
      renderQuestionLoadingScreen: renderQuestionLoadingScreen,
      renderQuestionSection: renderQuestionSection,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestQuestionRender = createTestQuestionRender;
})();
