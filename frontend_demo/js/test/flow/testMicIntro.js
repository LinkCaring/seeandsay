/**
 * Mic check loop, expression mic gate, compr/exp intro navigation helpers.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createMicIntro(getCtx) {
    async function ensureAudioContextRunning(audioCtx) {
      if (!audioCtx || audioCtx.state === "closed") return false;
      if (audioCtx.state === "running") return true;
      try {
        await audioCtx.resume();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
      } catch (resumeErr) {
        console.warn("[micCheck] audioCtx.resume failed", resumeErr);
        return false;
      }
      console.log("[micCheck] audioCtx.state after resume:", audioCtx.state);
      return audioCtx.state === "running";
    }

    function stopMicrophoneCheck() {
      var ctx = getCtx();
      if (!ctx || !ctx.micCheckRafRef) return;
      if (ctx.micCheckRafRef.current) {
        cancelAnimationFrame(ctx.micCheckRafRef.current);
        ctx.micCheckRafRef.current = null;
      }
      if (ctx.micCheckStreamRef.current) {
        try {
          ctx.micCheckStreamRef.current.getTracks().forEach(function (track) {
            track.stop();
          });
        } catch (e) {}
        ctx.micCheckStreamRef.current = null;
      }
      if (ctx.micCheckAudioContextRef.current) {
        try {
          ctx.micCheckAudioContextRef.current.close();
        } catch (e) {}
        ctx.micCheckAudioContextRef.current = null;
      }
      ctx.micCheckAnalyserRef.current = null;
      ctx.setMicCheckRunning(false);
    }

    async function startMicrophoneCheck() {
      var ctx = getCtx();
      if (!ctx || !ctx.micCheckRafRef) return;
      stopMicrophoneCheck();
      if (!ctx.permission) return;
      ctx.setMicPermissionError("");

      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error("AudioContext not supported");
        var audioCtx = new AudioCtx();
        ctx.micCheckAudioContextRef.current = audioCtx;

        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx.micCheckStreamRef.current = stream;
        var source = audioCtx.createMediaStreamSource(stream);
        var analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        ctx.micCheckAnalyserRef.current = analyser;

        var running = await ensureAudioContextRunning(audioCtx);
        if (!running) {
          stopMicrophoneCheck();
          ctx.setMicPermissionError(ctx.tr("test.mic.check.audioNotReady"));
          return;
        }

        var data = new Uint8Array(analyser.fftSize);
        var stableFrames = 0;
        var minGoodLevel = 0.08;
        var maxGoodLevel = 0.72;
        var peak = 0;

        ctx.setMicCheckLevel(0);
        ctx.setMicCheckPeak(0);
        ctx.setMicCheckReady(false);
        ctx.setMicCheckRunning(true);

        function tick() {
          if (!ctx.micCheckAnalyserRef.current) return;
          if (audioCtx.state !== "running") {
            ctx.micCheckRafRef.current = requestAnimationFrame(tick);
            return;
          }
          analyser.getByteTimeDomainData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++) {
            var centered = (data[i] - 128) / 128;
            sum += centered * centered;
          }
          var rms = Math.sqrt(sum / data.length);
          var level = Math.max(0, Math.min(1, rms));
          if (level > peak) {
            peak = level;
            ctx.setMicCheckPeak(peak);
          }
          ctx.setMicCheckLevel(level);

          if (level >= minGoodLevel && level <= maxGoodLevel) {
            stableFrames += 1;
          } else {
            stableFrames = Math.max(0, stableFrames - 1);
          }

          if (stableFrames >= 10 || peak >= 0.14) {
            ctx.setMicCheckReady(true);
            stopMicrophoneCheck();
            return;
          }

          ctx.micCheckRafRef.current = requestAnimationFrame(tick);
        }

        ctx.micCheckRafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        stopMicrophoneCheck();
        ctx.setMicPermissionError(ctx.tr("test.mic.deniedInline"));
      }
    }

    function isExpressionMicCheckGateActive() {
      var ctx = getCtx();
      if (
        !ctx.awaitingExpressionMicCheck ||
        !ctx.permission ||
        ctx.microphoneSkipped ||
        ctx.micCheckPassed
      ) {
        return false;
      }
      var pendingIdx = ctx.pendingFirstExpressionIndexRef.current;
      if (pendingIdx != null && pendingIdx >= 0) return true;
      var firstExpr = ctx.findFirstExpressionQuestionIndex();
      if (firstExpr < 0) return false;
      return ctx.getSafeCurrentQuestionIndex() >= firstExpr;
    }

    function applyWelcomeDirectToFirstQuestion() {
      var ctx = getCtx();
      ctx.setAwaitingExpressionMicCheck(false);
      ctx.setMicCheckPassed(false);
      ctx.setMicCheckReady(false);
      ctx.pendingFirstExpressionIndexRef.current = null;
      ctx.setPendingExpressionIntroIndex(-1);
      ctx.setForceFreshStartAfterMicCheck(false);
      ctx.setVoiceIdentifierConfirmed(true);
    }

    function tryGateExpressionMicCheckBeforeNavigatingTo(targetIdx) {
      var ctx = getCtx();
      if (ctx.microphoneSkipped || !ctx.permission) return false;
      if (ctx.micCheckPassed) return false;
      var firstExpr = ctx.findFirstExpressionQuestionIndex();
      if (firstExpr < 0 || targetIdx < firstExpr) return false;
      ctx.stopAllQuestionPlayback();
      ctx.pendingFirstExpressionIndexRef.current = targetIdx;
      ctx.setAwaitingExpressionMicCheck(true);
      return true;
    }

    function beginExpressionIntroBeforeIndex(targetIdx) {
      var ctx = getCtx();
      var firstExpr = ctx.findFirstExpressionQuestionIndex();
      if (firstExpr < 0 || targetIdx < firstExpr) return false;
      if (ctx.expIntroVideoComplete) return false;
      ctx.stopAllQuestionPlayback();
      ctx.pendingFirstExpressionIndexRef.current = targetIdx;
      ctx.setPendingExpressionIntroIndex(targetIdx);
      return true;
    }

    function tryDeferExpressionIntroBeforeNavigatingTo(targetIdx) {
      var ctx = getCtx();
      if (!(ctx.micCheckPassed || ctx.microphoneSkipped)) return false;
      return beginExpressionIntroBeforeIndex(targetIdx);
    }

    function continueFromExpressionMicCheck() {
      var ctx = getCtx();
      ctx.primeMediaPlaybackFromUserGesture();
      ctx.setMicCheckPassed(true);
      ctx.setMicCheckReady(false);
      ctx.setAwaitingExpressionMicCheck(false);
      stopMicrophoneCheck();
      var targetIdx = ctx.pendingFirstExpressionIndexRef.current;
      if (targetIdx == null || targetIdx < 0) {
        targetIdx = ctx.findFirstExpressionQuestionIndex();
      }
      if (targetIdx >= 0 && !ctx.expIntroVideoComplete) {
        beginExpressionIntroBeforeIndex(targetIdx);
        return;
      }
      ctx.firstQuestionMicGateArmedRef.current = true;
      ctx.resetFirstQuestionRetryState();
      ctx.pendingFirstExpressionIndexRef.current = null;
      ctx.setPendingExpressionIntroIndex(-1);
      if (targetIdx >= 0) {
        ctx.updateCurrentQuestionIndex(targetIdx);
      }
    }

    function finishExpressionIntroVideo() {
      var ctx = getCtx();
      ctx.setExpIntroVideoComplete(true);
      ctx.firstQuestionMicGateArmedRef.current = true;
      ctx.resetFirstQuestionRetryState();
      var targetIdx = ctx.pendingExpressionIntroIndex;
      if (targetIdx < 0) {
        targetIdx = ctx.pendingFirstExpressionIndexRef.current;
      }
      if (targetIdx == null || targetIdx < 0) {
        targetIdx = ctx.findFirstExpressionQuestionIndex();
      }
      ctx.pendingFirstExpressionIndexRef.current = null;
      ctx.setPendingExpressionIntroIndex(-1);
      if (targetIdx >= 0) {
        ctx.updateCurrentQuestionIndex(targetIdx);
      }
    }

    async function ensureExpressionPhaseRecording() {
      var ctx = getCtx();
      if (!ctx.permission || !ctx.voiceIdentifierConfirmed) return false;
      if (ctx.expressionPhaseRecordingStartedRef.current) {
        return !!(
          typeof SessionRecorder !== "undefined" &&
          SessionRecorder.isRecordingActive &&
          SessionRecorder.isRecordingActive()
        );
      }
      if (typeof SessionRecorder === "undefined" || !SessionRecorder.startContinuousRecording) {
        return false;
      }
      try {
        if (typeof SessionRecorder.stopContinuousRecording === "function") {
          SessionRecorder.stopContinuousRecording();
        }
        SessionRecorder.cleanup();
        SessionRecorder.resetTimestamps();
        var started = await SessionRecorder.startContinuousRecording();
        if (started) {
          ctx.expressionPhaseRecordingStartedRef.current = true;
          ctx.setSessionRecordingStarted(true);
          if (SessionRecorder.pauseRecordingIfActive) {
            SessionRecorder.pauseRecordingIfActive();
          }
          console.log("🎙️ Expression-phase recording started (timestamps from first הבעה)");
          return true;
        }
      } catch (e) {
        console.error("ensureExpressionPhaseRecording:", e);
      }
      return false;
    }

    return {
      stopMicrophoneCheck: stopMicrophoneCheck,
      startMicrophoneCheck: startMicrophoneCheck,
      isExpressionMicCheckGateActive: isExpressionMicCheckGateActive,
      applyWelcomeDirectToFirstQuestion: applyWelcomeDirectToFirstQuestion,
      tryGateExpressionMicCheckBeforeNavigatingTo: tryGateExpressionMicCheckBeforeNavigatingTo,
      beginExpressionIntroBeforeIndex: beginExpressionIntroBeforeIndex,
      tryDeferExpressionIntroBeforeNavigatingTo: tryDeferExpressionIntroBeforeNavigatingTo,
      continueFromExpressionMicCheck: continueFromExpressionMicCheck,
      finishExpressionIntroVideo: finishExpressionIntroVideo,
      ensureExpressionPhaseRecording: ensureExpressionPhaseRecording,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createMicIntro = createMicIntro;
})();
