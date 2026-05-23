/**
 * Expression 20s eval countdown, freeze/resume, answer-end mark scheduling.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createExpressionTimers(getCtx) {
    function clearExpressionEvalEnableTimer() {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionEvalEnableTimerRef) return;
      if (ctx.expressionEvalEnableTimerRef.current != null) {
        clearTimeout(ctx.expressionEvalEnableTimerRef.current);
        ctx.expressionEvalEnableTimerRef.current = null;
      }
    }

    function clearExpressionAnswerEndTimer() {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionAnswerEndTimerRef) return;
      if (ctx.expressionAnswerEndTimerRef.current != null) {
        clearTimeout(ctx.expressionAnswerEndTimerRef.current);
        ctx.expressionAnswerEndTimerRef.current = null;
      }
    }

    function scheduleExpressionEvalEnable(ms) {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionEvalEnableTimerRef) return;
      clearExpressionEvalEnableTimer();
      var delay = Math.max(0, ms);
      if (delay <= 0) {
        ctx.setEvaluationEnabled(true);
        ctx.setExpressionEvalMsLeft(0);
        ctx.expressionEvalDeadlineRef.current = null;
        return;
      }
      ctx.expressionEvalEnableTimerRef.current = setTimeout(function () {
        ctx.expressionEvalEnableTimerRef.current = null;
        ctx.setEvaluationEnabled(true);
        ctx.setExpressionEvalMsLeft(0);
        ctx.expressionEvalDeadlineRef.current = null;
      }, delay);
    }

    function scheduleExpressionAnswerEndMark(q, delayMs) {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionAnswerEndTimerRef) return;
      clearExpressionAnswerEndTimer();
      if (
        !q ||
        !ctx.permission ||
        !ctx.voiceIdentifierConfirmed ||
        typeof SessionRecorder === "undefined" ||
        !SessionRecorder.markQuestionEnd
      ) {
        return;
      }
      var delay = Math.max(0, delayMs);
      if (delay <= 0) {
        SessionRecorder.markQuestionEnd(q.query_number);
        ctx.endExpressionAnswerRecordingCapture();
        return;
      }
      var qNum = String(q.query_number || "");
      ctx.expressionAnswerEndTimerRef.current = setTimeout(function () {
        ctx.expressionAnswerEndTimerRef.current = null;
        if (ctx.expressionEvalArmedQuestionRef.current !== qNum) return;
        SessionRecorder.markQuestionEnd(q.query_number);
        console.log("🏁 Auto end mark at 20s answer window for question", q.query_number);
        ctx.endExpressionAnswerRecordingCapture();
      }, delay);
    }

    function freezeExpressionEvalCountdown() {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionEvalDeadlineRef) return;
      clearExpressionEvalEnableTimer();
      clearExpressionAnswerEndTimer();
      if (ctx.expressionEvalDeadlineRef.current) {
        var remainingMs = Math.max(0, ctx.expressionEvalDeadlineRef.current - Date.now());
        ctx.expressionEvalPausedRemainingRef.current = remainingMs;
        ctx.setExpressionEvalMsLeft(remainingMs);
        ctx.expressionEvalDeadlineRef.current = null;
      }
    }

    function resumeExpressionEvalCountdown() {
      var ctx = getCtx();
      if (!ctx || !ctx.expressionEvalDeadlineRef) return;
      if (ctx.expressionEvalDeadlineRef.current) {
        return;
      }
      var resumeMs = Math.max(0, ctx.expressionEvalPausedRemainingRef.current || 0);
      if (resumeMs > 0) {
        ctx.expressionEvalDeadlineRef.current = Date.now() + resumeMs;
        ctx.setExpressionEvalMsLeft(resumeMs);
        scheduleExpressionEvalEnable(resumeMs);
        var armedIdx = ctx.getSafeCurrentQuestionIndex();
        var armedQ = ctx.questions[armedIdx];
        if (armedQ && armedQ.query_type === "הבעה") {
          scheduleExpressionAnswerEndMark(armedQ, resumeMs);
        }
      } else {
        ctx.setEvaluationEnabled(true);
        ctx.setExpressionEvalMsLeft(0);
      }
    }

    return {
      clearExpressionEvalEnableTimer: clearExpressionEvalEnableTimer,
      clearExpressionAnswerEndTimer: clearExpressionAnswerEndTimer,
      scheduleExpressionEvalEnable: scheduleExpressionEvalEnable,
      scheduleExpressionAnswerEndMark: scheduleExpressionAnswerEndMark,
      freezeExpressionEvalCountdown: freezeExpressionEvalCountdown,
      resumeExpressionEvalCountdown: resumeExpressionEvalCountdown,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionTimers = createExpressionTimers;
})();
