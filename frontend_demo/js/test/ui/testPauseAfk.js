/**
 * Pause/resume, AFK timers, early-finish dialog, traffic popup choice.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createPauseAfk(getCtx) {
    function pauseTest() {
      var ctx = getCtx();
      if (ctx.isPaused) return;
      ctx.stopAllQuestionPlayback();
      ctx.setIsPaused(true);
      if (ctx.permission && ctx.sessionRecordingStarted) {
        SessionRecorder.pauseRecording();
      }
      stopAfkTimer();
      console.log("⏸️ Test paused");
    }

    async function resumeTest() {
      var ctx = getCtx();
      if (!ctx.isPaused) return;
      if (ctx.permission && ctx.sessionRecordingStarted) {
        await SessionRecorder.resumeRecording();
      }
      ctx.setIsPaused(false);
      resetAfkTimer();
      console.log("▶️ Test resumed");
    }

    function stopAfkTimer() {
      var ctx = getCtx();
      if (ctx.afkTimerRef.current) {
        clearTimeout(ctx.afkTimerRef.current);
        ctx.afkTimerRef.current = null;
      }
      if (ctx.afkWarningTimerRef.current) {
        clearTimeout(ctx.afkWarningTimerRef.current);
        ctx.afkWarningTimerRef.current = null;
      }
      ctx.setShowAfkWarning(false);
    }

    function resetAfkTimer() {
      var ctx = getCtx();
      if (ctx.isPaused || ctx.sessionCompleted || !ctx.voiceIdentifierConfirmed) return;
      if (ctx.afkTimerRef.current) {
        clearTimeout(ctx.afkTimerRef.current);
      }
      if (ctx.afkWarningTimerRef.current) {
        clearTimeout(ctx.afkWarningTimerRef.current);
      }
      ctx.setShowAfkWarning(false);
      ctx.afkTimerRef.current = setTimeout(function () {
        ctx.setShowAfkWarning(true);
        console.log("⚠️ AFK warning shown");
        ctx.afkWarningTimerRef.current = setTimeout(function () {
          console.log("⏸️ Auto-pausing due to inactivity");
          pauseTest();
          ctx.setShowAfkWarning(false);
        }, 60000);
      }, 300000);
    }

    function handleAfkResponse() {
      var ctx = getCtx();
      ctx.setShowAfkWarning(false);
      resetAfkTimer();
      console.log("✅ User confirmed presence");
    }

    function shouldShowIncompleteSummaryBeforeFinish(results) {
      var ctx = getCtx();
      if (!ctx.questions.length) return false;
      var rows = results || ctx.questionResults;
      var idx = ctx.getSafeCurrentQuestionIndex();
      var currentQ = idx >= 0 ? ctx.questions[idx] : null;
      var qType = currentQ ? ctx.getQuestionTypeLabel(currentQ) : null;
      if (qType === "expression") {
        var exprTotal = ctx.countQuestionsByType("expression");
        var exprAnswered = ctx.countAnsweredByType(rows, "expression");
        return exprTotal > 0 && exprAnswered < exprTotal;
      }
      return ctx.countUniqueQuestionsAnswered(rows) < ctx.questions.length;
    }

    function openIncompleteSummaryConfirm(rows) {
      var ctx = getCtx();
      if (rows) {
        ctx.setQuestionResults(rows);
      }
      if (!ctx.isPaused) {
        ctx.incompleteFinishDialogPausedByUsRef.current = true;
        pauseTest();
      } else {
        ctx.incompleteFinishDialogPausedByUsRef.current = false;
      }
      ctx.setIncompleteSummaryConfirmOpen(true);
    }

    async function stayAfterIncompleteSummaryConfirm() {
      var ctx = getCtx();
      ctx.setIncompleteSummaryConfirmOpen(false);
      if (ctx.incompleteFinishDialogPausedByUsRef.current) {
        ctx.incompleteFinishDialogPausedByUsRef.current = false;
        await resumeTest();
      }
    }

    function finishAnywayFromIncompleteSummaryConfirm() {
      var ctx = getCtx();
      ctx.incompleteFinishDialogPausedByUsRef.current = false;
      ctx.setIncompleteSummaryConfirmOpen(false);
      ctx.completeSession(ctx.questionResults);
    }

    function requestCompleteSessionOrConfirm(results) {
      var ctx = getCtx();
      var rows = results || ctx.questionResults;
      if (shouldShowIncompleteSummaryBeforeFinish(rows)) {
        openIncompleteSummaryConfirm(rows);
        return;
      }
      ctx.completeSession(results);
    }

    function requestFinishTest() {
      var ctx = getCtx();
      if (ctx.sessionCompleted) return;
      if (ctx.questions.length === 0) {
        ctx.completeSession(ctx.questionResults);
        return;
      }
      requestCompleteSessionOrConfirm(ctx.questionResults);
    }

    function handleTrafficPopupChoice(result) {
      var ctx = getCtx();
      if (ctx.trafficChoiceInProgressRef.current) return;
      ctx.trafficChoiceInProgressRef.current = true;
      ctx.endExpressionAnswerRecordingCapture();
      ctx.setExpressionTrafficSubmitted(true);
      ctx.setExpressionAdvanceLock(true);
      ctx.playTrafficFeedback(result);
      ctx.setShowContinue(false);
      ctx.setTrafficPopupOpen(false);
      ctx.setTrafficPopupChoice(null);
      ctx.handleContinue(result);
      ctx.trafficChoiceInProgressRef.current = false;
    }

    return {
      pauseTest: pauseTest,
      resumeTest: resumeTest,
      stopAfkTimer: stopAfkTimer,
      resetAfkTimer: resetAfkTimer,
      handleAfkResponse: handleAfkResponse,
      shouldShowIncompleteSummaryBeforeFinish: shouldShowIncompleteSummaryBeforeFinish,
      openIncompleteSummaryConfirm: openIncompleteSummaryConfirm,
      stayAfterIncompleteSummaryConfirm: stayAfterIncompleteSummaryConfirm,
      finishAnywayFromIncompleteSummaryConfirm: finishAnywayFromIncompleteSummaryConfirm,
      requestCompleteSessionOrConfirm: requestCompleteSessionOrConfirm,
      requestFinishTest: requestFinishTest,
      handleTrafficPopupChoice: handleTrafficPopupChoice,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createPauseAfk = createPauseAfk;
})();
