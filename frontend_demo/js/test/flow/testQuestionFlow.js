/**
 * Question load, index updates, expression question-end marks.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createQuestionFlow(getCtx) {
    function markCurrentQuestionEndTimestamp() {
      var ctx = getCtx();
      if (!(ctx.permission || ctx.microphoneSkipped) || !ctx.voiceIdentifierConfirmed) return;
      if (!SessionRecorder || !SessionRecorder.markQuestionEnd) return;
      var currentIdx = ctx.getSafeCurrentQuestionIndex();
      if (currentIdx < 0 || currentIdx >= ctx.questions.length) return;
      var currentQ = ctx.questions[currentIdx];
      if (!currentQ || currentQ.query_number == null) return;
      if (currentQ.query_type !== "הבעה") return;
      ctx.clearExpressionAnswerEndTimer();
      SessionRecorder.markQuestionEnd(currentQ.query_number);
      ctx.endExpressionAnswerRecordingCapture();
    }

    function updateCurrentQuestionIndex(newIndex) {
      var ctx = getCtx();
      var currentIdx = ctx.getSafeCurrentQuestionIndex();
      var resolvedIndex =
        typeof newIndex === "function"
          ? newIndex(currentIdx)
          : newIndex;
      var parsedResolved = parseInt(resolvedIndex, 10);
      if (!Number.isFinite(parsedResolved)) return;
      if (parsedResolved === currentIdx) return;

      markCurrentQuestionEndTimestamp();
      if (parsedResolved !== 0) {
        ctx.resetFirstQuestionRetryState();
        ctx.firstQuestionMicGateArmedRef.current = false;
      }
      ctx.setCurrentIndex(parsedResolved);
    }

    function loadQuestion(index) {
      var ctx = getCtx();
      const q = ctx.questions[index];
      if (!q) return;

      ctx.clearExpressionAnswerEndTimer();
      ctx.questionAudioAutoplayPendingRef.current = false;
      if (ctx.questionAudioRef.current) {
        try {
          ctx.questionAudioRef.current.pause();
          ctx.questionAudioRef.current.currentTime = 0;
        } catch (e) {}
        ctx.questionAudioRef.current = null;
      }
      if (ctx.questionAudio) {
        try {
          ctx.questionAudio.pause();
          ctx.questionAudio.currentTime = 0;
        } catch (e) {}
        ctx.setIsAudioPlaying(false);
      }
      if (ctx.tryAgainAudioRef.current) {
        try {
          ctx.tryAgainAudioRef.current.pause();
          ctx.tryAgainAudioRef.current.currentTime = 0;
        } catch (e) {}
        ctx.tryAgainAudioRef.current.onended = null;
      }
      // Clear previous question visuals immediately to avoid stale-image flash while switching.
      ctx.setCurrentQuestionImagesLoaded(false);
      ctx.setImages([]);

      if (ctx.fireworksTimerRef.current) { clearTimeout(ctx.fireworksTimerRef.current); ctx.fireworksTimerRef.current = null; }
      ctx.setFireworksVisible(false);
      ctx.setShowContinue(false);
      ctx.setClickedCorrect(false);
      ctx.setClickedMultiAnswers([]);
      ctx.setAllClickedAnswers([]);
      ctx.setOrderedClickSequence([]);
      ctx.setMultiAttemptCount(0);
      ctx.setMaskImage(null);
      ctx.setMaskCanvas(null);

      ctx.maskAwaitingSecondRef.current = false;
      ctx.singleComprehensionRetryRef.current = false;
      ctx.multiWrongClicksRef.current = 0;
      ctx.comprehensionAdvanceLockRef.current = false;
      ctx.orderedRescueActiveRef.current = false;
      ctx.orderedRescueTargetRef.current = null;
      ctx.incompleteFinishDialogPausedByUsRef.current = false;
      ctx.setIncompleteSummaryConfirmOpen(false);

      // Handle n|m format for two-row layout
      let imgCount, isTwoRow = false, topRowCount = 0, topRowBigger = false;
      if (q.image_count.includes('|')) {
        const parts = q.image_count.split('|');
        topRowCount = parseInt(parts[0], 10);
        imgCount = parseInt(parts[1], 10);
        isTwoRow = true;
        topRowBigger = topRowCount < (imgCount / 2);
      } else {
        imgCount = parseInt(q.image_count, 10) || 1;
      }

      // Parse answer field to determine answer type (needed before image URLs for mask questions)
      const answerStr = (q.answer || "").trim();

      const imgs = [];
      for (let i = 1; i <= imgCount; i++) {
        imgs.push(
          answerStr === "A"
            ? ImageLoader.getImageUrlPng(q.query_number, i)
            : ImageLoader.getImageUrl(q.query_number, i)
        );
      }

      if (answerStr === "A") {
        // Mask answer type: load A.png only (mask assets stay PNG for click-region detection)
        ctx.setAnswerType("mask");
        const maskUrl = "resources/test_assets/" + q.query_number + "/A.png";

        // Load mask image and draw to canvas for pixel detection
        const mask = new Image();
        mask.crossOrigin = "anonymous";
        mask.onload = function () {
          const canvas = document.createElement('canvas');
          canvas.width = mask.width;
          canvas.height = mask.height;
          const canvasCtx = canvas.getContext('2d');
          canvasCtx.drawImage(mask, 0, 0);
          ctx.setMaskCanvas(canvas);
          ctx.setMaskImage(mask);
        };
        mask.onerror = function () {
          console.error('Failed to load mask image:', maskUrl);
        };
        mask.src = maskUrl;

        ctx.setTarget("");
        ctx.setMultiAnswers([]);
        ctx.setMinCorrectAnswers(null);
        ctx.setOrderedAnswers([]);
      } else if (answerStr.startsWith("x") && answerStr.includes("|")) {
        // Non-clickable image format: "xn|m" where n is non-clickable, m is correct
        ctx.setAnswerType("single");
        const parts = answerStr.substring(1).split("|");
        const nonClickableNum = parseInt(parts[0], 10);
        const correctNum = parseInt(parts[1], 10);
        ctx.setNonClickableImage(nonClickableNum);
        const targetPath = ImageLoader.getImageUrl(q.query_number, correctNum);
        ctx.setTarget(targetPath);
        ctx.setMultiAnswers([]);
        ctx.setOrderedAnswers([]);
      } else if (answerStr.includes(",")) {
        // Multi-answer type: "1,2,3,4,10" or "3,4,6,7,8|4" (with minimum)
        ctx.setAnswerType("multi");
        let answersStr = answerStr;
        let minRequired = null;

        // Check if there's a minimum requirement (format: "answers|min")
        if (answerStr.includes("|")) {
          const parts = answerStr.split("|");
          answersStr = parts[0];
          minRequired = parseInt(parts[1].trim(), 10);
        }

        const answers = answersStr.split(",").map(function (a) {
          return parseInt(a.trim(), 10);
        });
        ctx.setMultiAnswers(answers);
        ctx.setMinCorrectAnswers(minRequired); // Set minimum if specified, otherwise null
        ctx.setTarget(""); // Not used for multi-answer
      } else if (answerStr.includes("->")) {
        // Ordered answer type: "2->1"
        ctx.setAnswerType("ordered");
        const answers = answerStr.split("->").map(function (a) {
          return parseInt(a.trim(), 10);
        });
        ctx.setOrderedAnswers(answers);
        ctx.setTarget(""); // Not used for ordered answer
      } else {
        // Single answer type (original behavior)
        ctx.setAnswerType("single");
        const answerNum = parseInt(answerStr, 10) || 1;
        const targetPath = ImageLoader.getImageUrl(q.query_number, answerNum);
        ctx.setTarget(targetPath);
        ctx.setMultiAnswers([]);
        ctx.setOrderedAnswers([]);
      }

      ctx.setImages(imgs);
      ctx.setQuestionType(q.query_type === "הבנה" ? "C" : "E");
      ctx.setExpressionEvalArmed(false);
      ctx.expressionEvalArmedQuestionRef.current = null;
      if ((ctx.permission || ctx.microphoneSkipped) && ctx.voiceIdentifierConfirmed) { //check if the microphone permission stage is over
        //play the audio

        // Load and play question audio
        const audioFolder = ctx.getQuestionAudioFolderByGender(ctx.childGender);
        const audioUrl = "resources/questions_audio/" + audioFolder + "/audio_" + q.query_number + ".mp3";
        const audio = new Audio(audioUrl);
        audio.onended = function () {
          ctx.setIsAudioPlaying(false);
          if (q.query_type === "הבעה") {
            ctx.markExpressionTimestampAndArm(q);
          }
        };
        audio.onerror = function () {
          console.warn('Audio file not found for question:', q.query_number);
          if (q.query_type === "הבעה") {
            ctx.markExpressionTimestampAndArm(q);
          }
        };
        ctx.questionAudioRef.current = audio;
        ctx.setQuestionAudio(audio);
        // Autoplay runs in autoplayQuestionAudioAfterImagesReady once photos + loading gate clear.
        if (q.query_type !== "הבעה" || (ctx.micCheckPassed && ctx.expIntroVideoComplete)) {
          ctx.questionAudioAutoplayPendingRef.current = true;
        }
      }

      // Set two-row layout states
      ctx.setIsTwoRow(isTwoRow);
      ctx.setTopRowCount(topRowCount);
      ctx.setTopRowBigger(topRowBigger);

      // Set comment states - ensure we get the comment from the question object
      const comment = (q.comments && q.comments.trim()) || "";
      ctx.setCommentText(comment);

      // Reset non-clickable image
      ctx.setNonClickableImage(null);
    }

    return {
      markCurrentQuestionEndTimestamp: markCurrentQuestionEndTimestamp,
      updateCurrentQuestionIndex: updateCurrentQuestionIndex,
      loadQuestion: loadQuestion,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createQuestionFlow = createQuestionFlow;
})();
