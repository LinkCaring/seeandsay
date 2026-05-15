function Test({ allQuestions, lang, t, onHome, onReset, setLang, onTestPhase }) {
  const PRIVACY_POLICY_URL = "https://www.heb.linkcaring.com/privacy-policy";
  const TERMS_OF_USE_URL = "https://www.heb.linkcaring.com/terms-of-use";
  const tr = function (key, vars) {
    return t ? t(key, vars) : key;
  };
  const getQuestionAudioFolderByGender = function (genderValue) {
    const normalized = String(genderValue || "").toLowerCase();
    if (normalized === "female" || normalized === "girl") return "audio_girl";
    return "audio_boy";
  };

  function trafficResultToHeadlight(result) {
    if (result === "success") return "correct";
    if (result === "partial") return "partly";
    return "wrong";
  }

  function readBlobAsDataURL(blob) {
    return new Promise(function (resolve, reject) {
      if (!blob) {
        resolve(null);
        return;
      }
      var reader = new FileReader();
      reader.onloadend = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Wait for enough buffer before question MP3 play (all questions: autoplay + replay).
   * Prefer canplaythrough; fallback after timeout if loadeddata is available.
   */
  function playAudioWhenReady(audioEl, options) {
    options = options || {};
    var timeoutMs = options.timeoutMs != null ? options.timeoutMs : 10000;
    var isStale = options.isStale;

    if (!audioEl) {
      return Promise.resolve(null);
    }

    function canPlayThroughReady() {
      return audioEl.readyState >= 4;
    }

    function hasLoadedData() {
      return audioEl.readyState >= 2;
    }

    return new Promise(function (resolve) {
      if (typeof isStale === "function" && isStale()) {
        resolve(null);
        return;
      }
      if (canPlayThroughReady()) {
        resolve(audioEl.play());
        return;
      }

      var settled = false;
      function cleanup() {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timerId);
        audioEl.removeEventListener("canplaythrough", onCanPlayThrough);
        audioEl.removeEventListener("loadeddata", onLoadedData);
      }
      function tryPlay() {
        if (typeof isStale === "function" && isStale()) {
          cleanup();
          resolve(null);
          return;
        }
        cleanup();
        try {
          resolve(audioEl.play());
        } catch (e) {
          resolve(Promise.reject(e));
        }
      }
      function onCanPlayThrough() {
        tryPlay();
      }
      function onLoadedData() {
        if (canPlayThroughReady()) {
          tryPlay();
        }
      }

      audioEl.addEventListener("canplaythrough", onCanPlayThrough);
      audioEl.addEventListener("loadeddata", onLoadedData);
      try {
        if (audioEl.readyState === 0) {
          audioEl.load();
        }
      } catch (eLoad) {}

      var timerId = setTimeout(function () {
        if (hasLoadedData()) {
          console.warn(
            "[See&Say] Question audio canplaythrough timeout; playing after loadeddata"
          );
        } else {
          console.warn(
            "[See&Say] Question audio still buffering; attempting play anyway"
          );
        }
        tryPlay();
      }, timeoutMs);
    });
  }

  function applyQuestionAudioPlaySuccess(audioEl) {
    if (!audioEl || questionAudioMuted) {
      return;
    }
    if (questionAudioRef.current && questionAudioRef.current !== audioEl) {
      return;
    }
    setIsAudioPlaying(true);
  }

  function handleQuestionAudioPlayFailure(err, audioEl, isFirstQuestion, questionNumber) {
    console.warn("Question audio play failed:", err);
    setIsAudioPlaying(false);
    if (isFirstQuestion && audioEl) {
      scheduleFirstQuestionAutoRetry(audioEl, questionNumber);
    }
  }

  function getExpressionQuestionAudioDelayMs() {
    if (
      typeof window !== "undefined" &&
      window.SEEANDSAY_EXPRESSION_QUESTION_AUDIO_DELAY_MS != null
    ) {
      var n = parseInt(window.SEEANDSAY_EXPRESSION_QUESTION_AUDIO_DELAY_MS, 10);
      if (!Number.isNaN(n) && n >= 0) {
        return n;
      }
    }
    return 1000;
  }

  function delayMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms));
    });
  }

  function isExpressionQuestionRow(q) {
    return !!(q && q.query_type === "הבעה");
  }

  /**
   * Expression (הבעה): wait so prior clip encode/upload can finish off the reading hot path,
   * then play. Worker only encodes MP3; decodeAudioData + base64 upload still use main thread.
   */
  function prepareThenPlayQuestionAudio(audioEl, options) {
    options = options || {};
    var isFirstQuestionAutoplay = !!options.isFirstQuestionAutoplay;
    var questionNumber =
      options.questionNumber != null ? String(options.questionNumber) : "";
    var q = options.question;

    if (!audioEl || questionAudioMuted) {
      return;
    }
    if (questionAudioRef.current !== audioEl) {
      return;
    }

    function doPlay() {
      if (questionAudioMuted || questionAudioRef.current !== audioEl) {
        return;
      }
      if (
        SessionRecorder &&
        SessionRecorder.setQuestionReadingActive
      ) {
        SessionRecorder.setQuestionReadingActive(true);
      }
      audioEl.currentTime = 0;
      playAudioWhenReady(audioEl, {
        isStale: function () {
          return questionAudioRef.current !== audioEl;
        },
      })
        .then(function (playP) {
          if (!playP) return;
          if (playP && typeof playP.then === "function") {
            return playP.then(function () {
              applyQuestionAudioPlaySuccess(audioEl);
            });
          }
          applyQuestionAudioPlaySuccess(audioEl);
        })
        .catch(function (err) {
          handleQuestionAudioPlayFailure(
            err,
            audioEl,
            isFirstQuestionAutoplay,
            questionNumber
          );
        });
    }

    var gapMs = isExpressionQuestionRow(q) ? getExpressionQuestionAudioDelayMs() : 0;
    var chain = Promise.resolve();
    if (
      gapMs > 0 &&
      SessionRecorder &&
      SessionRecorder.drainExpressionClipEncodeBeforeRead
    ) {
      chain = SessionRecorder.drainExpressionClipEncodeBeforeRead();
    }
    chain
      .then(function () {
        return delayMs(gapMs);
      })
      .then(doPlay);
  }

  /** Set true to show the expression (הבעה) hint bulb + hint-driven scoring rules again. */
  var ENABLE_EXPRESSION_HINTS = false;
  var EXPRESSION_EVAL_DELAY_MS = 30000;

  const [trafficPopupOpen, setTrafficPopupOpen] = React.useState(false);
  const [trafficPopupChoice, setTrafficPopupChoice] = React.useState(null); // "success" | "partial" | "midFailure" | "failure" | null
  const trafficPopupJustOpenedRef = React.useRef(false);
  // ============================================================================
  // STATE DECLARATIONS
  // ============================================================================

  const [questions, setQuestions] = React.useState([]);

  // Persistent states
  const [ageYears, setAgeYears] = usePersistentState("ageYears", "");
  const [ageMonths, setAgeMonths] = usePersistentState("ageMonths", "");
  const [idDigits, setId] = usePersistentState("idDigits", "");
  const [childName, setChildName] = usePersistentState("childName", "");
  const [childGender, setChildGender] = usePersistentState("childGender", "");
  const [childDob, setChildDob] = usePersistentState("childDob", "");
  const [recordingConsent, setRecordingConsent] = usePersistentState("recordingConsent", false);
  const [legalConfirmation, setLegalConfirmation] = usePersistentState("legalConfirmation", false);
  const [ageConfirmed, setAgeConfirmed] = usePersistentState("ageConfirmed", false);
  const [ageInvalid, setAgeInvalid] = usePersistentState("ageInvalid", false);
  const [currentIndex, setCurrentIndex] = usePersistentState("currentIndex", 0);
  const [correctAnswers, setCorrectAnswers] = usePersistentState("correctAnswers", 0);
  const [partialAnswers, setPartialAnswers] = usePersistentState("partialAnswers", 0);
  const [wrongAnswers, setWrongAnswers] = usePersistentState("wrongAnswers", 0);
  const [devMode, setDevMode] = usePersistentState("devMode", false)
  const [devJumpValue, setDevJumpValue] = React.useState("");
  const [evaluationEnabled, setEvaluationEnabled] = React.useState(false);
  const [expressionTrafficSubmitted, setExpressionTrafficSubmitted] = React.useState(false);
  const [expressionAdvanceLock, setExpressionAdvanceLock] = React.useState(false);
  const [expressionEvalMsLeft, setExpressionEvalMsLeft] = React.useState(EXPRESSION_EVAL_DELAY_MS);
  const [expressionEvalArmed, setExpressionEvalArmed] = React.useState(false);
  const expressionEvalDeadlineRef = React.useRef(null);
  const expressionEvalPausedRemainingRef = React.useRef(EXPRESSION_EVAL_DELAY_MS);
  const expressionEvalEnableTimerRef = React.useRef(null);
  const expressionEvalArmedQuestionRef = React.useRef(null);

  function clearExpressionEvalEnableTimer() {
    if (expressionEvalEnableTimerRef.current != null) {
      clearTimeout(expressionEvalEnableTimerRef.current);
      expressionEvalEnableTimerRef.current = null;
    }
  }

  function scheduleExpressionEvalEnable(ms) {
    clearExpressionEvalEnableTimer();
    var delay = Math.max(0, ms);
    if (delay <= 0) {
      setEvaluationEnabled(true);
      setExpressionEvalMsLeft(0);
      expressionEvalDeadlineRef.current = null;
      return;
    }
    expressionEvalEnableTimerRef.current = setTimeout(function () {
      expressionEvalEnableTimerRef.current = null;
      setEvaluationEnabled(true);
      setExpressionEvalMsLeft(0);
      expressionEvalDeadlineRef.current = null;
    }, delay);
  }

  function freezeExpressionEvalCountdown() {
    clearExpressionEvalEnableTimer();
    if (expressionEvalDeadlineRef.current) {
      var remainingMs = Math.max(0, expressionEvalDeadlineRef.current - Date.now());
      expressionEvalPausedRemainingRef.current = remainingMs;
      setExpressionEvalMsLeft(remainingMs);
      expressionEvalDeadlineRef.current = null;
    }
    if (
      typeof SessionRecorder !== "undefined" &&
      SessionRecorder.freezeExpressionClipActiveCap
    ) {
      SessionRecorder.freezeExpressionClipActiveCap();
    }
  }

  function resumeExpressionEvalCountdown() {
    if (expressionEvalDeadlineRef.current) {
      return;
    }
    var resumeMs = Math.max(0, expressionEvalPausedRemainingRef.current || 0);
    if (resumeMs > 0) {
      expressionEvalDeadlineRef.current = Date.now() + resumeMs;
      setExpressionEvalMsLeft(resumeMs);
      if (
        typeof SessionRecorder !== "undefined" &&
        SessionRecorder.alignExpressionClipActiveCapToUiMs
      ) {
        SessionRecorder.alignExpressionClipActiveCapToUiMs(resumeMs);
      }
      scheduleExpressionEvalEnable(resumeMs);
    } else {
      setEvaluationEnabled(true);
      setExpressionEvalMsLeft(0);
    }
  }
  // Track full array of question results: [{questionNumber, result}, ...]
  const [questionResults, setQuestionResults] = usePersistentState("questionResults", []);

  // Transcription state
  const [transcription, setTranscription] = React.useState(null);
  const [lastCompletedTestId, setLastCompletedTestId] = usePersistentState("lastCompletedTestId", null);
  const [expressionAiResult, setExpressionAiResult] = usePersistentState("expressionAiResult", null);
  const [expressionAiLoading, setExpressionAiLoading] = React.useState(false);
  /** Monotonic cap so summary progress never drops when finalize_merge recounts rows_out. */
  const expressionAiMaxProcessedRef = React.useRef(0);
  /** Which PLS frame is selected in the narrative report wheel (integrative | semantics | structure | phonology). */
  const [plsReportCategory, setPlsReportCategory] = React.useState("semantics");

  // Microphone persistent
  const [permission, setPermission] = usePersistentState("permission", false);
  const [microphoneSkipped, setMicrophoneSkipped] = usePersistentState("microphoneSkipped", false);
  const [micCheckPassed, setMicCheckPassed] = usePersistentState("micCheckPassed", false);
  const [voiceIdentifierConfirmed, setVoiceIdentifierConfirmed] = usePersistentState("voiceIdentifierConfirmed", false);
  const [micCheckRunning, setMicCheckRunning] = React.useState(false);
  const [micCheckReady, setMicCheckReady] = React.useState(false);
  const [micCheckLevel, setMicCheckLevel] = React.useState(0);
  const [micCheckPeak, setMicCheckPeak] = React.useState(0);
  const [micPermissionError, setMicPermissionError] = React.useState("");
  const micCheckStreamRef = React.useRef(null);
  const micCheckAudioContextRef = React.useRef(null);
  const micCheckAnalyserRef = React.useRef(null);
  const micCheckRafRef = React.useRef(null);

  // Reading validation states
  const [readingValidated, setReadingValidated] = usePersistentState("readingValidated", false);
  const [readingValidationResult, setReadingValidationResult] = usePersistentState("readingValidationResult", null); // null = no connection, true = valid, false = invalid
  const [readingRecordingBlob, setReadingRecordingBlob] = usePersistentState("readingRecordingBlob", null);
  const [readingValidationInProgress, setReadingValidationInProgress] = React.useState(false);
  // Store the verification audio blob for combining with test audio
  const [verificationAudioBlob, setVerificationAudioBlob] = React.useState(null);
  /** Same as `verificationAudioBlob` / `speakerVerificationStatus` but updated synchronously (avoids stale reads right after `await performSpeakerVerification`). */
  const verificationAudioBlobRef = React.useRef(null);
  const speakerVerificationStatusRef = React.useRef("idle");

  const [speakerVerificationStatus, setSpeakerVerificationStatus] = React.useState("idle");
  // idle | processing | success | failed

  const [speakerVerificationAttempts, setSpeakerVerificationAttempts] = React.useState(0);
  const [pendingVerificationBlob, setPendingVerificationBlob] = React.useState(null);
  const [mustFinishVerification, setMustFinishVerification] = React.useState(false);
  /** Fullscreen overlay on questions while first reading verification is still in flight at Finish. */
  const [blockFinishUntilVerifyOverlay, setBlockFinishUntilVerifyOverlay] = React.useState(false);
  /** questionResults snapshot when Finish was blocked — auto-complete when verify succeeds (overlay or re-read path). */
  const pendingCompleteAfterVerifyRef = React.useRef(null);
  const completeSessionRef = React.useRef(null);
  /** Server test row for incremental expression clips + finalize (null = legacy monolithic upload). */
  const [draftTestId, setDraftTestId] = React.useState(null);
  const draftTestIdRef = React.useRef(null);
  React.useEffect(
    function () {
      draftTestIdRef.current = draftTestId;
    },
    [draftTestId]
  );
  /**
   * Fullscreen go-home overlay: draft could not be created at start, or expression clip could not be saved mid-test.
   * null | 'draftStart' | 'clipSave'
   */
  const [sessionGoHomeBlock, setSessionGoHomeBlock] = React.useState(null);
  const clipUploadPromisesRef = React.useRef([]);

  // Session-only states
  const [images, setImages] = React.useState([]);
  const [target, setTarget] = React.useState("");
  const [showContinue, setShowContinue] = React.useState(false);
  const [clickedCorrect, setClickedCorrect] = React.useState(false);
  const [fireworksVisible, setFireworksVisible] = React.useState(false);
  const [showClappingAvatar, setShowClappingAvatar] = React.useState(false);
  const [consecutiveSuccessStreak, setConsecutiveSuccessStreak] = React.useState(0);
  const [sessionCompleted, setSessionCompleted] = usePersistentState("sessionCompleted", false);
  const [questionType, setQuestionType] = React.useState("C");

  // Two-row layout states
  const [isTwoRow, setIsTwoRow] = React.useState(false);
  const [topRowCount, setTopRowCount] = React.useState(0);
  const [topRowBigger, setTopRowBigger] = React.useState(false);
  const [nonClickableImage, setNonClickableImage] = React.useState(null);

  // Hint states
  const [showHint, setShowHint] = React.useState(false);
  const [hintText, setHintText] = React.useState("");
  const [commentText, setCommentText] = React.useState("");

  // Multi-answer and ordered answer states
  const [answerType, setAnswerType] = React.useState("single"); // "single", "multi", "ordered", "mask"
  const [multiAnswers, setMultiAnswers] = React.useState([]); // Array of correct answer indices
  const [clickedMultiAnswers, setClickedMultiAnswers] = React.useState([]); // Array of clicked correct answers
  const [allClickedAnswers, setAllClickedAnswers] = React.useState([]); // Array of all clicked answers (for multi)
  const [minCorrectAnswers, setMinCorrectAnswers] = React.useState(null); // Minimum number of correct answers required (for multi with minimum)
  const [multiAttemptCount, setMultiAttemptCount] = React.useState(0); // Multi clicks in current question (includes repeats)
  const [orderedAnswers, setOrderedAnswers] = React.useState([]); // Array of answer indices in order
  const [orderedClickSequence, setOrderedClickSequence] = React.useState([]); // Sequence of clicks

  // Mask answer states
  const [maskImage, setMaskImage] = React.useState(null); // HTMLImageElement for the mask
  const [maskCanvas, setMaskCanvas] = React.useState(null); // Canvas for pixel detection

  /** Comprehension auto-scoring + expression traffic: hint used this question. */
  const [hintWasUsedThisQuestion, setHintWasUsedThisQuestion] = React.useState(false);
  const hintEverOpenedRef = React.useRef(false);
  const maskAwaitingSecondRef = React.useRef(false);
  const singleComprehensionRetryRef = React.useRef(false);
  const multiWrongClicksRef = React.useRef(0);
  const multiAutoHintDoneRef = React.useRef(false);
  const comprehensionAdvanceLockRef = React.useRef(false);
  /** Ordered (2-step): rescue tap after duplicate first; four-image questions use a 3-click cap (partial if clicks 2–3 are first→second). */
  const orderedRescueActiveRef = React.useRef(false);
  const orderedRescueTargetRef = React.useRef(null); // 1-based image index
  const [incompleteSummaryConfirmOpen, setIncompleteSummaryConfirmOpen] = React.useState(false);

  function registerHintOpened() {
    if (questionType === "E" && !ENABLE_EXPRESSION_HINTS) return;
    hintEverOpenedRef.current = true;
    setHintWasUsedThisQuestion(true);
  }

  function openHintProgrammatic() {
    if (questionType === "C") return;
    if (questionType === "E" && !ENABLE_EXPRESSION_HINTS) return;
    registerHintOpened();
    setShowHint(true);
  }

  function stopMicrophoneCheck() {
    if (micCheckRafRef.current) {
      cancelAnimationFrame(micCheckRafRef.current);
      micCheckRafRef.current = null;
    }
    if (micCheckStreamRef.current) {
      try {
        micCheckStreamRef.current.getTracks().forEach(function (track) { track.stop(); });
      } catch (e) {}
      micCheckStreamRef.current = null;
    }
    if (micCheckAudioContextRef.current) {
      try {
        micCheckAudioContextRef.current.close();
      } catch (e) {}
      micCheckAudioContextRef.current = null;
    }
    micCheckAnalyserRef.current = null;
    setMicCheckRunning(false);
  }

  async function startMicrophoneCheck() {
    stopMicrophoneCheck();
    if (!permission) return;
    setMicPermissionError("");

    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micCheckStreamRef.current = stream;
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error("AudioContext not supported");
      var ctx = new AudioCtx();
      micCheckAudioContextRef.current = ctx;
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      micCheckAnalyserRef.current = analyser;
      var data = new Uint8Array(analyser.fftSize);
      var stableFrames = 0;
      var minGoodLevel = 0.08;
      var maxGoodLevel = 0.72;
      var peak = 0;

      setMicCheckLevel(0);
      setMicCheckPeak(0);
      setMicCheckReady(false);
      setMicCheckRunning(true);

      function tick() {
        if (!micCheckAnalyserRef.current) return;
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
          setMicCheckPeak(peak);
        }
        setMicCheckLevel(level);

        if (level >= minGoodLevel && level <= maxGoodLevel) {
          stableFrames += 1;
        } else {
          stableFrames = Math.max(0, stableFrames - 1);
        }

        if (stableFrames >= 10 || peak >= 0.14) {
          setMicCheckReady(true);
          stopMicrophoneCheck();
          return;
        }

        micCheckRafRef.current = requestAnimationFrame(tick);
      }

      micCheckRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stopMicrophoneCheck();
      setMicPermissionError(tr("test.mic.deniedInline"));
    }
  }

  // Continuous recording state (persistent so it survives refresh)
  const [sessionRecordingStarted, setSessionRecordingStarted] = usePersistentState("sessionRecordingStarted", false);
  const [forceFreshStartAfterMicCheck, setForceFreshStartAfterMicCheck] = usePersistentState("forceFreshStartAfterMicCheck", false);

  // Pause state (persistent)
  const [isPaused, setIsPaused] = usePersistentState("testPaused", false);
  function enforceFreshRunStartFromQuestionOne() {
    [
      "currentIndex",
      "questionResults",
      "correctAnswers",
      "partialAnswers",
      "wrongAnswers",
      "sessionCompleted",
      "sessionRecordingStarted",
      "testPaused",
      "audioChunks",
      "audioUrl",
      "recPaused",
      "sessionRecordingActive",
      "sessionRecordingUrl",
      "sessionRecordingFinal",
      "sessionRecordingFinalMeta",
      "sessionRecordingChunks",
      "recordingStartTime",
      "questionTimestamps",
      "recordingPaused",
      "pauseStartTime",
      "totalPausedTime",
      "readingRecordingBlob",
      "forceFreshStartAfterMicCheck",
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    if (SessionRecorder && SessionRecorder.resetTimestamps) {
      SessionRecorder.resetTimestamps();
    }
    if (SessionRecorder && SessionRecorder.cleanup) {
      SessionRecorder.cleanup({ preserveQuestionTimestamps: false });
    }
    setCurrentIndex(0);
    setQuestionResults([]);
    setCorrectAnswers(0);
    setPartialAnswers(0);
    setWrongAnswers(0);
    setSessionCompleted(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setShowContinue(false);
    setExpressionTrafficSubmitted(false);
    setExpressionAdvanceLock(false);
    setExpressionEvalMsLeft(EXPRESSION_EVAL_DELAY_MS);
    setEvaluationEnabled(false);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setAllClickedAnswers([]);
    setMultiAttemptCount(0);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);
    consecutiveCompFailRef.current = 0;
    consecutiveExprFailRef.current = 0;
    setForceFreshStartAfterMicCheck(false);
  }

  const isPausedRef = React.useRef(isPaused);
  isPausedRef.current = isPaused;
  const sessionCompletedRef = React.useRef(sessionCompleted);
  sessionCompletedRef.current = sessionCompleted;
  const voiceIdentifierConfirmedRef = React.useRef(voiceIdentifierConfirmed);
  voiceIdentifierConfirmedRef.current = voiceIdentifierConfirmed;

  // AFK timer states
  const [afkTimerActive, setAfkTimerActive] = React.useState(false);
  const [showAfkWarning, setShowAfkWarning] = React.useState(false);
  const afkTimerRef = React.useRef(null);
  const afkWarningTimerRef = React.useRef(null);
  const dobInputRef = React.useRef(null);

  // Image loading state
  const [currentQuestionImagesLoaded, setCurrentQuestionImagesLoaded] = React.useState(false);
  const [showQuestionLoadingRecovery, setShowQuestionLoadingRecovery] = React.useState(false);

  const isMountedRef = React.useRef(true);
  /** Bumped when invalidating in-flight reading verification (retry, re-sample, new Continue). */
  const readingVerificationGenRef = React.useRef(0);
  /** Which `gen` last set speaker status to `"processing"` (so stale runs can clear it safely). */
  const readingVerifyProcessingOwnerGenRef = React.useRef(null);

  // Mobile detection - must be before any early returns
  const isMobile = React.useMemo(function () {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 640px)").matches;
  }, []);

  const isPortraitMobile = React.useMemo(function () {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
}, []);

  /**
   * Speaker verification for the reading sample (runs in background after Continue).
   * @param {number} gen Generation from `readingVerificationGenRef`; stale results are ignored.
   * @returns {"success"|"invalid"|"error"|"stale"}
   */
  const performSpeakerVerification = async function (recordingBlob, gen) {
    function clearStaleProcessing() {
      if (gen != null && readingVerifyProcessingOwnerGenRef.current === gen) {
        readingVerifyProcessingOwnerGenRef.current = null;
        setSpeakerVerificationStatus("idle");
        speakerVerificationStatusRef.current = "idle";
      }
    }
    function isStale() {
      return gen != null && gen !== readingVerificationGenRef.current;
    }
    try {
      if (isStale()) {
        return "stale";
      }
      setSpeakerVerificationStatus("processing");
      speakerVerificationStatusRef.current = "processing";
      readingVerifyProcessingOwnerGenRef.current = gen;

      const audioBase64 = await blobToBase64(recordingBlob);
      if (isStale()) {
        clearStaleProcessing();
        return "stale";
      }

      setReadingRecordingBlob(audioBase64);

      const validationResult = await verifySpeaker(idDigits, audioBase64);
      if (isStale()) {
        clearStaleProcessing();
        return "stale";
      }

      setSpeakerVerificationAttempts(function (prev) { return prev + 1; });

      if (validationResult === null) {
        readingVerifyProcessingOwnerGenRef.current = null;
        setReadingValidationResult(false);
        setReadingValidated(false);
        setReadingRecordingBlob(null);
        setVerificationAudioBlob(null);
        verificationAudioBlobRef.current = null;
        setSpeakerVerificationStatus("failed");
        speakerVerificationStatusRef.current = "failed";
        return "error";
      }

      if (validationResult && validationResult.success === true) {
        readingVerifyProcessingOwnerGenRef.current = null;
        setReadingValidationResult(true);
        setReadingValidated(true);
        setVerificationAudioBlob(recordingBlob);
        verificationAudioBlobRef.current = recordingBlob;
        setSpeakerVerificationStatus("success");
        speakerVerificationStatusRef.current = "success";
        return "success";
      }

      if (validationResult && validationResult.success === false) {
        readingVerifyProcessingOwnerGenRef.current = null;
        setReadingValidationResult(false);
        setReadingValidated(false);
        setReadingRecordingBlob(null);
        setVerificationAudioBlob(null);
        verificationAudioBlobRef.current = null;
        setSpeakerVerificationStatus("failed");
        speakerVerificationStatusRef.current = "failed";
        return "invalid";
      }

      readingVerifyProcessingOwnerGenRef.current = null;
      setReadingValidationResult(false);
      setReadingValidated(false);
      setReadingRecordingBlob(null);
      setVerificationAudioBlob(null);
      verificationAudioBlobRef.current = null;
      setSpeakerVerificationStatus("failed");
      speakerVerificationStatusRef.current = "failed";
      return "error";
    } catch (err) {
      console.error("Speaker verification failed:", err);
      if (isStale()) {
        clearStaleProcessing();
        return "stale";
      }
      readingVerifyProcessingOwnerGenRef.current = null;
      setReadingValidationResult(false);
      setReadingValidated(false);
      setReadingRecordingBlob(null);
      setVerificationAudioBlob(null);
      verificationAudioBlobRef.current = null;
      setSpeakerVerificationStatus("failed");
      speakerVerificationStatusRef.current = "failed";
      return "error";
    }
  };

  const runSpeakerVerificationInBackground = function (recordingBlob, gen) {
    performSpeakerVerification(recordingBlob, gen).catch(function (err) {
      console.error("Background speaker verification:", err);
    });
  };

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function () {
      const result = reader.result;
      if (!result) {
        reject(new Error("Failed to convert blob to base64"));
        return;
      }
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

  function getImageFallbackUrls(url, pngFirst) {
    if (!url) return [];
    if (pngFirst) {
      if (/\.png$/i.test(url)) {
        return [url, url.replace(/\.png$/i, ".webp")];
      }
      if (/\.webp$/i.test(url)) {
        return [url.replace(/\.webp$/i, ".png"), url];
      }
      return [url];
    }
    if (/\.png$/i.test(url)) {
      return [url.replace(/\.png$/i, ".webp"), url];
    }
    if (/\.webp$/i.test(url)) {
      return [url, url.replace(/\.webp$/i, ".png")];
    }
    return [url];
  }

  function handleImageFallbackError(event) {
    const imgEl = event && event.currentTarget;
    if (!imgEl) return;
    const baseSrc = imgEl.getAttribute("data-base-src") || imgEl.getAttribute("src") || "";
    const pngFirstAttr = imgEl.getAttribute("data-fallback-png-first");
    const pngFirst = pngFirstAttr === "1" || pngFirstAttr === "true";
    const candidates = getImageFallbackUrls(baseSrc, pngFirst);
    const tried = Number(imgEl.getAttribute("data-fallback-index") || 0);
    const nextIdx = tried + 1;
    if (nextIdx >= candidates.length) return;
    imgEl.setAttribute("data-fallback-index", String(nextIdx));
    imgEl.src = candidates[nextIdx];
  }

  // Adjust counts helpers
  function adjustCountsForResult(resultString, delta) {
    if (resultString === "correct") setCorrectAnswers(prev => Math.max(0, prev + delta));
    else if (resultString === "partly") setPartialAnswers(prev => Math.max(0, prev + delta));
    else if (resultString === "wrong") setWrongAnswers(prev => Math.max(0, prev + delta));
  }

  /** One row per questionNumber: last row in array order wins (legacy multi-row sessions). */
  function dedupeQuestionResultsKeepLastAttempt(results) {
    const lastByKey = new Map();
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lastByKey.set(String(r.questionNumber), r);
    }
    const keys = Array.from(lastByKey.keys()).sort(function (a, b) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
    return keys.map(function (k) { return lastByKey.get(k); });
  }

  function countBucketsFromResults(rows) {
    let c = 0;
    let p = 0;
    let w = 0;
    rows.forEach(function (r) {
      if (r.result === "correct") c++;
      else if (r.result === "partly") p++;
      else if (r.result === "wrong") w++;
    });
    return { correct: c, partly: p, wrong: w };
  }

  function questionResultsHasDuplicateQuestionNumbers(rows) {
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const k = String(rows[i].questionNumber);
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }

  // Legacy sessions may have multiple rows per question; collapse to last attempt and realign counters.
  React.useEffect(function migrateQuestionResultsLastAttemptOnly() {
    if (!questionResults.length) return;
    if (!questionResultsHasDuplicateQuestionNumbers(questionResults)) return;
    const deduped = dedupeQuestionResultsKeepLastAttempt(questionResults);
    const buckets = countBucketsFromResults(deduped);
    setQuestionResults(deduped);
    setCorrectAnswers(buckets.correct);
    setPartialAnswers(buckets.partly);
    setWrongAnswers(buckets.wrong);
  }, [questionResults]);

  function goToQuestionByNumber(value) {
  const targetIndex = Number(value) - 1;
  if (Number.isNaN(targetIndex)) return;
  if (targetIndex < 0 || targetIndex >= questions.length) return;

  updateCurrentQuestionIndex(targetIndex);
}

  React.useEffect(function cleanupMount() {
    return function () {
      isMountedRef.current = false;
      stopMicrophoneCheck();
    };
  }, []);

  // Temporary: keep Dev mode enabled by default for active testing.
  React.useEffect(function forceDevModeOnForNow() {
    if (!devMode) setDevMode(true);
  }, [devMode, setDevMode]);

  //question audio states
  const [questionAudio, setQuestionAudio] = React.useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = React.useState(false);
  const [questionAudioMuted, setQuestionAudioMuted] = React.useState(false);
  /** True after loadQuestion builds the clip — autoplay runs only once images are ready (see effect below). */
  const questionAudioAutoplayPendingRef = React.useRef(false);
  /** Active question `Audio` instance for synchronous pause/stop (state updates lag behind timers). */
  const questionAudioRef = React.useRef(null);
  const tryAgainAudioRef = React.useRef(null);
  const firstQuestionRetryTimerRef = React.useRef(null);
  const firstQuestionRetryAttemptRef = React.useRef(0);
  const firstQuestionRetryQuestionRef = React.useRef(null);
  const firstQuestionMicGateArmedRef = React.useRef(false);

  function resetFirstQuestionRetryState() {
    if (firstQuestionRetryTimerRef.current) {
      clearTimeout(firstQuestionRetryTimerRef.current);
      firstQuestionRetryTimerRef.current = null;
    }
    firstQuestionRetryAttemptRef.current = 0;
    firstQuestionRetryQuestionRef.current = null;
  }

  function scheduleFirstQuestionAutoRetry(audioEl, questionNumber) {
    if (!audioEl) return;
    if (getSafeCurrentQuestionIndex() !== 0) return;
    if (questionAudioMuted || isPausedRef.current || sessionCompletedRef.current) return;
    var qn = String(questionNumber || "");
    if (!qn) return;
    if (firstQuestionRetryQuestionRef.current !== qn) {
      firstQuestionRetryQuestionRef.current = qn;
      firstQuestionRetryAttemptRef.current = 0;
    }
    var attempt = firstQuestionRetryAttemptRef.current;
    var retryDelays = [140, 320, 700];
    if (attempt >= retryDelays.length) return;
    if (firstQuestionRetryTimerRef.current) {
      clearTimeout(firstQuestionRetryTimerRef.current);
      firstQuestionRetryTimerRef.current = null;
    }
    firstQuestionRetryTimerRef.current = setTimeout(function () {
      if (getSafeCurrentQuestionIndex() !== 0) return;
      if (questionAudioMuted || isPausedRef.current || sessionCompletedRef.current) return;
      if (!audioEl || questionAudioRef.current !== audioEl) return;
      audioEl.currentTime = 0;
      playAudioWhenReady(audioEl, {
        isStale: function () {
          return questionAudioRef.current !== audioEl;
        },
      })
        .then(function (retryPlay) {
          if (!retryPlay) return;
          if (retryPlay && typeof retryPlay.then === "function") {
            return retryPlay.then(function () {
              applyQuestionAudioPlaySuccess(audioEl);
              resetFirstQuestionRetryState();
            });
          }
          applyQuestionAudioPlaySuccess(audioEl);
          resetFirstQuestionRetryState();
        })
        .catch(function () {
          firstQuestionRetryAttemptRef.current = attempt + 1;
          scheduleFirstQuestionAutoRetry(audioEl, qn);
        });
    }, retryDelays[attempt]);
  }

  function stopQuestionAudioForSessionComplete() {
    questionAudioAutoplayPendingRef.current = false;
    resetFirstQuestionRetryState();
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.pause();
        questionAudioRef.current.currentTime = 0;
      } catch (e) {}
      questionAudioRef.current = null;
    }
    if (tryAgainAudioRef.current) {
      try {
        tryAgainAudioRef.current.pause();
        tryAgainAudioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setQuestionAudio(null);
    setIsAudioPlaying(false);
  }

  React.useEffect(function () {
    if (!sessionCompleted) return;
    stopQuestionAudioForSessionComplete();
  }, [sessionCompleted]);

  React.useEffect(function cleanupFirstQuestionRetryTimer() {
    return function () {
      if (firstQuestionRetryTimerRef.current) {
        clearTimeout(firstQuestionRetryTimerRef.current);
        firstQuestionRetryTimerRef.current = null;
      }
    };
  }, []);

  // =============================================================================
  // TESTING SHORTCUTS
  // =============================================================================
  // Local testing without mic/recording: ?skipReading=1 or ?skipMic=1 (handled in confirmAge).
  const skipReading = React.useMemo(function () {
    try {
      return new URLSearchParams(window.location.search).get("skipReading") === "1";
    } catch (e) {
      return false;
    }
  }, []);

  // Report current test phase to App so it can show top navbar on age/mic/voice screens
  React.useEffect(function () {
    if (!onTestPhase) return;
    var phase =
      !ageConfirmed && !ageInvalid
        ? "age"
        : ageInvalid
          ? "ageInvalid"
          : !permission && !microphoneSkipped
            ? "mic"
            : (permission || microphoneSkipped) && !voiceIdentifierConfirmed
              ? "voice"
              : sessionCompleted
                ? "complete"
                : "questions";
    onTestPhase(phase);
  }, [onTestPhase, ageConfirmed, ageInvalid, permission, microphoneSkipped, voiceIdentifierConfirmed, sessionCompleted]);


  function markExpressionTimestampAndArm(q) {
    if (!q || q.query_type !== "הבעה") return;
    var qNum = String(q.query_number || "");
    if (!qNum) return;
    if (expressionEvalArmedQuestionRef.current === qNum) return;

    if ((permission || microphoneSkipped) && voiceIdentifierConfirmed && SessionRecorder && SessionRecorder.markQuestionStart) {
      SessionRecorder.markQuestionStart(q.query_number);
    }
    expressionEvalArmedQuestionRef.current = qNum;
    setExpressionEvalArmed(true);
  }

  // Expression evaluation timer - opens traffic evaluation after 30 seconds (pause-aware).
  React.useEffect(function () {
  if (sessionCompleted || questionType !== "E" || !expressionEvalArmed) {
    clearExpressionEvalEnableTimer();
    setEvaluationEnabled(false);
    setExpressionTrafficSubmitted(false);
    setExpressionAdvanceLock(false);
    setExpressionEvalMsLeft(EXPRESSION_EVAL_DELAY_MS);
    expressionEvalDeadlineRef.current = null;
    expressionEvalPausedRemainingRef.current = EXPRESSION_EVAL_DELAY_MS;
    return;
  }

  setEvaluationEnabled(false);
  setExpressionTrafficSubmitted(false);
  setExpressionAdvanceLock(false);
  setExpressionEvalMsLeft(EXPRESSION_EVAL_DELAY_MS);
  expressionEvalPausedRemainingRef.current = EXPRESSION_EVAL_DELAY_MS;
  if (!isPausedRef.current) {
    expressionEvalDeadlineRef.current = Date.now() + EXPRESSION_EVAL_DELAY_MS;
    scheduleExpressionEvalEnable(EXPRESSION_EVAL_DELAY_MS);
  } else {
    expressionEvalDeadlineRef.current = null;
    clearExpressionEvalEnableTimer();
  }

  return function () {
    clearExpressionEvalEnableTimer();
  };
}, [currentIndex, questionType, sessionCompleted, expressionEvalArmed]);

  React.useEffect(function pauseAwareExpressionTimer() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled) return;
    if (isPaused) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (!expressionEvalDeadlineRef.current) {
      resumeExpressionEvalCountdown();
    }
  }, [isPaused, sessionCompleted, questionType, evaluationEnabled]);

  /** Freeze expression traffic countdown while streak clapping overlay is up (same refs as pause). */
  React.useEffect(function pauseExpressionEvalDuringClappingAvatar() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || !expressionEvalArmed) return;
    if (showClappingAvatar) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (isPaused) return;
    if (!expressionEvalDeadlineRef.current) {
      resumeExpressionEvalCountdown();
    }
  }, [
    showClappingAvatar,
    isPaused,
    sessionCompleted,
    questionType,
    evaluationEnabled,
    expressionEvalArmed,
  ]);

  React.useEffect(function tickExpressionEvalCountdown() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || isPaused || !expressionEvalDeadlineRef.current) return;
    const intervalId = setInterval(function () {
      if (!expressionEvalDeadlineRef.current) {
        return;
      }
      const next = Math.max(0, expressionEvalDeadlineRef.current - Date.now());
      setExpressionEvalMsLeft(next);
    }, 100);

    return function () {
      clearInterval(intervalId);
    };
  }, [currentIndex, questionType, sessionCompleted, evaluationEnabled, showClappingAvatar, isPaused]);

  React.useEffect(function armExpressionTimerWhenQuestionAudioUnavailable() {
    if (sessionCompleted || questionType !== "E" || expressionEvalArmed) return;
    if (!questionAudioMuted) return;
    var idx = getSafeCurrentQuestionIndex();
    var q = questions[idx];
    if (!q || q.query_type !== "הבעה") return;
    markExpressionTimestampAndArm(q);
  }, [sessionCompleted, questionType, expressionEvalArmed, questionAudioMuted, currentIndex, questions]);

  React.useEffect(function () {
    setExpressionAdvanceLock(false);
  }, [currentIndex]);

  // =============================================================================
  // DEVELOPER MODE FUNCTIONS
  // ================ =============================================================

  React.useEffect(() => {
    function handleKeyDown(event) {
      // Check if Control (or Command on Mac) + Q are pressed together
      if ((event.ctrlKey || event.metaKey) && event.key === "q") {
        event.preventDefault(); // Prevents default browser action
        setDevMode(prevDevMode => !prevDevMode);
        return;
      }

      // Handle arrow keys in dev mode
      if (devMode) {
        if (event.key === "ArrowRight") {
          if (questionType === "E" && (!expressionTrafficSubmitted || expressionAdvanceLock)) return;
          updateCurrentQuestionIndex(prevIdx => {
            if (prevIdx < questions.length - 1) {
              return prevIdx + 1;
            }
            return prevIdx;
          });
        } else if (event.key === "ArrowLeft") {
          if (questionType === "E" && evaluationEnabled && trafficPopupOpen) return;
          updateCurrentQuestionIndex(prevIdx => {
            if (prevIdx > 0) {
              return prevIdx - 1;
            }
            return prevIdx;
          });
        } else if (event.key === "Enter") {
          event.preventDefault();
          goToQuestionByNumber(devJumpValue);
          }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [devMode, devJumpValue, questions.length, questionType, expressionTrafficSubmitted, expressionAdvanceLock, trafficPopupOpen, evaluationEnabled]);



  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  function totalMonths() {
    const y = parseInt(ageYears, 10) || 0;
    const m = parseInt(ageMonths, 10) || 0;
    return y * 12 + m;
  }

  function deriveAgeFromDob(dobValue) {
    if (!dobValue) return null;
    const dob = new Date(dobValue + "T00:00:00");
    if (Number.isNaN(dob.getTime())) return null;
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    let months = today.getMonth() - dob.getMonth();
    if (today.getDate() < dob.getDate()) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return null;
    return { years: years, months: months, totalMonths: years * 12 + months };
  }

  function ensureInternalUserId() {
    if (idDigits && String(idDigits).trim() !== "") {
      return String(idDigits).trim();
    }
    const generatedId = "demo-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    setId(generatedId);
    return generatedId;
  }

  function formatDobDisplay(dobValue) {
    if (!dobValue) return tr("test.start.dob");
    try {
      const parsed = new Date(dobValue + "T00:00:00");
      if (Number.isNaN(parsed.getTime())) return tr("test.start.dob");
      return parsed.toLocaleDateString(lang === "en" ? "en-US" : "he-IL");
    } catch (e) {
      return tr("test.start.dob");
    }
  }

  function getCurrentQuestionIndex() {
    return currentIndex;
  }

  function getSafeCurrentQuestionIndex() {
    if (!questions || questions.length === 0) return -1;
    const raw = parseInt(currentIndex, 10);
    const normalized = Number.isFinite(raw) ? raw : 0;
    const clamped = Math.max(0, Math.min(normalized, questions.length - 1));
    if (clamped !== currentIndex) {
      setCurrentIndex(clamped);
    }
    return clamped;
  }

  function getQuestionTypeLabel(q) {
    if (!q) return "comprehension";
    return q.query_type === "הבנה" ? "comprehension" : "expression";
  }

  function findFirstExpressionQuestionIndex() {
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].query_type === "הבעה") return i;
    }
    return -1;
  }

  function ageValueFromPart(part) {
    if (!part) return "";
    const match = String(part).trim().match(/^(\d+):(\d{1,2})$/);
    if (!match) return String(part).trim();
    const years = parseInt(match[1], 10);
    const months = parseInt(match[2], 10);
    if (!Number.isFinite(years) || !Number.isFinite(months)) return String(part).trim();
    return months <= 0 ? years : years + 0.5;
  }

  function formatAgePartCompact(part) {
    const value = ageValueFromPart(part);
    if (value === "") return "";
    if (typeof value === "string") return value;
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }

  function formatQuestionAgeBadge(ageGroup) {
    if (!ageGroup) return "";
    const normalized = String(ageGroup).trim();
    if (normalized === "") return "";
    const parts = normalized.split("-");
    if (parts.length !== 2) return normalized;
    const from = formatAgePartCompact(parts[0]);
    const to = formatAgePartCompact(parts[1]);
    if (!from || !to) return normalized;
    if (from === to) return from;
    return from + " - " + to;
  }

  function parseAgeTokenToMonths(token) {
    if (!token) return null;
    var t = String(token).trim();
    if (!t) return null;
    var m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) {
      var y = parseInt(m[1], 10);
      var mm = parseInt(m[2], 10);
      if (!Number.isFinite(y) || !Number.isFinite(mm)) return null;
      return y * 12 + mm;
    }
    var yOnly = parseInt(t, 10);
    if (Number.isFinite(yOnly)) return yOnly * 12;
    return null;
  }

  function getAgeGroupStartMonths(ageGroup) {
    if (!ageGroup) return null;
    var parts = String(ageGroup).split("-");
    return parseAgeTokenToMonths(parts[0]);
  }

  function shouldApplyAdaptiveWrongLogic(questionObj) {
    if (!questionObj) return true;
    var childMonths = totalMonths();
    var startMonths = getAgeGroupStartMonths(questionObj.age_group);
    if (startMonths == null) return true;
    return startMonths > childMonths;
  }

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================
  async function confirmAge() {
    setMicPermissionError("");
    if (!childName || !String(childName).trim()) {
      alert(tr("test.start.invalidName"));
      return;
    }
    if (!childGender) {
      alert(tr("test.start.invalidGender"));
      return;
    }
    if (!childDob) {
      alert(tr("test.age.invalidInput"));
      return;
    }
    if (!recordingConsent) {
      alert(tr("test.start.invalidConsent"));
      return;
    }
    if (!legalConfirmation) {
      alert(tr("test.start.invalidLegal"));
      return;
    }

    const derivedAge = deriveAgeFromDob(childDob);
    if (!derivedAge) {
      alert(tr("test.age.invalidInput"));
      return;
    }
    if (derivedAge.totalMonths < 24 || derivedAge.totalMonths >= 72) {
      setAgeInvalid(true);
      return;
    }

    setAgeYears(String(derivedAge.years));
    setAgeMonths(String(derivedAge.months));
    setMicCheckPassed(false);
    setMicCheckReady(false);
    setMicCheckLevel(0);
    setMicCheckPeak(0);
    const internalUserId = ensureInternalUserId();

    function prepareDirectTestFlowNoSeparateReading() {
      setReadingValidated(true);
      setReadingValidationResult(null);
      setVerificationAudioBlob(null);
      verificationAudioBlobRef.current = null;
      setSpeakerVerificationStatus("idle");
      speakerVerificationStatusRef.current = "idle";
      setMustFinishVerification(false);
      setPendingVerificationBlob(null);
      setSessionRecordingStarted(false);
      setVoiceIdentifierConfirmed(true);
    }

    if (!("MediaRecorder" in window)) {
      alert(tr("test.mic.unsupported"));
      return;
    }

    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    } catch (err) {
      setMicPermissionError(tr("test.mic.deniedInline"));
      return;
    }

    setPermission(true);
    setMicrophoneSkipped(false);
    setMicCheckPassed(false);

    prepareDirectTestFlowNoSeparateReading();
    setAgeConfirmed(true);
    createUser(internalUserId, String(childName).trim() || "SomeUserName");
  }

  const getMicrophonePermission = async function () {
    if ("MediaRecorder" in window) {
      try {
        // Just request microphone access without starting recording yet
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the test stream immediately - we'll start recording on voice identifier
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
        setPermission(true);
        setMicCheckPassed(false);
        setMicCheckReady(false);
        setMicCheckLevel(0);
        setMicCheckPeak(0);
        console.log("✅ Microphone permission granted");
      } catch (err) {
        alert(err.message);
      }
    } else alert(tr("test.mic.unsupported"));
  };

  const skipMicrophone = function () {
    primeMediaPlaybackFromUserGesture();
    stopMicrophoneCheck();
    // Even if skipping recording, mark that user interacted with microphone prompt
    setMicrophoneSkipped(true);
    setMicCheckPassed(true);
    setMicCheckReady(false);
    setVoiceIdentifierConfirmed(true);
    setReadingValidated(false);
    setReadingValidationResult(null);
    setSpeakerVerificationStatus("idle");
    speakerVerificationStatusRef.current = "idle";
    verificationAudioBlobRef.current = null;
    setMustFinishVerification(false);
    setSessionRecordingStarted(false);
    // sessionRecordingStarted will be set by the useEffect when voice identifier screen appears
  };

  const confirmVoiceIdentifier = async function () {
  primeMediaPlaybackFromUserGesture();
  if (permission && sessionRecordingStarted) {
    SessionRecorder.stopContinuousRecording();
    console.log("🛑 Stopped reading recording; verification runs in background after test starts");

    var pollAttempts = 0;
    var maxAttempts = 50;

    var checkRecordingReady = async function () {
      pollAttempts++;

      try {
        const recordingData = await SessionRecorder.getRecordingAndText();

        if (recordingData && recordingData.recordingBlob) {
          console.log("✅ Reading recording ready after " + pollAttempts + " attempts");

          var finishResume = !!(mustFinishVerification && pendingCompleteAfterVerifyRef.current);

          async function resumeTestSessionRecordingAfterReading() {
            if (!permission) return;
            // Preserve timeline only when resuming from an in-test re-verification path.
            // Fresh runs after welcome/login must always start with clean timestamps.
            var preserveQuestionTimestamps = !!finishResume;

            SessionRecorder.cleanup({ preserveQuestionTimestamps: preserveQuestionTimestamps });
            if (!preserveQuestionTimestamps) {
              SessionRecorder.resetTimestamps();
            }

            var timelineOk = false;
            if (SessionRecorder.initSessionTimelineClock) {
              timelineOk = SessionRecorder.initSessionTimelineClock({
                preserveQuestionTimestamps: preserveQuestionTimestamps,
              });
            } else {
              timelineOk = await SessionRecorder.startContinuousRecording({
                preserveQuestionTimestamps: preserveQuestionTimestamps,
              });
            }
            var markQ1TimeoutId = null;
            if (timelineOk) {
              setSessionRecordingStarted(true);
              console.log("✅ Session question timeline ready (expression-only audio capture)");

              if (!preserveQuestionTimestamps) {
                markQ1TimeoutId = setTimeout(function () {
                  if (questions.length > 0) {
                    const firstQuestion = questions[0];
                    if (firstQuestion && SessionRecorder.markQuestionStart) {
                      SessionRecorder.markQuestionStart(firstQuestion.query_number);
                      console.log("📝 Marked question 1 start at test start");
                    }
                  }
                }, 100);
              }
            }
            var exprCount = questions.filter(function (q) {
              return q && q.query_type === "הבעה";
            }).length;
            try {
              var draftRes = await createTestDraft(Math.max(1, exprCount || 1));
              if (draftRes && draftRes.test_id) {
                setDraftTestId(draftRes.test_id);
              } else {
                setDraftTestId(null);
                if (timelineOk && !microphoneSkipped) {
                  setSessionGoHomeBlock("draftStart");
                  if (markQ1TimeoutId != null) {
                    clearTimeout(markQ1TimeoutId);
                  }
                }
              }
            } catch (e) {
              console.warn("createTestDraft failed:", e);
              setDraftTestId(null);
              if (timelineOk && !microphoneSkipped) {
                setSessionGoHomeBlock("draftStart");
                if (markQ1TimeoutId != null) {
                  clearTimeout(markQ1TimeoutId);
                }
              }
            }
          }

          if (finishResume) {
            readingVerificationGenRef.current += 1;
            var verifyGenAwait = readingVerificationGenRef.current;
            setReadingValidationInProgress(true);
            try {
              var outcomeAwait = await performSpeakerVerification(recordingData.recordingBlob, verifyGenAwait);
              setReadingValidationInProgress(false);
              if (outcomeAwait === "success") {
                var pr = pendingCompleteAfterVerifyRef.current;
                pendingCompleteAfterVerifyRef.current = null;
                setMustFinishVerification(false);
                setVoiceIdentifierConfirmed(true);
                await resumeTestSessionRecordingAfterReading();
                completeSession(pr);
              } else {
                setReadingValidationInProgress(false);
              }
            } catch (errAwait) {
              console.error("Reading verification after finish gate:", errAwait);
              setReadingValidationInProgress(false);
            }
          } else {
            setVoiceIdentifierConfirmed(true);
            setSpeakerVerificationStatus("processing");
            setReadingValidationInProgress(false);

            if (permission) {
              await resumeTestSessionRecordingAfterReading();
            } else if (microphoneSkipped) {
              if (questions.length > 0) {
                const firstQuestion = questions[0];
                if (firstQuestion) {
                  SessionRecorder.markQuestionStart(firstQuestion.query_number);
                  console.log("📝 Marked question 1 start at test start (no recording)");
                }
              }
            }

            readingVerificationGenRef.current += 1;
            var verifyGen = readingVerificationGenRef.current;
            runSpeakerVerificationInBackground(recordingData.recordingBlob, verifyGen);
          }
        } else if (pollAttempts < maxAttempts) {
          setTimeout(checkRecordingReady, 100);
        } else {
          console.warn("⚠️ Reading recording conversion timeout");
          setReadingValidationResult(null);
          setReadingValidated(false);
          setSpeakerVerificationStatus("failed");
          speakerVerificationStatusRef.current = "failed";
          setSessionRecordingStarted(false);
        }
      } catch (err) {
        console.error("Error getting reading recording:", err);
        if (pollAttempts < maxAttempts) {
          setTimeout(checkRecordingReady, 100);
        } else {
          setReadingValidationResult(null);
          setReadingValidated(false);
          setSpeakerVerificationStatus("failed");
          speakerVerificationStatusRef.current = "failed";
          setSessionRecordingStarted(false);
        }
      }
    };

    setTimeout(checkRecordingReady, 200);
  } else {
    if (microphoneSkipped || !permission) {
      setVoiceIdentifierConfirmed(true);
      setReadingValidated(false);
      setReadingValidationResult(null);
      setSpeakerVerificationStatus("failed");
      speakerVerificationStatusRef.current = "failed";
    } else {
      alert(tr("test.reading.recordingNotReady"));
    }
  }
};

const handleReadingValidationContinue = async function () {
  primeMediaPlaybackFromUserGesture();
  setVoiceIdentifierConfirmed(true);
};

const handleReadingValidationRetry = function () {
  readingVerificationGenRef.current += 1;
  setReadingValidated(false);
  setReadingValidationResult(null);
  setReadingRecordingBlob(null);
  setVerificationAudioBlob(null);
  verificationAudioBlobRef.current = null;
  setSpeakerVerificationStatus("idle");
  speakerVerificationStatusRef.current = "idle";
  setVoiceIdentifierConfirmed(false);
  setMustFinishVerification(true);
  setReadingValidationInProgress(false);
};

  // Auto-start recording when voice identifier screen appears (only if not validated yet)
  React.useEffect(function () {
    if ((permission || microphoneSkipped) && !voiceIdentifierConfirmed && !sessionRecordingStarted && !readingValidated) {
      if (permission) {
        // Start recording when the voice identifier screen appears
        async function startRecording() {
          try {
            const started = await SessionRecorder.startContinuousRecording();
            if (started) {
              setSessionRecordingStarted(true);
              console.log("✅ Continuous recording started on voice identifier screen");
            }
          } catch (err) {
            console.error("Failed to start recording:", err);
            alert(tr("test.rec.startFailed", { msg: err.message }));
          }
        }
        startRecording();
      } else if (microphoneSkipped) {
        // Mark as started even if no recording
        setSessionRecordingStarted(true);
      }
    }
  }, [permission, microphoneSkipped, voiceIdentifierConfirmed, sessionRecordingStarted, readingValidated]);

  // After age + consent, start one continuous session recording when questions are ready
  // (no separate mic screen or parent "reading" clip — upload uses test audio only unless a verify clip exists).
  React.useEffect(function startSessionRecordingDirectFlow() {
    if (!ageConfirmed || sessionCompleted) return;
    if (!permission || microphoneSkipped) return;
    if (!micCheckPassed) return;
    if (!voiceIdentifierConfirmed) return;
    if (questions.length === 0) return;

    var SR = window.SessionRecorder;
    if (!SR) return;
    var canTimeline = typeof SR.initSessionTimelineClock === "function";
    if (!canTimeline && typeof SR.startContinuousRecording !== "function") return;

    var engineLive = typeof SR.isMediaRecorderLive === "function" && SR.isMediaRecorderLive();
    if (!sessionRecordingStarted && engineLive) {
      setSessionRecordingStarted(true);
      return;
    }
    if (sessionRecordingStarted && engineLive) return;

    var cancelled = false;
    (async function () {
      try {
        if (sessionRecordingStarted) {
          return;
        }
        var preserveTs = false;
        try {
          preserveTs =
            localStorage.getItem("sessionRecordingActive") === "true" ||
            !!localStorage.getItem("recordingStartTime");
        } catch (e) {
          preserveTs = false;
        }
        var started = false;
        if (canTimeline) {
          started = SR.initSessionTimelineClock({ preserveQuestionTimestamps: preserveTs });
        } else {
          started = await SR.startContinuousRecording({
            preserveQuestionTimestamps: preserveTs,
          });
        }
        if (cancelled) return;
        if (started) {
          setSessionRecordingStarted(true);
          console.log("✅ Session timeline started (direct flow after age)");
          var draftCreateFailed = false;
          if (canTimeline) {
            try {
              var ecx = questions.filter(function (q) {
                return q && q.query_type === "הבעה";
              }).length;
              var draftRes = await createTestDraft(Math.max(1, ecx || 1));
              if (draftRes && draftRes.test_id) {
                setDraftTestId(draftRes.test_id);
              } else {
                setDraftTestId(null);
                setSessionGoHomeBlock("draftStart");
                draftCreateFailed = true;
              }
            } catch (e) {
              setDraftTestId(null);
              setSessionGoHomeBlock("draftStart");
              draftCreateFailed = true;
            }
          }
          if (!draftCreateFailed) {
            setTimeout(function () {
              if (cancelled) return;
              var first = questions[0];
              if (first && SR.markQuestionStart) {
                SR.markQuestionStart(first.query_number);
              }
            }, 100);
          }
        } else {
          alert(tr("test.rec.startFailed", { msg: "Could not start recording" }));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("startSessionRecordingDirectFlow:", err);
          alert(tr("test.rec.startFailed", { msg: err && err.message ? err.message : String(err) }));
        }
      }
    })();
    return function () {
      cancelled = true;
    };
  }, [ageConfirmed, sessionCompleted, permission, microphoneSkipped, micCheckPassed, voiceIdentifierConfirmed, sessionRecordingStarted, questions]);

  React.useEffect(function startExpressionClipWhenArmed() {
    if (sessionCompleted || isPaused) return;
    if (questionType !== "E" || !expressionEvalArmed) return;
    if (!permission || microphoneSkipped) return;
    if (!draftTestId) return;
    var SR = window.SessionRecorder;
    if (!SR || typeof SR.startExpressionClipRecording !== "function") return;
    var idx = getSafeCurrentQuestionIndex();
    var qForClip = questions[idx];
    var qNum = qForClip && qForClip.query_number != null ? qForClip.query_number : null;
    (async function () {
      await SR.startExpressionClipRecording(qNum);
    })();
  }, [
    expressionEvalArmed,
    questionType,
    permission,
    microphoneSkipped,
    sessionCompleted,
    isPaused,
    draftTestId,
    currentIndex,
  ]);

  // Expression only: open traffic popup after 30s (evaluationEnabled) or when showContinue triggers it
  React.useEffect(function () {
    if (sessionCompleted || isPaused) {
      setTrafficPopupOpen(false);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = false;
      return;
    }

    if (questionType === "E" && (showContinue || evaluationEnabled)) {
      setTrafficPopupOpen(true);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = true;
      return;
    }

    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    trafficPopupJustOpenedRef.current = false;
  }, [showContinue, evaluationEnabled, questionType, sessionCompleted, isPaused, currentIndex]);

  function playTrafficFeedback(result) {
    // Cute feedback: short beep pattern (no speech)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        o.connect(g);
        g.connect(ctx.destination);

        const seq = result === "success" ? [660, 880] : result === "partial" ? [440] : [330, 220];
        o.frequency.setValueAtTime(seq[0], now);
        if (seq.length > 1) o.frequency.setValueAtTime(seq[1], now + 0.11);
        o.start(now);
        o.stop(now + 0.24);
        setTimeout(function () { ctx.close && ctx.close(); }, 400);
      }
    } catch (e) {
      // ignore
    }
  }

  function cancelTrafficPopup() {
    clearStreakCelebrationTimers();
    streakCelebratePendingAdvanceRef.current = null;
    streakConfettiDoneRef.current = false;
    streakVideoDoneRef.current = false;
    setFireworksVisible(false);
    setShowClappingAvatar(false);
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setAllClickedAnswers([]);
    setMultiAttemptCount(0);
    setOrderedClickSequence([]);
    // Keep mask canvas/image for mask ("A") questions — clearing them broke clicks after closing the popup.
    // loadQuestion / goToPreviousQuestion still reset mask when leaving the question.
  }

  function goToPreviousQuestion() {
    const currentIdx = getCurrentQuestionIndex();
    if (currentIdx <= 0) return;
    if (questionType === "E" && evaluationEnabled && trafficPopupOpen) return;

    clearStreakCelebrationTimers();
    streakCelebratePendingAdvanceRef.current = null;
    streakConfettiDoneRef.current = false;
    streakVideoDoneRef.current = false;
    setFireworksVisible(false);
    setShowClappingAvatar(false);
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setAllClickedAnswers([]);
    setMultiAttemptCount(0);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);

    updateCurrentQuestionIndex(currentIdx - 1);
  }

  const trafficChoiceInProgressRef = React.useRef(false);
  /** Consecutive comprehension "wrong" results; two in a row → skip to first expression question. */
  const consecutiveCompFailRef = React.useRef(0);
  /** Consecutive expression "wrong" results; two in a row → end test (summary). */
  const consecutiveExprFailRef = React.useRef(0);
  const fireworksTimerRef = React.useRef(null);
  const streakCelebratePendingAdvanceRef = React.useRef(null);
  const streakConfettiDoneRef = React.useRef(false);
  const streakVideoDoneRef = React.useRef(false);
  const streakVideoSafetyTimerRef = React.useRef(null);

  function clearStreakCelebrationTimers() {
    if (fireworksTimerRef.current) {
      clearTimeout(fireworksTimerRef.current);
      fireworksTimerRef.current = null;
    }
    if (streakVideoSafetyTimerRef.current) {
      clearTimeout(streakVideoSafetyTimerRef.current);
      streakVideoSafetyTimerRef.current = null;
    }
  }

  function maybeFinishStreakCelebration() {
    if (!streakConfettiDoneRef.current || !streakVideoDoneRef.current) return;
    clearStreakCelebrationTimers();
    setFireworksVisible(false);
    setShowClappingAvatar(false);
    var goNext = streakCelebratePendingAdvanceRef.current;
    streakCelebratePendingAdvanceRef.current = null;
    if (typeof goNext === "function") {
      goNext();
    }
  }

  function startThreeInRowCelebration(onDone) {
    clearStreakCelebrationTimers();
    streakCelebratePendingAdvanceRef.current = onDone;
    streakConfettiDoneRef.current = false;
    streakVideoDoneRef.current = false;
    setFireworksVisible(true);
    setShowClappingAvatar(true);

    // Confetti duration gate
    fireworksTimerRef.current = setTimeout(function () {
      fireworksTimerRef.current = null;
      streakConfettiDoneRef.current = true;
      maybeFinishStreakCelebration();
    }, 2400);

    // Safety so user cannot get stuck if browser blocks media events.
    streakVideoSafetyTimerRef.current = setTimeout(function () {
      streakVideoSafetyTimerRef.current = null;
      streakVideoDoneRef.current = true;
      maybeFinishStreakCelebration();
    }, 7000);
  }

  function handleTrafficPopupChoice(result) {
    // Prevent double-invocation (double-click)
    if (trafficChoiceInProgressRef.current) return;
    trafficChoiceInProgressRef.current = true;

    playTrafficFeedback(result);
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);

    var finishTraffic = function () {
      setExpressionTrafficSubmitted(true);
      setExpressionAdvanceLock(true);
      handleContinue(result);
      trafficChoiceInProgressRef.current = false;
    };

    var needClip =
      permission &&
      !microphoneSkipped &&
      draftTestId &&
      SessionRecorder &&
      SessionRecorder.stopExpressionClipRecording;

    if (needClip) {
      var idx = getSafeCurrentQuestionIndex();
      var currentQ = questions[idx];
      var tidForUpload = draftTestIdRef.current;
      // Non-blocking: do not await encode + upload before advancing (that caused multi-second UI stalls).
      var uploadP = SessionRecorder.stopExpressionClipRecording()
        .then(function (blob) {
          if (!blob || !currentQ) {
            if (currentQ) {
              console.warn(
                "[See&Say] No expression clip blob for question",
                currentQ.query_number,
                "— clip may not have started, or stop ran twice without cache. Check recording / 30s cap."
              );
            }
            return null;
          }
          return delayMs(getExpressionQuestionAudioDelayMs()).then(function () {
            return blob;
          }).then(function (blobAfterGap) {
            return readBlobAsDataURL(blobAfterGap);
          }).then(function (dataUrl) {
            if (!dataUrl) return null;
            var tid = draftTestIdRef.current || tidForUpload;
            if (!tid) return null;
            return postExpressionClipWithRetry(
              tid,
              idDigits,
              currentQ.query_number,
              trafficResultToHeadlight(result),
              dataUrl,
              childGender,
              parseInt(ageYears, 10) || 0,
              parseInt(ageMonths, 10) || 0,
              null
            ).then(function (clipRes) {
              if (clipRes && clipRes.ok) {
                return clipRes;
              }
              if (permission && !microphoneSkipped) {
                setDraftTestId(null);
                setSessionGoHomeBlock("clipSave");
              }
              return null;
            });
          });
        })
        .catch(function (e) {
          console.warn("Expression clip upload:", e);
          if (permission && !microphoneSkipped) {
            setDraftTestId(null);
            setSessionGoHomeBlock("clipSave");
          }
          return null;
        })
        .finally(function () {
          if (
            SessionRecorder &&
            SessionRecorder.discardCachedExpressionClipBlob
          ) {
            SessionRecorder.discardCachedExpressionClipBlob();
          }
        });
      clipUploadPromisesRef.current.push(uploadP);
      finishTraffic();
      return;
    }

    finishTraffic();
  }

  // Start AFK timer when test begins
  React.useEffect(function () {
    if (voiceIdentifierConfirmed && !isPaused && !sessionCompleted) {
      resetAfkTimer();
    }

    // Cleanup timers on unmount
    return function () {
      stopAfkTimer();
    };
  }, [voiceIdentifierConfirmed]);

  // Reset AFK timer when loading a new question
  React.useEffect(function () {
    if (voiceIdentifierConfirmed && !isPaused && !sessionCompleted) {
      resetAfkTimer();
    }
  }, [currentIndex]);

  // Stop AFK timer when paused or completed
  React.useEffect(function () {
    if (isPaused || sessionCompleted) {
      stopAfkTimer();
    }
  }, [isPaused, sessionCompleted]);


  /**
   * Browsers only allow started audio while "user activation" is fresh. Our question clip plays later
   * (after images), so we prime HTMLAudio on the same tick as a real click (mic continue, skip, etc.).
   * Tiny silent WAV; volume near zero.
   */
  const primeMediaPlaybackFromUserGesture = function () {
    try {
      var a = new Audio();
      a.src =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";
      a.volume = 0.0001;
      var p = a.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          try {
            a.pause();
            a.removeAttribute("src");
            a.load();
          } catch (e2) {}
        }).catch(function () {});
      }
    } catch (e) {}
  };

  const playQuestionAudio = function () {
    var audioEl = questionAudioRef.current || questionAudio;
    var idx = getSafeCurrentQuestionIndex();
    var q = idx >= 0 ? questions[idx] : null;
    prepareThenPlayQuestionAudio(audioEl, {
      isFirstQuestionAutoplay: idx === 0,
      questionNumber: q && q.query_number != null ? q.query_number : "",
      question: q,
    });
  };

  const replayQuestionAudio = function () {
    playQuestionAudio();
  };

  const playTryAgainAudio = function () {
    if (questionAudioMuted) return;
    try {
      var tryAgainSrc = "resources/questions_audio/try_again.mp3";
      if (!tryAgainAudioRef.current) {
        tryAgainAudioRef.current = new Audio(tryAgainSrc);
      }
      const a = tryAgainAudioRef.current;
      if (a.src.indexOf("try_again.mp3") === -1) {
        a.src = tryAgainSrc;
      }
      var replayQuestionIdx = getCurrentQuestionIndex();
      a.onended = function () {
        if (questionAudioMuted || isPausedRef.current || sessionCompletedRef.current) return;
        if (getCurrentQuestionIndex() !== replayQuestionIdx) return;
        if (questionType !== "C" && questionType !== "E") return;
        replayQuestionAudio();
      };
      a.currentTime = 0;
      a.play().catch(function () {
        // If try-again fails to play (autoplay policy, decode issue), still attempt immediate question replay.
        if (!questionAudioMuted && !isPausedRef.current && !sessionCompletedRef.current) {
          replayQuestionAudio();
        }
      });
    } catch (e) {}
  };

  React.useEffect(function autoplayQuestionAudioAfterImagesReady() {
    if (sessionCompleted || !ageConfirmed) return;
    if (!currentQuestionImagesLoaded) return;
    if (!questionAudioAutoplayPendingRef.current) return;
    if (!micCheckPassed) return;
    if (questionAudioMuted) return;
    if (!(permission || microphoneSkipped) || !voiceIdentifierConfirmed) return;
    if (!questionAudio) return;

    questionAudioAutoplayPendingRef.current = false;

    var audioEl = questionAudio;
    var currentIdxForAutoplay = getSafeCurrentQuestionIndex();
    var currentQuestion = questions[currentIdxForAutoplay];
    var isFirstQuestionAutoplay = currentIdxForAutoplay === 0;
    var currentQuestionNumber = currentQuestion ? String(currentQuestion.query_number || "") : "";
    function runPlay() {
      prepareThenPlayQuestionAudio(audioEl, {
        isFirstQuestionAutoplay: isFirstQuestionAutoplay,
        questionNumber: currentQuestionNumber,
        question: currentQuestion,
      });
    }

    if (isFirstQuestionAutoplay && firstQuestionMicGateArmedRef.current) {
      // Try first question immediately while the mic-check click activation is still fresh.
      firstQuestionMicGateArmedRef.current = false;
      runPlay();
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(runPlay);
      });
    } else {
      setTimeout(runPlay, 0);
    }
  }, [
    currentQuestionImagesLoaded,
    questionAudio,
    micCheckPassed,
    questionAudioMuted,
    voiceIdentifierConfirmed,
    permission,
    microphoneSkipped,
    sessionCompleted,
    ageConfirmed,
    currentIndex,
    questions,
  ]);

  React.useEffect(function cleanupPreviousQuestionAudio() {
    return function () {
      if (!questionAudio) return;
      try {
        questionAudio.pause();
        questionAudio.currentTime = 0;
      } catch (e) {}
    };
  }, [questionAudio]);

  React.useEffect(function stopAudioWhenMuted() {
    if (!questionAudioMuted || !questionAudio) return;
    try {
      questionAudio.pause();
      questionAudio.currentTime = 0;
    } catch (e) {}
    setIsAudioPlaying(false);
  }, [questionAudioMuted, questionAudio]);

  // =============================================================================
  // PAUSE/RESUME AND AFK TIMER FUNCTIONS
  // =============================================================================

  // Pause test
  const pauseTest = function () {
    if (isPaused) return;

    if (questionAudio) {
      try {
        questionAudio.pause();
      } catch (e) {}
    }
    setIsAudioPlaying(false);

    setIsPaused(true);

    // Pause expression clip and/or session recorder (draft flow uses clip-only).
    if (permission && !microphoneSkipped && SessionRecorder.pauseRecording) {
      SessionRecorder.pauseRecording();
    }

    // Stop AFK timers
    stopAfkTimer();

    console.log("⏸️ Test paused");
  };

  // Resume test
  const resumeTest = async function () {
    if (!isPaused) return;

    // Resume expression clip and/or session recorder before clearing test pause.
    if (permission && !microphoneSkipped && SessionRecorder.resumeRecording) {
      await SessionRecorder.resumeRecording();
    }

    // Now set isPaused to false
    setIsPaused(false);

    // Restart AFK timer
    resetAfkTimer();

    console.log("▶️ Test resumed");
  };

  const pauseTestRef = React.useRef(pauseTest);
  pauseTestRef.current = pauseTest;

  const pausedRecordingForVisibilityOnlyRef = React.useRef(false);

  React.useEffect(function autoPauseWhenTabOrAppHidden() {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        if (sessionCompletedRef.current) return;

        if (voiceIdentifierConfirmedRef.current) {
          if (!isPausedRef.current) {
            pauseTestRef.current();
          }
          return;
        }

        try {
          if (
            localStorage.getItem("sessionRecordingActive") === "true" &&
            typeof SessionRecorder !== "undefined" &&
            SessionRecorder.pauseRecording &&
            SessionRecorder.pauseRecording()
          ) {
            pausedRecordingForVisibilityOnlyRef.current = true;
          }
        } catch (e) {}
        return;
      }

      if (document.visibilityState === "visible") {
        if (!pausedRecordingForVisibilityOnlyRef.current) return;
        pausedRecordingForVisibilityOnlyRef.current = false;
        if (sessionCompletedRef.current) return;
        if (isPausedRef.current) return;
        try {
          if (typeof SessionRecorder !== "undefined" && SessionRecorder.resumeRecording) {
            SessionRecorder.resumeRecording().catch(function () {});
          }
        } catch (e) {}
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return function () {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Reset AFK timer (called on user activity)
  const resetAfkTimer = function () {
    if (isPaused || sessionCompleted || !voiceIdentifierConfirmed) return;

    // Clear existing timers
    if (afkTimerRef.current) {
      clearTimeout(afkTimerRef.current);
    }
    if (afkWarningTimerRef.current) {
      clearTimeout(afkWarningTimerRef.current);
    }

    // Hide warning if showing
    setShowAfkWarning(false);

    // Set 5-minute timer for warning
    afkTimerRef.current = setTimeout(function () {
      setShowAfkWarning(true);
      console.log("⚠️ AFK warning shown");

      // Set 1-minute timer to auto-pause
      afkWarningTimerRef.current = setTimeout(function () {
        console.log("⏸️ Auto-pausing due to inactivity");
        pauseTest();
        setShowAfkWarning(false);
      }, 60000); // 1 minute
    }, 300000); // 5 minutes
  };

  // Stop AFK timer
  const stopAfkTimer = function () {
    if (afkTimerRef.current) {
      clearTimeout(afkTimerRef.current);
      afkTimerRef.current = null;
    }
    if (afkWarningTimerRef.current) {
      clearTimeout(afkWarningTimerRef.current);
      afkWarningTimerRef.current = null;
    }
    setShowAfkWarning(false);
  };

  // Handle "Are you still there?" response
  const handleAfkResponse = function () {
    setShowAfkWarning(false);
    resetAfkTimer();
    console.log("✅ User confirmed presence");
  };






  // Show full-screen confetti, open popup after 1s
  function showCorrectFeedback() {
    setFireworksVisible(true);
    if (fireworksTimerRef.current) clearTimeout(fireworksTimerRef.current);
    fireworksTimerRef.current = setTimeout(function () {
      setShowContinue(true);
    }, 1000);
  }

  function countUniqueQuestionsAnswered(rows) {
    return dedupeQuestionResultsKeepLastAttempt(rows || questionResults).length;
  }

  function countAnsweredByType(rows, typeLabel) {
    const normalizedType = typeLabel === "expression" ? "expression" : "comprehension";
    const deduped = dedupeQuestionResultsKeepLastAttempt(rows || questionResults);
    var count = 0;
    for (var i = 0; i < deduped.length; i++) {
      var r = deduped[i];
      var rType = r && r.questionType;
      if (!rType) {
        var qn = parseInt(r && r.questionNumber, 10);
        var q = Number.isFinite(qn) ? questions[qn - 1] : null;
        rType = getQuestionTypeLabel(q);
      }
      if (rType === normalizedType) count += 1;
    }
    return count;
  }

  function countQuestionsByType(typeLabel) {
    const normalizedType = typeLabel === "expression" ? "expression" : "comprehension";
    var count = 0;
    for (var i = 0; i < questions.length; i++) {
      if (getQuestionTypeLabel(questions[i]) === normalizedType) count += 1;
    }
    return count;
  }

  function finalizeComprehensionResult(result) {
    if (comprehensionAdvanceLockRef.current) return;
    comprehensionAdvanceLockRef.current = true;
  if (result === "partial") {
    setClickedCorrect(true);
    setFireworksVisible(true);
    playTrafficFeedback("success");
    if (fireworksTimerRef.current) {
      clearTimeout(fireworksTimerRef.current);
      fireworksTimerRef.current = null;
    }
    fireworksTimerRef.current = setTimeout(function () {
      handleContinue("partial");
      comprehensionAdvanceLockRef.current = false;
    }, 1600);
    return;
  }

  playTrafficFeedback(result);
  handleContinue(result);
  comprehensionAdvanceLockRef.current = false;
  }

  function finalizeComprehensionSuccess() {
    if (comprehensionAdvanceLockRef.current) return;
    comprehensionAdvanceLockRef.current = true;
    setClickedCorrect(true);
    setFireworksVisible(true);
    if (fireworksTimerRef.current) {
      clearTimeout(fireworksTimerRef.current);
      fireworksTimerRef.current = null;
    }
    fireworksTimerRef.current = setTimeout(function () {
      handleContinue("success");
      comprehensionAdvanceLockRef.current = false;
    }, 2400);
  }

  function requestFinishTest() {
    if (sessionCompleted) return;
    if (questions.length === 0) {
      completeSession(questionResults);
      return;
    }

    var shouldShowIncompletePopup = false;
    if (questionType === "E") {
      var exprTotal = countQuestionsByType("expression");
      var exprAnswered = countAnsweredByType(questionResults, "expression");
      shouldShowIncompletePopup = exprTotal > 0 && exprAnswered < exprTotal;
    } else {
      shouldShowIncompletePopup = countUniqueQuestionsAnswered(questionResults) < questions.length;
    }

    if (shouldShowIncompletePopup) {
      setIncompleteSummaryConfirmOpen(true);
      return;
    }

    completeSession(questionResults);
  }

  const handleClick = function (img, event) {
    // Reset AFK timer on user interaction
    resetAfkTimer();

    if (questionType === "C") {
      // Get the image index (1-based)
      const imgIndex = images.indexOf(img) + 1;

      // Check if this image is non-clickable
      if (nonClickableImage && imgIndex === nonClickableImage) {
        return; // Don't process click on non-clickable image
      }

      if (answerType === "single") {
        var twoPhotoStrict = images.length === 2;
        if (twoPhotoStrict) {
          var correct2 = img === target;
          if (correct2) {
            if (hintEverOpenedRef.current) {
              finalizeComprehensionResult("partial");
            } else {
              finalizeComprehensionSuccess();
            }
          } else {
            finalizeComprehensionResult("failure");
          }
          return;
        }

        const correct = img === target;
        var hintUsedSingle = hintEverOpenedRef.current;
        var awaitingRetry = singleComprehensionRetryRef.current;
        if (correct) {
          if (!hintUsedSingle && !awaitingRetry) {
            finalizeComprehensionSuccess();
          } else {
            singleComprehensionRetryRef.current = false;
            finalizeComprehensionResult("partial");
          }
        } else {
          if (!awaitingRetry) {
            singleComprehensionRetryRef.current = true;
            playTryAgainAudio();
            if (!hintUsedSingle) {
              openHintProgrammatic();
            }
          } else {
            singleComprehensionRetryRef.current = false;
            finalizeComprehensionResult("failure");
          }
        }
      } else if (answerType === "multi") {
        // Repeated taps on the same image count as a single pick.
        if (allClickedAnswers.includes(imgIndex)) {
          if (!multiAnswers.includes(imgIndex)) {
            playTryAgainAudio();
          }
          return;
        }

        const nextAttempts = multiAttemptCount + 1;
        setMultiAttemptCount(nextAttempts);

        if (!multiAnswers.includes(imgIndex)) {
          multiWrongClicksRef.current += 1;
        }

        const newAllClicked = allClickedAnswers.includes(imgIndex)
          ? allClickedAnswers
          : [...allClickedAnswers, imgIndex];
        if (newAllClicked !== allClickedAnswers) {
          setAllClickedAnswers(newAllClicked);
        }

        let updatedClickedCorrect = clickedMultiAnswers;
        if (multiAnswers.includes(imgIndex)) {
          if (!clickedMultiAnswers.includes(imgIndex)) {
            updatedClickedCorrect = [...clickedMultiAnswers, imgIndex];
            setClickedMultiAnswers(updatedClickedCorrect);
          }
        }

        let isNowCorrect = false;
        const correctTargetCount = minCorrectAnswers !== null ? minCorrectAnswers : multiAnswers.length;
        const allCorrectSelected = minCorrectAnswers !== null
          ? (updatedClickedCorrect.length >= minCorrectAnswers)
          : (updatedClickedCorrect.length === multiAnswers.length);
        if (allCorrectSelected) {
          setClickedCorrect(true);
          isNowCorrect = true;
        }

        if (!allCorrectSelected && nextAttempts === correctTargetCount && !multiAutoHintDoneRef.current) {
          multiAutoHintDoneRef.current = true;
          if (!hintEverOpenedRef.current) {
            openHintProgrammatic();
          }
        }

        /* Stop after x+1 attempts without a full pass (x = min correct picks).
           Also stop immediately if it becomes impossible to reach the required correct set
           with the attempts left (early hard-failure). */
        const attemptLimit = correctTargetCount + 1;
        const attemptsLeft = attemptLimit - nextAttempts;
        const neededCorrect = Math.max(0, correctTargetCount - updatedClickedCorrect.length);
        const impossibleToRecover = !isNowCorrect && neededCorrect > attemptsLeft;
        var willFinalizeFailure = !isNowCorrect && (nextAttempts >= attemptLimit || impossibleToRecover);
        if (!multiAnswers.includes(imgIndex) && !willFinalizeFailure) {
          playTryAgainAudio();
        }

        if (isNowCorrect || nextAttempts >= attemptLimit || impossibleToRecover) {
          var x = correctTargetCount;
          var hintU = hintEverOpenedRef.current;
          var wrongs = multiWrongClicksRef.current;
          if (isNowCorrect) {
            if (!hintU && wrongs === 0 && nextAttempts === x) {
              finalizeComprehensionSuccess();
            } else {
              finalizeComprehensionResult("partial");
            }
          } else {
            finalizeComprehensionResult("failure");
          }
        }
      } else if (answerType === "ordered") {
        if (orderedAnswers.length !== 2) {
          if (orderedClickSequence.length > 0 && orderedClickSequence.at(-1) != imgIndex) {
            const newSeq = [orderedClickSequence.at(-1), imgIndex];
            var isOkLong = newSeq.length === orderedAnswers.length &&
              newSeq.every(function (val, idx) { return val === orderedAnswers[idx]; });
            if (newSeq.length === orderedAnswers.length) {
              if (isOkLong) {
                setClickedCorrect(true);
                setOrderedClickSequence(newSeq);
                if (hintEverOpenedRef.current) {
                  finalizeComprehensionResult("partial");
                } else {
                  finalizeComprehensionSuccess();
                }
              } else {
                setOrderedClickSequence(newSeq);
                finalizeComprehensionResult("failure");
              }
            } else {
              setOrderedClickSequence(newSeq);
            }
          } else {
            setOrderedClickSequence([imgIndex]);
          }
        } else {
          var expFirst = orderedAnswers[0];
          var expSecond = orderedAnswers[1];
          var fourImageOrdered = images.length === 4;

          if (orderedRescueActiveRef.current) {
            if (imgIndex === orderedRescueTargetRef.current) {
              orderedRescueActiveRef.current = false;
              orderedRescueTargetRef.current = null;
              finalizeComprehensionResult("partial");
            } else {
              orderedRescueActiveRef.current = false;
              orderedRescueTargetRef.current = null;
              finalizeComprehensionResult("failure");
            }
            return;
          }

          if (fourImageOrdered) {
            if (orderedClickSequence.length === 0) {
              setOrderedClickSequence([imgIndex]);
              if (imgIndex !== expFirst) {
                openHintProgrammatic();
              }
              return;
            }

            if (orderedClickSequence.length === 1) {
              var firstPick4 = orderedClickSequence[0];
              if (imgIndex === firstPick4) {
                if (firstPick4 === expFirst) {
                  openHintProgrammatic();
                  orderedRescueActiveRef.current = true;
                  orderedRescueTargetRef.current = expSecond;
                } else {
                  finalizeComprehensionResult("failure");
                }
                return;
              }
              var pair4 = [firstPick4, imgIndex];
              setOrderedClickSequence(pair4);
              if (firstPick4 === expFirst && imgIndex === expSecond) {
                setClickedCorrect(true);
                if (hintEverOpenedRef.current) {
                  finalizeComprehensionResult("partial");
                } else {
                  finalizeComprehensionSuccess();
                }
                return;
              }
              return;
            }

            if (orderedClickSequence.length === 2) {
              var a4 = orderedClickSequence[0];
              var b4 = orderedClickSequence[1];
              setOrderedClickSequence([a4, b4, imgIndex]);
              if (b4 === expFirst && imgIndex === expSecond) {
                setClickedCorrect(true);
                finalizeComprehensionResult("partial");
              } else {
                finalizeComprehensionResult("failure");
              }
              return;
            }

            return;
          }

          if (orderedClickSequence.length === 0) {
            setOrderedClickSequence([imgIndex]);
            if (imgIndex !== expFirst) {
              openHintProgrammatic();
            }
            return;
          }

          var firstPick = orderedClickSequence[0];
          if (orderedClickSequence.length === 1) {
            if (imgIndex === firstPick) {
              if (firstPick === expFirst) {
                openHintProgrammatic();
                orderedRescueActiveRef.current = true;
                orderedRescueTargetRef.current = expSecond;
              } else {
                finalizeComprehensionResult("failure");
              }
              return;
            }

            var pair = [firstPick, imgIndex];
            setOrderedClickSequence(pair);
            var pairOk = pair[0] === expFirst && pair[1] === expSecond;
            if (pairOk) {
              setClickedCorrect(true);
              if (hintEverOpenedRef.current) {
                finalizeComprehensionResult("partial");
              } else {
                finalizeComprehensionSuccess();
              }
            } else {
              openHintProgrammatic();
              orderedRescueActiveRef.current = true;
              orderedRescueTargetRef.current = expSecond;
            }
            return;
          }
        }
      } else if (answerType === "mask") {
        if (maskCanvas) {
          const isGreen = checkMaskClick(event);
          var hintMask = hintEverOpenedRef.current;
          var awaitingMask2 = maskAwaitingSecondRef.current;
          if (isGreen) {
            if (!hintMask && !awaitingMask2) {
              maskAwaitingSecondRef.current = false;
              finalizeComprehensionSuccess();
            } else {
              maskAwaitingSecondRef.current = false;
              finalizeComprehensionResult("partial");
            }
          } else {
            if (!awaitingMask2) {
              maskAwaitingSecondRef.current = true;
              playTryAgainAudio();
              if (!hintMask) {
                openHintProgrammatic();
              }
            } else {
              maskAwaitingSecondRef.current = false;
              finalizeComprehensionResult("failure");
            }
          }
        }
      }
    }
  };

  function checkMaskClick(event) {
    if (!maskCanvas) return false;

    const imgElement = event.target;
    const rect = imgElement.getBoundingClientRect();

    // Get click position relative to image
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Scale to canvas coordinates
    const scaleX = maskCanvas.width / rect.width;
    const scaleY = maskCanvas.height / rect.height;
    const canvasX = Math.floor(x * scaleX);
    const canvasY = Math.floor(y * scaleY);

    // Ensure coordinates are within bounds
    if (canvasX < 0 || canvasX >= maskCanvas.width || canvasY < 0 || canvasY >= maskCanvas.height) {
      return false;
    }

    // Get pixel data from canvas
    const ctx = maskCanvas.getContext('2d');
    const pixelData = ctx.getImageData(canvasX, canvasY, 1, 1).data;

    // Check if pixel is green (R < 50, G > 200, B < 50)
    const isGreen = pixelData[0] < 50 && pixelData[1] > 200 && pixelData[2] < 50;

    console.log('Mask click at:', canvasX, canvasY, 'RGB:', pixelData[0], pixelData[1], pixelData[2], 'isGreen:', isGreen);

    return isGreen;
  }

  const handleContinue = function (result) {
    // Reset AFK timer on user interaction
    resetAfkTimer();

    // Important: close "continue" state BEFORE changing question index to avoid
    // the traffic popup staying open / re-opening over the next question.
    setShowContinue(false);

    const currentIdx = getCurrentQuestionIndex();
    const currentQuestion = questions[currentIdx];

    let updatedQuestionResults = questionResults;

    if (currentQuestion) {
      let resultString = "";
      let expressionCakeCategory = null;
      if (result === "success") {
        resultString = "correct";
        expressionCakeCategory = "exact";
      } else if (result === "partial") {
        resultString = "partly";
        expressionCakeCategory = "almost";
      } else if (result === "midFailure") {
        // Keep mapped as wrong for adaptive flow (including consecutive-failure rules).
        resultString = "wrong";
        expressionCakeCategory = "knew_not_say";
      } else if (result === "failure") {
        resultString = "wrong";
        expressionCakeCategory = "not_there_yet";
      }

      if (resultString) {
        const questionNumber = currentQuestion.query_number;
        const questionTypeLabel = getQuestionTypeLabel(currentQuestion);
        const qKey = String(questionNumber);
        const previousForQuestion = questionResults.filter(function (r) {
          return String(r.questionNumber) === qKey;
        });
        previousForQuestion.forEach(function (r) {
          adjustCountsForResult(r.result, -1);
        });
        adjustCountsForResult(resultString, 1);
        const nextBase = questionResults.filter(function (r) {
          return String(r.questionNumber) !== qKey;
        });
        updatedQuestionResults = nextBase.concat([{
          questionNumber: questionNumber,
          result: resultString,
          questionType: questionTypeLabel,
          expressionCakeCategory: questionTypeLabel === "expression" ? expressionCakeCategory : null
        }]);

        setQuestionResults(updatedQuestionResults);
        console.log("Recorded result for question", questionNumber, ":", resultString);

        var qtLabel = getQuestionTypeLabel(currentQuestion);
        var adaptiveLogicEnabledForQuestion = shouldApplyAdaptiveWrongLogic(currentQuestion);
        if (qtLabel === "comprehension") {
          consecutiveExprFailRef.current = 0; // Keep comprehension streak independent from expression streak.
          consecutiveCompFailRef.current = adaptiveLogicEnabledForQuestion && resultString === "wrong"
            ? consecutiveCompFailRef.current + 1
            : 0;
        }
        if (qtLabel === "expression") {
          consecutiveCompFailRef.current = 0; // Keep expression streak independent from comprehension streak.
          consecutiveExprFailRef.current = adaptiveLogicEnabledForQuestion && resultString === "wrong"
            ? consecutiveExprFailRef.current + 1
            : 0;
        }
      }
    }

    var nextStreak = result === "success" ? (consecutiveSuccessStreak + 1) : 0;
    setConsecutiveSuccessStreak(nextStreak);
    var shouldRunThreeInRowCelebration = result === "success" && nextStreak > 0 && (nextStreak % 3 === 0);

    function advanceAfterResult() {
      if (consecutiveExprFailRef.current >= 2) {
        consecutiveExprFailRef.current = 0;
        consecutiveCompFailRef.current = 0;
        completeSession(updatedQuestionResults);
        return;
      }
      if (consecutiveCompFailRef.current >= 2) {
        var firstExprIdx = findFirstExpressionQuestionIndex();
        consecutiveCompFailRef.current = 0;
        if (firstExprIdx >= 0 && currentIdx < firstExprIdx) {
          updateCurrentQuestionIndex(firstExprIdx);
          return;
        }
      }
      // If we just answered the last question in the active CSV-driven flow,
      // always finish via the same completeSession path used by the Finish button.
      if (currentIdx >= questions.length - 1) {
        completeSession(updatedQuestionResults);
        return;
      }
      if (currentIdx < questions.length - 1) {
        updateCurrentQuestionIndex(currentIdx + 1);
      } else {
        var shouldFinishAtLastQuestion = false;
        if (questionType === "E") {
          var exprTotalAtEnd = countQuestionsByType("expression");
          var exprAnsweredAtEnd = countAnsweredByType(updatedQuestionResults, "expression");
          shouldFinishAtLastQuestion = exprTotalAtEnd === 0 || exprAnsweredAtEnd >= exprTotalAtEnd;
        } else {
          var answeredCount = dedupeQuestionResultsKeepLastAttempt(updatedQuestionResults).length;
          shouldFinishAtLastQuestion = answeredCount >= questions.length;
        }
        if (shouldFinishAtLastQuestion) {
          completeSession(updatedQuestionResults);
        } else {
          setIncompleteSummaryConfirmOpen(true);
        }
      }
    }

    if (shouldRunThreeInRowCelebration) {
      startThreeInRowCelebration(advanceAfterResult);
      return;
    }

    // All non-celebration paths continue immediately.
    advanceAfterResult();
  };

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  // Format question results grouped by type
  function formatQuestionResultsArray(resultsArray) {
    const resultsToFormat = resultsArray || questionResults;
    const comp = [];
    const expr = [];

    resultsToFormat.forEach(function (item) {
      const questionNum = parseInt(item.questionNumber, 10);
      const tuple = "(" + questionNum + ",\"" + item.result + "\")";
      if (item.questionType === "expression") {
        expr.push(tuple);
      } else {
        comp.push(tuple);
      }
    });

    return JSON.stringify({
      comprehension: "[" + comp.join(",") + "]",
      expression: "[" + expr.join(",") + "]"
    });
  }

  // Combine two audio blobs into one
  async function combineAudioBlobs(blob1, blob2) {
    if (!blob1 && !blob2) return null;
    if (!blob1) return blob2;
    if (!blob2) return blob1;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Decode both audio blobs
      const arrayBuffer1 = await blob1.arrayBuffer();
      const arrayBuffer2 = await blob2.arrayBuffer();
      const audioBuffer1 = await audioContext.decodeAudioData(arrayBuffer1);
      const audioBuffer2 = await audioContext.decodeAudioData(arrayBuffer2);

      // Get the sample rate (use the higher one)
      const sampleRate = Math.max(audioBuffer1.sampleRate, audioBuffer2.sampleRate);

      // Calculate total length
      const totalLength = audioBuffer1.length + audioBuffer2.length;

      // Create a new audio buffer with combined length
      const combinedBuffer = audioContext.createBuffer(
        audioBuffer1.numberOfChannels,
        totalLength,
        sampleRate
      );

      // Copy first audio
      for (let channel = 0; channel < audioBuffer1.numberOfChannels; channel++) {
        const channelData = combinedBuffer.getChannelData(channel);
        const sourceData = audioBuffer1.getChannelData(channel);
        for (let i = 0; i < sourceData.length; i++) {
          channelData[i] = sourceData[i];
        }
      }

      // Copy second audio (append after first)
      const offset = audioBuffer1.length;
      for (let channel = 0; channel < audioBuffer2.numberOfChannels; channel++) {
        const channelData = combinedBuffer.getChannelData(channel);
        const sourceData = audioBuffer2.getChannelData(channel);
        for (let i = 0; i < sourceData.length; i++) {
          channelData[offset + i] = sourceData[i];
        }
      }

      // Convert back to blob using lamejs (MP3)
      const samples = combinedBuffer.getChannelData(0);
      const int16Samples = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
      const sampleBlockSize = 1152;
      const mp3Data = [];

      for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
        const sampleChunk = int16Samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }

      return new Blob(mp3Data, { type: "audio/mpeg" });
    } catch (err) {
      console.error("Error combining audio:", err);
      // Fallback: return the test audio if combination fails
      return blob2 || blob1;
    }
  }
  // Test to convert for a real Array
  //  function formatQuestionResultsArray() {
  //    return questionResults.map(item => {
  //        return [parseInt(item.questionNumber, 10), item.result];
  //  });
  //}


  function loadAllQuestions() {
    const normalizedGender = String(childGender || "").toLowerCase();
    const useGirlQuery = normalizedGender === "female" || normalizedGender === "girl";
    const useBoyQuery = normalizedGender === "male" || normalizedGender === "boy";

    function pickQueryByGender(q) {
      if (useGirlQuery) {
        return q.query_girl || q.query || q.query_boy || "";
      }
      if (useBoyQuery) {
        return q.query_boy || q.query || q.query_girl || "";
      }
      // No/unknown gender fallback must prefer boy column.
      return q.query_boy || q.query || "";
    }

    const filtered = allQuestions
      .filter(function (q) {
        if (!q || !q.query_type || !q.age_group) return false;
        var chosenQuery = pickQueryByGender(q);
        return !!String(chosenQuery).trim();
      })
      .map(function (q) {
        var chosenQuery = pickQueryByGender(q);
        return {
          ...q,
          query_type: q.query_type.trim().normalize("NFC"),
          age_group: q.age_group.trim().normalize("NFC"),
          query: String(chosenQuery || "").trim(),
          comments: (q.comments || "").trim(), // Preserve comments field
        };
      });

    // Single global order: query_number ascending (1…N). CSV rows define age metadata per question;
    // comprehension precedes expression when numbers are assigned accordingly (e.g. 1–32 then 33–68).
    const sorted = filtered.sort(function (a, b) {
      const numA = parseInt(a.query_number, 10) || 0;
      const numB = parseInt(b.query_number, 10) || 0;
      return numA - numB;
    });

    setQuestions(sorted);
  }

  function markCurrentQuestionEndTimestamp() {
    if (!(permission || microphoneSkipped) || !voiceIdentifierConfirmed) return;
    if (!SessionRecorder || !SessionRecorder.markQuestionEnd) return;
    var currentIdx = getSafeCurrentQuestionIndex();
    if (currentIdx < 0 || currentIdx >= questions.length) return;
    var currentQ = questions[currentIdx];
    if (!currentQ || currentQ.query_number == null) return;
    SessionRecorder.markQuestionEnd(currentQ.query_number);
  }

  function updateCurrentQuestionIndex(newIndex) {
    var currentIdx = getSafeCurrentQuestionIndex();
    var resolvedIndex =
      typeof newIndex === "function"
        ? newIndex(currentIdx)
        : newIndex;
    var parsedResolved = parseInt(resolvedIndex, 10);
    if (!Number.isFinite(parsedResolved)) return;
    if (parsedResolved === currentIdx) return;

    // If leaving an expression question before its initial reading ends, mark its start now so
    // downstream timestamp-based clipping never misses the question boundary.
    try {
      var currentQ = questions[currentIdx];
      if (currentQ && currentQ.query_type === "הבעה" && !expressionEvalArmed) {
        markExpressionTimestampAndArm(currentQ);
      }
    } catch (e) {}

    markCurrentQuestionEndTimestamp();
    if (parsedResolved !== 0) {
      resetFirstQuestionRetryState();
      firstQuestionMicGateArmedRef.current = false;
    }
    setCurrentIndex(parsedResolved);
  }

  function loadQuestion(index) {
    const q = questions[index];
    if (!q) return;

    if (
      SessionRecorder &&
      SessionRecorder.discardCachedExpressionClipBlob
    ) {
      SessionRecorder.discardCachedExpressionClipBlob();
    }
    if (
      SessionRecorder &&
      SessionRecorder.setQuestionReadingActive
    ) {
      SessionRecorder.setQuestionReadingActive(false);
    }

    questionAudioAutoplayPendingRef.current = false;
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.pause();
        questionAudioRef.current.currentTime = 0;
      } catch (e) {}
      questionAudioRef.current = null;
    }
    if (questionAudio) {
      try {
        questionAudio.pause();
        questionAudio.currentTime = 0;
      } catch (e) {}
      setIsAudioPlaying(false);
    }
    if (tryAgainAudioRef.current) {
      try {
        tryAgainAudioRef.current.pause();
        tryAgainAudioRef.current.currentTime = 0;
      } catch (e) {}
      tryAgainAudioRef.current.onended = null;
    }
    // Clear previous question visuals immediately to avoid stale-image flash while switching.
    setCurrentQuestionImagesLoaded(false);
    setImages([]);

    // Mark question start timestamp for recording
    // Skip question 1 here as it will be marked when test starts
    if ((permission || microphoneSkipped) && voiceIdentifierConfirmed && index > 0 && q.query_type === "הבנה") {
      SessionRecorder.markQuestionStart(q.query_number);
    }

    if (fireworksTimerRef.current) { clearTimeout(fireworksTimerRef.current); fireworksTimerRef.current = null; }
    setFireworksVisible(false);
    setShowContinue(false);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setAllClickedAnswers([]);
    setOrderedClickSequence([]);
    setMultiAttemptCount(0);
    setMaskImage(null);
    setMaskCanvas(null);

    hintEverOpenedRef.current = false;
    setHintWasUsedThisQuestion(false);
    maskAwaitingSecondRef.current = false;
    singleComprehensionRetryRef.current = false;
    multiWrongClicksRef.current = 0;
    multiAutoHintDoneRef.current = false;
    comprehensionAdvanceLockRef.current = false;
    orderedRescueActiveRef.current = false;
    orderedRescueTargetRef.current = null;
    setIncompleteSummaryConfirmOpen(false);

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
      setAnswerType("mask");
      const maskUrl = "resources/test_assets/" + q.query_number + "/A.png";

      // Load mask image and draw to canvas for pixel detection
      const mask = new Image();
      mask.crossOrigin = "anonymous";
      mask.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = mask.width;
        canvas.height = mask.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(mask, 0, 0);
        setMaskCanvas(canvas);
        setMaskImage(mask);
      };
      mask.onerror = function () {
        console.error('Failed to load mask image:', maskUrl);
      };
      mask.src = maskUrl;

      setTarget("");
      setMultiAnswers([]);
      setMinCorrectAnswers(null);
      setOrderedAnswers([]);
    } else if (answerStr.startsWith("x") && answerStr.includes("|")) {
      // Non-clickable image format: "xn|m" where n is non-clickable, m is correct
      setAnswerType("single");
      const parts = answerStr.substring(1).split("|");
      const nonClickableNum = parseInt(parts[0], 10);
      const correctNum = parseInt(parts[1], 10);
      setNonClickableImage(nonClickableNum);
      const targetPath = ImageLoader.getImageUrl(q.query_number, correctNum);
      setTarget(targetPath);
      setMultiAnswers([]);
      setOrderedAnswers([]);
    } else if (answerStr.includes(",")) {
      // Multi-answer type: "1,2,3,4,10" or "3,4,6,7,8|4" (with minimum)
      setAnswerType("multi");
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
      setMultiAnswers(answers);
      setMinCorrectAnswers(minRequired); // Set minimum if specified, otherwise null
      setTarget(""); // Not used for multi-answer
    } else if (answerStr.includes("->")) {
      // Ordered answer type: "2->1"
      setAnswerType("ordered");
      const answers = answerStr.split("->").map(function (a) {
        return parseInt(a.trim(), 10);
      });
      setOrderedAnswers(answers);
      setTarget(""); // Not used for ordered answer
    } else {
      // Single answer type (original behavior)
      setAnswerType("single");
      const answerNum = parseInt(answerStr, 10) || 1;
      const targetPath = ImageLoader.getImageUrl(q.query_number, answerNum);
      setTarget(targetPath);
      setMultiAnswers([]);
      setOrderedAnswers([]);
    }

    setImages(imgs);
    setQuestionType(q.query_type === "הבנה" ? "C" : "E");
    setExpressionEvalArmed(false);
    expressionEvalArmedQuestionRef.current = null;
    if ((permission || microphoneSkipped) && voiceIdentifierConfirmed) { //check if the microphone permission stage is over
      //play the audio

      // Load and play question audio
      const audioFolder = getQuestionAudioFolderByGender(childGender);
      const audioUrl = "resources/questions_audio/" + audioFolder + "/audio_" + q.query_number + ".mp3";
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      try {
        audio.load();
      } catch (eLoad) {}
      function onQuestionReadingDone() {
        setIsAudioPlaying(false);
        if (
          SessionRecorder &&
          SessionRecorder.setQuestionReadingActive
        ) {
          SessionRecorder.setQuestionReadingActive(false);
        }
        if (q.query_type === "הבעה") {
          markExpressionTimestampAndArm(q);
        }
      }
      audio.onended = onQuestionReadingDone;
      audio.onerror = function () {
        console.warn('Audio file not found for question:', q.query_number);
        onQuestionReadingDone();
      };
      questionAudioRef.current = audio;
      setQuestionAudio(audio);
      // Autoplay runs in autoplayQuestionAudioAfterImagesReady once photos + loading gate clear.
      if (micCheckPassed) {
        questionAudioAutoplayPendingRef.current = true;
      }
    }

    // Set two-row layout states
    setIsTwoRow(isTwoRow);
    setTopRowCount(topRowCount);
    setTopRowBigger(topRowBigger);

    // Set hint states
    setShowHint(false);
    setHintText(q.hint || "");

    // Set comment states - ensure we get the comment from the question object
    const comment = (q.comments && q.comments.trim()) || "";
    setCommentText(comment);

    // Reset non-clickable image
    setNonClickableImage(null);
  }

  function handleLevelCompletion() {
    // Simplified: just complete the session
    completeSession();
  }
  function ensureSpeakerVerifiedBeforeFinish(resultsArg) {
  if (microphoneSkipped || !permission) {
    return true;
  }

  var hasSeparateVerifyClip = !!(verificationAudioBlobRef.current || verificationAudioBlob);
  if (!hasSeparateVerifyClip) {
    return true;
  }

  if (speakerVerificationStatusRef.current === "success" && verificationAudioBlobRef.current) {
    return true;
  }

  if (speakerVerificationStatusRef.current === "processing") {
    pendingCompleteAfterVerifyRef.current = resultsArg;
    setBlockFinishUntilVerifyOverlay(true);
    return false;
  }

  pendingCompleteAfterVerifyRef.current = resultsArg;
  readingVerificationGenRef.current += 1;
  setMustFinishVerification(true);
  setVoiceIdentifierConfirmed(false);
  // Avoid voice-identifier "no server" branch (blob + null result) — show reading / read-again flow instead
  setReadingRecordingBlob(null);
  setReadingValidationResult(null);
  setVerificationAudioBlob(null);
  setSpeakerVerificationStatus("idle");
  speakerVerificationStatusRef.current = "idle";
  verificationAudioBlobRef.current = null;
  // Stop test-phase recording so the voice screen can auto-start a fresh reading capture
  if (permission && sessionRecordingStarted) {
    try {
      SessionRecorder.stopContinuousRecording();
    } catch (e) {
      console.warn("stopContinuousRecording when returning to reading:", e);
    }
  }
  setSessionRecordingStarted(false);
  return false;
  }

  function completeSession(updatedQuestionResults) {
    // If test is paused, unpause it first
    if (isPaused) {
      setIsPaused(false);
    }

    const resultsArg = updatedQuestionResults !== undefined ? updatedQuestionResults : questionResults;
    markCurrentQuestionEndTimestamp();

    if (!ensureSpeakerVerifiedBeforeFinish(resultsArg)) {
      return;
    }

    pendingCompleteAfterVerifyRef.current = null;
    setBlockFinishUntilVerifyOverlay(false);

    stopQuestionAudioForSessionComplete();

    setImages([]);
    var willFinalizeDraft = !!(draftTestId && permission && !microphoneSkipped);
    if (!willFinalizeDraft) {
      setLastCompletedTestId(null);
      setExpressionAiResult(null);
    } else {
      setLastCompletedTestId(draftTestId);
      setExpressionAiResult(null);
    }
    setExpressionAiLoading(false);
    consecutiveCompFailRef.current = 0;
    consecutiveExprFailRef.current = 0;

    var handleUploadResult = function (result) {
      if (result && result.transcription) {
        setTranscription(result.transcription);
      }
      if (result && result.test_id) {
        setLastCompletedTestId(result.test_id);
      }
      if (result && result.expression_ai) {
        setExpressionAiResult(result.expression_ai);
      }
    };

    var hadContinuousSessionRecorder =
      SessionRecorder &&
      typeof SessionRecorder.isMediaRecorderLive === "function" &&
      SessionRecorder.isMediaRecorderLive();

    if (permission && !microphoneSkipped && !draftTestId) {
      console.warn(
        "[See&Say] No test draft id — per-question expression clips were not sent (createTestDraft failed or API unreachable). " +
          "Finish will use results-only upload if no session MediaRecorder exists. Start uvicorn (e.g. port 8001) before the test."
      );
    }

    // Draft test: per-question expression clips + finalize (no monolithic session audio).
    if (draftTestId && permission && !microphoneSkipped) {
      (async function () {
        if (
          SessionRecorder &&
          SessionRecorder.flushExpressionClipEncodeQueue
        ) {
          try {
            await SessionRecorder.flushExpressionClipEncodeQueue();
          } catch (e) {
            console.warn("flushExpressionClipEncodeQueue:", e);
          }
        }
        if (SessionRecorder.stopExpressionClipRecording) {
          try {
            var stray = await SessionRecorder.stopExpressionClipRecording();
            if (stray && stray.size > 0) {
              console.warn("Session end: discarded unsent expression clip blob");
            }
          } catch (e) {}
        }
        setSessionCompleted(true);
        var pending = clipUploadPromisesRef.current || [];
        clipUploadPromisesRef.current = [];
        try {
          await Promise.allSettled(pending);
        } catch (e) {}
        var stampText =
          SessionRecorder && SessionRecorder.getTimestampText
            ? SessionRecorder.getTimestampText()
            : null;
        const fullArray = formatQuestionResultsArray(updatedQuestionResults);
        try {
          const result = await finalizeUserTestsWithRetry(
            draftTestId,
            idDigits,
            parseInt(ageYears, 10) || 0,
            parseInt(ageMonths, 10) || 0,
            fullArray,
            correctAnswers,
            partialAnswers,
            wrongAnswers,
            stampText,
            childGender,
            null
          );
          if (!result) {
            console.error(
              "[See&Say] finalizeUserTestsWithRetry returned null — expression AI will not poll (check Network finalizeTest and backend logs)."
            );
          }
          handleUploadResult(result);
        } catch (e) {
          console.error("finalizeUserTestsWithRetry:", e);
        }
      })();
    } else if (sessionRecordingStarted && permission && hadContinuousSessionRecorder) {
      SessionRecorder.stopContinuousRecording();
      console.log("🛑 Stopped session recording, waiting for MP3 conversion...");

      // Poll until recording is ready, then send to backend
      var pollAttempts = 0;
      var maxAttempts = 300; // Max 30 seconds (300 * 100ms)

      var checkRecordingReady = async function () {
        pollAttempts++;

        SessionRecorder.getRecordingAndText().then(async function (data) {
          if (data && data.recordingBlob) {
            console.log("✅ Recording ready after " + pollAttempts + " attempts= " + (pollAttempts * 100) + "ms");

            // Combine verification audio with test audio if verification audio exists
            let finalBlob = data.recordingBlob;
            var verifyBlobForCombine = verificationAudioBlobRef.current || verificationAudioBlob;
            if (verifyBlobForCombine) {
              console.log("🔗 Combining verification audio with test audio...");
              finalBlob = await combineAudioBlobs(verifyBlobForCombine, data.recordingBlob);
              console.log("✅ Audio combined successfully");
            }

            // Keep final audio in memory to avoid localStorage quota failures.
            SessionRecorder.setFinalRecordingBlob(finalBlob, {
              mimeType: "audio/mpeg",
              timestamp: Date.now()
            });
            const url = URL.createObjectURL(finalBlob);
            localStorage.setItem("sessionRecordingUrl", url);
            setSessionCompleted(true);

            const reader = new FileReader();
            reader.onloadend = async function () {
              const fullArray = formatQuestionResultsArray(updatedQuestionResults);
              try {
                const result = await updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
                  reader.result, data.timestampText, childGender); //MongoDB
                handleUploadResult(result);
              } catch (e) {
                console.error("updateUserTests after recording:", e);
              }
            };
            reader.readAsDataURL(finalBlob);
          } else if (pollAttempts < maxAttempts) {
            // Not ready yet, check again in 100ms
            setTimeout(checkRecordingReady, 100);
          } else {
            // Timeout - send without recording, then show completion
            console.warn("⚠️ Recording conversion timeout after " + maxAttempts + " attempts= " + (maxAttempts * 100) + "ms");
            setSessionCompleted(true);
            const fullArray = formatQuestionResultsArray(updatedQuestionResults);
            var tsFallback =
              SessionRecorder && SessionRecorder.getTimestampText
                ? SessionRecorder.getTimestampText()
                : "{}";
            updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
              "", tsFallback, childGender).then(function(result) {
                handleUploadResult(result);
              }).catch(function(err) {
                console.error("updateUserTests (no recording blob):", err);
              }); //MongoDB
          }
        }).catch(function (err) {
          console.error("❌ Error checking recording:", err);
          setSessionCompleted(true);
          const fullArray = formatQuestionResultsArray(updatedQuestionResults);
          var tsCatch =
            SessionRecorder && SessionRecorder.getTimestampText
              ? SessionRecorder.getTimestampText()
              : "{}";
          updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
            "", tsCatch, childGender).then(function(result) {
              handleUploadResult(result);
            }).catch(function(err) {
              console.error("updateUserTests after recording error:", err);
            }); //MongoDB
        });
      };

      // Start polling after a small initial delay
      setTimeout(checkRecordingReady, 200);
    } else {
      // No monolithic session recorder (e.g. timeline + expression clips only), or mic skipped: send scores + timestamps only.
      setSessionCompleted(true);
      const fullArray = formatQuestionResultsArray(updatedQuestionResults);
      var tsOnly =
        SessionRecorder && SessionRecorder.getTimestampText
          ? SessionRecorder.getTimestampText()
          : "{}";
      updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
        "", tsOnly, childGender).then(function(result) {
          handleUploadResult(result);
        }).catch(function(err) {
          console.error("updateUserTests (no recording):", err);
        }); //MongoDB
    }
  }

  completeSessionRef.current = completeSession;

  const refreshExpressionAiStatus = React.useCallback(async function (overrideTestId) {
    var tid =
      typeof overrideTestId === "string" && overrideTestId !== ""
        ? overrideTestId
        : lastCompletedTestId;
    if (!tid) return;
    setExpressionAiLoading(true);
    try {
      const resp = await getExpressionAiStatus(idDigits, tid);
      if (resp && resp.expression_ai) {
        setExpressionAiResult(resp.expression_ai);
      }
    } finally {
      setExpressionAiLoading(false);
    }
  }, [idDigits, lastCompletedTestId]);

  React.useEffect(function fetchExpressionAiOnceWhenSummaryHasTestIdButNoPayload() {
    if (!sessionCompleted || !lastCompletedTestId) return;
    if (expressionAiResult != null) return;
    void refreshExpressionAiStatus();
  }, [sessionCompleted, lastCompletedTestId, expressionAiResult, refreshExpressionAiStatus]);

  React.useEffect(function pollExpressionAiWhilePending() {
    if (!sessionCompleted) return;
    if (!lastCompletedTestId) return;
    if (expressionAiResult && expressionAiResult.status !== "pending") return;
    var tick = function () {
      refreshExpressionAiStatus();
    };
    const timer = setInterval(tick, 2000);
    return function () {
      clearInterval(timer);
    };
  }, [sessionCompleted, lastCompletedTestId, expressionAiResult, refreshExpressionAiStatus]);

  React.useEffect(function resetPlsReportCategoryOnNewTest() {
    setPlsReportCategory("semantics");
  }, [lastCompletedTestId]);

  React.useEffect(function resetExpressionAiProgressMonotonicCap() {
    expressionAiMaxProcessedRef.current = 0;
  }, [lastCompletedTestId]);

  // After Finish was blocked because reading verify was still processing, resume completion automatically.
  React.useEffect(function autoCompleteWhenVerifyReadyAfterFinish() {
    if (!blockFinishUntilVerifyOverlay) return;
    if (speakerVerificationStatusRef.current !== "success" || !verificationAudioBlobRef.current) return;
    const pending = pendingCompleteAfterVerifyRef.current;
    if (!pending) return;
    pendingCompleteAfterVerifyRef.current = null;
    setBlockFinishUntilVerifyOverlay(false);
    setMustFinishVerification(false);
    var run = completeSessionRef.current;
    if (typeof run === "function") {
      run(pending);
    }
  }, [blockFinishUntilVerifyOverlay, speakerVerificationStatus, verificationAudioBlob]);

  // Reading verify failed while waiting on Finish (still-processing overlay) — go to read-again flow.
  React.useEffect(function readingVerifyFailedDuringFinishOverlay() {
    if (!blockFinishUntilVerifyOverlay) return;
    if (speakerVerificationStatus !== "failed") return;
    setBlockFinishUntilVerifyOverlay(false);
    readingVerificationGenRef.current += 1;
    setMustFinishVerification(true);
    setVoiceIdentifierConfirmed(false);
    setReadingRecordingBlob(null);
    setReadingValidationResult(null);
    setSpeakerVerificationStatus("idle");
    speakerVerificationStatusRef.current = "idle";
    verificationAudioBlobRef.current = null;
    if (permission && sessionRecordingStarted) {
      try {
        SessionRecorder.stopContinuousRecording();
      } catch (e) {
        console.warn("stopContinuousRecording after verify failed on finish overlay:", e);
      }
    }
    setSessionRecordingStarted(false);
  }, [blockFinishUntilVerifyOverlay, speakerVerificationStatus, permission, sessionRecordingStarted]);

  function checkCurrentQuestionImages() {
    const idx = getSafeCurrentQuestionIndex();
    if (idx < 0) {
      setCurrentQuestionImagesLoaded(false);
      return;
    }
    const q = questions[idx];
    if (!q) {
      setCurrentQuestionImagesLoaded(false);
      return;
    }

    const preferPng = String(q.answer || "").trim() === "A";
    const loaded = ImageLoader.areImagesLoaded(q.query_number, q.image_count, preferPng);
    setCurrentQuestionImagesLoaded(loaded);
  }

  function retryCurrentQuestionLoading() {
    setShowQuestionLoadingRecovery(false);
    const idx = getSafeCurrentQuestionIndex();
    const q = idx >= 0 ? questions[idx] : null;
    if (q && q.query_number != null && q.image_count != null) {
      ImageLoader.prioritizeQuestion(
        q.query_number,
        q.image_count,
        String(q.answer || "").trim() === "A"
      );
    }
    checkCurrentQuestionImages();
  }

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Update priority when age is confirmed - load all questions in order
  React.useEffect(function updateLoadingPriority() {
    if (!ageConfirmed || allQuestions.length === 0) return;

    // Load all age groups in order of priority
    const labels = ["2:00-2:06", "2:07-3:00", "3:00-4:00", "4:00-5:00", "5:00-6:00"];
    ImageLoader.updatePriority(labels);
  }, [ageConfirmed, allQuestions]);

  // Load all questions in order
  React.useEffect(
    function loadAllQuestionsEffect() {
      if (allQuestions.length > 0 && ageConfirmed) {
        loadAllQuestions();
      }
    },
    [allQuestions, ageConfirmed, childGender]
  );

  // Load current question
  React.useEffect(
    function loadCurrentQuestion() {
      if (ageConfirmed && questions.length > 0 && !sessionCompleted) {
        const idx = getSafeCurrentQuestionIndex();
        if (idx < 0) return;
        loadQuestion(idx);
        const q = questions[idx];
        if (q && q.query_number != null && q.image_count != null) {
          ImageLoader.prioritizeQuestion(
            q.query_number,
            q.image_count,
            String(q.answer || "").trim() === "A"
          );
        }
        checkCurrentQuestionImages();
      }
    },
    [ageConfirmed, questions, currentIndex, sessionCompleted, voiceIdentifierConfirmed, micCheckPassed]
  );

  // Monitor if current question images are loaded
  React.useEffect(function monitorImageLoading() {
    if (!ageConfirmed || questions.length === 0 || sessionCompleted) {
      return;
    }

    const interval = setInterval(checkCurrentQuestionImages, 100);
    return function () {
      clearInterval(interval);
    };
  }, [ageConfirmed, questions, currentIndex, sessionCompleted]);

  React.useEffect(function questionLoadingRecoveryTimer() {
    if (!ageConfirmed || questions.length === 0 || sessionCompleted || currentQuestionImagesLoaded) {
      setShowQuestionLoadingRecovery(false);
      return;
    }

    const timer = setTimeout(function () {
      setShowQuestionLoadingRecovery(true);
    }, 10000);

    return function () {
      clearTimeout(timer);
    };
  }, [ageConfirmed, questions, currentIndex, sessionCompleted, currentQuestionImagesLoaded]);


  // =============================================================================
  // RENDER
  // =============================================================================

  function TestNavbar() {
    const isRecording = permission && sessionRecordingStarted;
    const showControls = voiceIdentifierConfirmed && !sessionCompleted;
    const exprBlockNext = questionType === "E" && (!expressionTrafficSubmitted || expressionAdvanceLock);
    const exprBlockPrev = questionType === "E" && evaluationEnabled && trafficPopupOpen;
    const AppNavbar = window.AppNavbar;
    if (!AppNavbar) {
      return React.createElement("div", { className: "test-navbar" }, null);
    }
    return React.createElement(
      "div",
      { className: "test-navbar" },
      React.createElement(AppNavbar, {
        variant: "test",
        lang: lang,
        t: t,
        onHome: onHome,
        onReset: onReset,
        setLang: setLang,
        showDev: false,
        showPause: showControls,
        isPaused: isPaused,
        pauseTest: pauseTest,
        resumeTest: resumeTest,
        devMode: devMode,
        setDevMode: setDevMode,
        isRecording: !!isRecording,
        currentQuestionIndex: getCurrentQuestionIndex(),
        totalQuestions: questions.length,
        navPrevDisabled: exprBlockPrev,
        navNextDisabled: exprBlockNext,
        onPrevQuestion: goToPreviousQuestion,
        onNextQuestion: function () {
        var currentIdx = getCurrentQuestionIndex();
        if (exprBlockNext) return;
        if (currentIdx < questions.length - 1) {
      updateCurrentQuestionIndex(currentIdx + 1);
    }
  },
        onFinishTest: function () {
          requestFinishTest();
        },
      })
    );
  }

  function ProgressBar() {
    const currentIdx = getCurrentQuestionIndex();
    const totalQuestions = questions.length;
    const progressPercentage = totalQuestions > 0 ? (currentIdx / totalQuestions) * 100 : 0;
    const isRecording = permission && sessionRecordingStarted;
    const showControls = voiceIdentifierConfirmed && !sessionCompleted;
    const isRtl = lang !== "en";
    const bunnyPosition = Math.max(4, isRtl ? (100 - progressPercentage) : progressPercentage);
    var exprBlockNextPb = questionType === "E" && (!expressionTrafficSubmitted || expressionAdvanceLock);
    var exprBlockPrevPb = questionType === "E" && evaluationEnabled && trafficPopupOpen;
    return React.createElement(
      "div",
      { className: "progress-bar-container" },
      React.createElement(
  "div",
  { className: "test-controls-row" },

  // Previous button
  currentIdx > 0 && showControls
    ? React.createElement(
        "button",
        {
          type: "button",
          className: "ctrl-btn",
          onClick: goToPreviousQuestion,
          disabled: exprBlockPrevPb,
          title: tr("test.nav.back"),
          "aria-label": tr("test.nav.back.aria")
        },
        lang === "en" ? "←" : "→"
      )
    : React.createElement("span", { className: "ctrl-btn ctrl-btn--placeholder" }),

  // Bunny track
  React.createElement(
    "div",
    { style: { flex: 1, minWidth: 0 } },
    React.createElement(
      "div",
      { className: "bunny-track-wrapper" },
      React.createElement(
        "div",
        { className: "bunny-track" },
        React.createElement("div", {
          className: "bunny-track-fill",
          style: { width: progressPercentage + "%" }
        }),
        React.createElement("span", {
  className: "bunny-avatar",
  style: { left: bunnyPosition + "%" }
}, (window.NAVBAR_BUNNY_PROGRESS_ICON != null ? window.NAVBAR_BUNNY_PROGRESS_ICON : "🐰")),
        React.createElement("span", { className: "bunny-carrot" }, "🥕")
      ),
      React.createElement(
        "div",
        { className: "progress-text" },
        tr("test.progress", { current: currentIdx + 1, total: totalQuestions })
      )
    )
  ),

  // Next button
  currentIdx < totalQuestions - 1 && showControls
    ? React.createElement(
        "button",
        {
          type: "button",
          className: "ctrl-btn",
          onClick: function () {
            if (exprBlockNextPb) return;
            updateCurrentQuestionIndex(currentIdx + 1);
          },
          disabled: exprBlockNextPb,
          title: lang === "en" ? "Next question" : "השאלה הבאה",
          "aria-label": lang === "en" ? "Next question" : "השאלה הבאה"
        },
        lang === "en" ? "→" : "←"
      )
    : React.createElement("span", { className: "ctrl-btn ctrl-btn--placeholder" })
)
    );
  }

function renderBottomActions() {
  if (questionType === "E") {
    var hasExpressionHint = ENABLE_EXPRESSION_HINTS && !!(hintText && hintText.trim() !== "");
    var evalProgressRatio = Math.max(0, Math.min(1, expressionEvalMsLeft / EXPRESSION_EVAL_DELAY_MS));
    var evalSecondsLeft = Math.max(0, Math.ceil(expressionEvalMsLeft / 1000));
    var showExpressionCountdown = expressionEvalArmed && !evaluationEnabled && !trafficPopupOpen && !showContinue;
    return React.createElement(
      "div",
      { className: "question-bottom-actions question-bottom-actions--expression" },
      React.createElement(
        "div",
        { className: "question-bottom-actions__row" },
        hasExpressionHint
          ? React.createElement(
              "button",
              {
                type: "button",
                className: "question-bottom-actions__hint-btn question-bottom-actions__btn--plain",
                "aria-label": lang === "en" ? "Hint" : "רמז",
                "aria-expanded": showHint,
                onClick: function () {
                  setShowHint(function (prev) {
                    var next = !prev;
                    if (next) registerHintOpened();
                    return next;
                  });
                },
              },
              React.createElement("span", { className: "question-bottom-actions__emoji question-bottom-actions__emoji--hint" }, "💡"),
              React.createElement("span", null, tr("test.hint.needHint")),
          showHint && hasExpressionHint
            ? React.createElement(
                "span",
                { className: "hint-text hint-text--bottombar" },
                hintText
              )
            : null
            )
          : React.createElement("span", { className: "question-bottom-actions__slot", "aria-hidden": true }),
        React.createElement(
          "button",
          {
            type: "button",
            className: "question-bottom-actions__eval-btn question-bottom-actions__btn--plain",
            onClick: function () { setTrafficPopupOpen(true); },
            disabled: trafficPopupOpen || showContinue,

            title: tr("test.evaluate.label"),
            "aria-label": tr("test.evaluate.label"),
          },
          React.createElement(
            "span",
            { className: "question-bottom-actions__eval-compact" },
            React.createElement("span", { className: "question-bottom-actions__emoji question-bottom-actions__emoji--eval" }, "🚦"),
            React.createElement("span", { className: "question-bottom-actions__eval-label" }, tr("test.evaluate.label"))
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

  if (questionType === "C") {
    return null;
  }

  if (hintText && hintText.trim() !== "") {
    return React.createElement(
      "div",
      {
        className: "question-bottom-actions question-bottom-actions--comprehension",
        "data-open": showHint ? "true" : "false",
      },
      React.createElement(
        "div",
        { className: "question-bottom-actions__row" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "question-bottom-actions__hint-btn question-bottom-actions__btn--plain",
            "aria-label": lang === "en" ? "Hint" : "רמז",
            "aria-expanded": showHint,
            onClick: function () {
              setShowHint(function (prev) {
                var next = !prev;
                if (next) registerHintOpened();
                return next;
              });
            },
          },
          React.createElement("span", { className: "question-bottom-actions__emoji question-bottom-actions__emoji--hint" }, "💡"),
          React.createElement("span", null, tr("test.hint.needHint")),
          showHint
            ? React.createElement(
                "span",
                { className: "hint-text hint-text--bottombar" },
                hintText
              )
            : null
        ),
        React.createElement("div", { className: "question-bottom-actions__spacer" })
      ),
      null
    );
  }

  return null;
}

function renderDevAudioToggle() {
  if (!devMode || sessionCompleted) return null;
  return React.createElement(
    "div",
    { className: "dev-audio-toggle-wrap" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "dev-audio-toggle-btn" + (questionAudioMuted ? " is-muted" : ""),
        onClick: function () {
          setQuestionAudioMuted(function (prev) { return !prev; });
        },
        title: questionAudioMuted
          ? (lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
          : (lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
        "aria-label": questionAudioMuted
          ? (lang === "en" ? "Unmute question reading" : "בטל השתקת קריאת שאלות")
          : (lang === "en" ? "Mute question reading" : "השתק קריאת שאלות"),
        "aria-pressed": questionAudioMuted
      },
      questionAudioMuted ? "🔇" : "🔊"
    )
  );
}

function renderExpectedAnswerToggle() {
  return null;
}

function renderConfettiOverlay() {
  if (!fireworksVisible) return null;
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
  if (!showClappingAvatar) return null;
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
        streakVideoDoneRef.current = true;
        maybeFinishStreakCelebration();
      },
      onError: function () {
        streakVideoDoneRef.current = true;
        maybeFinishStreakCelebration();
      }
    })
  );
}

function renderExpectedAnswerNote() {
  if (questionType !== "E" || !commentText || commentText.trim() === "") return null;
  return React.createElement(
    "div",
    { className: "question-bottom-actions__note question-bottom-actions__note--plain question-expected-answer-above" },
    React.createElement(
      "strong",
      { className: "question-bottom-actions__note-label" },
      lang === "en" ? "Expected answer: " : "הכוונה להורה: "
    ),
    commentText
  );
}

  if (!ageConfirmed || ageInvalid) {
    return React.createElement(
      "div",
      { className: "age-invalid", style: { display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" } },
      React.createElement("div", null, lang === "en" ? "Please start from the welcome flow." : "נא להתחיל ממסכי הפתיחה."),
      React.createElement(
        "button",
        { className: "continue-button", type: "button", onClick: onHome },
        lang === "en" ? "Back to welcome" : "חזרה לפתיחה"
      )
    );
  }

  if (permission && !microphoneSkipped && !micCheckPassed) {
    const levelPercent = Math.max(0, Math.min(100, Math.round(micCheckLevel * 100)));
    return React.createElement(
      "div",
      { className: "microphone-check-screen" },
      React.createElement("h2", null, tr("test.mic.check.title")),
      React.createElement("p", null, tr("test.mic.check.body")),
      React.createElement(
        "div",
        { className: "mic-level-meter", role: "img", "aria-label": tr("test.mic.check.target") },
        React.createElement("div", { className: "mic-level-meter__target" }),
        React.createElement("div", { className: "mic-level-meter__fill", style: { width: levelPercent + "%" } })
      ),
      React.createElement("p", { className: "mic-level-meter__label" }, tr("test.mic.check.target")),
      micCheckReady
        ? React.createElement("p", { className: "mic-check-success" }, tr("test.mic.check.done"))
        : null,
      micPermissionError
        ? React.createElement(
            "p",
            {
              style: {
                marginTop: "8px",
                color: "#b71c1c",
                fontSize: "14px",
                textAlign: "center"
              }
            },
            micPermissionError
          )
        : null,
      React.createElement(
        "div",
        { style: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" } },
        !micCheckReady
          ? React.createElement(
              "button",
              {
                className: "continue-button",
                onClick: startMicrophoneCheck,
                disabled: micCheckRunning,
              },
              micCheckRunning ? (lang === "en" ? "Listening..." : "מאזינים...") : tr("test.mic.check.start")
            )
          : null,
        micCheckReady
          ? React.createElement(
              "button",
              {
                className: "continue-button",
                onClick: function () {
                  primeMediaPlaybackFromUserGesture();
                  firstQuestionMicGateArmedRef.current = true;
                  resetFirstQuestionRetryState();
                  enforceFreshRunStartFromQuestionOne();
                  setMicCheckPassed(true);
                  setMicCheckReady(false);
                  stopMicrophoneCheck();
                }
              },
              tr("test.mic.check.continue")
            )
          : null
      )
    );
  }

  if ((permission || microphoneSkipped) && !voiceIdentifierConfirmed) {
    // Show loading screen while validating
    if (readingValidationInProgress) {
      return React.createElement(
        "div",
        { className: "voice-identifier-screen" },
        React.createElement("h2", null, tr("test.reading.validating")),
        React.createElement("p", { style: { fontSize: "18px", color: "#666", margin: "30px 0" } },
          tr("test.reading.wait")
        ),
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: "20px"
            }
          },
          React.createElement(
            "div",
            {
              style: {
                width: "40px",
                height: "40px",
                border: "4px solid #f3f3f3",
                borderTop: "4px solid #4CAF50",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }
            }
          )
        )
      );
    }

    // Invalid / could not verify (includes network or server errors) — always read-again, never "no server" branch
    if (readingValidationResult === false) {
      return React.createElement(
        "div",
        { className: "voice-identifier-screen" },
        React.createElement("h2", null, tr("test.reading.invalid")),
        React.createElement("p", { style: { fontSize: "18px", color: "#c62828", margin: "20px 0" } },
          tr("test.reading.invalidMsg")
        ),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px", flexWrap: "wrap" } },
          React.createElement(
            "button",
            {
              className: "continue-button",
              onClick: handleReadingValidationRetry,
              style: {
                padding: "12px 24px",
                fontSize: "18px",
                backgroundColor: "#FF9800",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold"
              }
            },
            tr("test.reading.tryAgain")
          ),
          devMode
            ? React.createElement(
              "button",
              {
                className: "continue-button",
                onClick: handleReadingValidationContinue,
                style: {
                  padding: "12px 24px",
                  fontSize: "18px",
                  backgroundColor: "#9E9E9E",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }
              },
              tr("test.reading.skipDev")
            )
            : null
        )
      );
    }

    // Show reading instruction screen
    return React.createElement(
      "div",
      { className: "voice-identifier-screen" },
      React.createElement("h2", null, tr("test.reading.title")),
      mustFinishVerification
  ? React.createElement(
      "div",
      {
        className: "speaker-status-banner speaker-status-banner--warning"
      },
      tr("test.reading.finishGateBody")
    )
  : null,
      permission && sessionRecordingStarted
        ? React.createElement(
          "div",
          {
            style: {
              backgroundColor: "#ffebee",
              padding: "10px 20px",
              borderRadius: "8px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px"
            }
          },
          React.createElement("span", { style: { fontSize: "20px" } }, "🔴"),
          React.createElement("span", { style: { fontWeight: "bold", color: "#c62828" } }, tr("test.reading.recording"))
        )
        : null,
      React.createElement("p", null, tr("test.reading.prompt")),
      React.createElement(
        "div",
        {
          className: "hebrew-text",
          style: {
            fontSize: "24px",
            fontWeight: "bold",
            margin: "30px 0",
            padding: "20px",
            backgroundColor: "#f0f0f0",
            borderRadius: "8px",
            direction: "inherit"
          }
        },
        lang === "en"
          ? "Let’s start the game and try to answer correctly."
          : "בואו נתחיל את המשחק, וננסה לענות על תשובות באופן נכון"
      ),
      React.createElement("p", { style: { fontSize: "14px", color: "#666", fontStyle: "italic" } },
        tr("test.reading.hint")
      ),
      React.createElement(
        "button",
        {
          className: "continue-button",
          onClick: confirmVoiceIdentifier,
          style: {
            padding: "12px 24px",
            fontSize: "18px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            marginTop: "20px"
          }
        },
        tr("test.cta.continue")
      )
    );
  }

  if (sessionCompleted) {
    const totalAnswered = correctAnswers + partialAnswers + wrongAnswers;
    const expectedAgeGroup = (function () {
      const months = totalMonths();
      // Age input is validated to [24,72) months in confirmAge()
      if (months <= 30) return "2:00-2:06";
      if (months <= 36) return "2:07-3:00";
      if (months <= 48) return "3:00-4:00";
      if (months <= 60) return "4:00-5:00";
      return "5:00-6:00";
    })();
    const expectedAgeGroupDisplay = formatQuestionAgeBadge(expectedAgeGroup);

    const questionByNumber = (function () {
      const map = {};
      (questions || []).forEach(function (q) {
        if (!q) return;
        const n = parseInt(q.query_number, 10);
        if (!isNaN(n)) map[n] = q;
      });
      return map;
    })();

    const ageMatchedStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    const ageMatchedCompStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    questionResults.forEach(function (item) {
      const qNum = parseInt(item.questionNumber, 10);
      const q = questionByNumber[qNum];
      if (!q || q.age_group !== expectedAgeGroup) return;
      ageMatchedStats.total += 1;
      if (item.result === "correct") ageMatchedStats.correct += 1;
      else if (item.result === "partly") ageMatchedStats.partial += 1;
      else if (item.result === "wrong") ageMatchedStats.wrong += 1;
      if (item.questionType === "comprehension") {
        ageMatchedCompStats.total += 1;
        if (item.result === "correct") ageMatchedCompStats.correct += 1;
        else if (item.result === "partly") ageMatchedCompStats.partial += 1;
        else if (item.result === "wrong") ageMatchedCompStats.wrong += 1;
      }
    });

    

    // Split results by question type
    const compStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    const exprStats = { correct: 0, partial: 0, wrong: 0, total: 0 };
    questionResults.forEach(function (item) {
      const bucket = item.questionType === "expression" ? exprStats : compStats;
      bucket.total += 1;
      if (item.result === "correct") bucket.correct += 1;
      else if (item.result === "partly") bucket.partial += 1;
      else if (item.result === "wrong") bucket.wrong += 1;
    });
    // Cake-display-only variables (no impact on test-flow logic).
    // Display-only cake categories for expression summary.
    // Flow logic still uses result buckets: correct / partly / wrong.
    const expressionCakeCounts = { exact: 0, almost: 0, knewNotSay: 0, notThereYet: 0, total: 0 };
    questionResults.forEach(function (item) {
      if (!item || item.questionType !== "expression") return;
      expressionCakeCounts.total += 1;
      var category = item.expressionCakeCategory;
      if (!category) {
        category = item.result === "correct"
          ? "exact"
          : item.result === "partly"
            ? "almost"
            : "not_there_yet";
      }
      if (category === "exact") expressionCakeCounts.exact += 1;
      else if (category === "almost") expressionCakeCounts.almost += 1;
      else if (category === "knew_not_say") expressionCakeCounts.knewNotSay += 1;
      else expressionCakeCounts.notThereYet += 1;
    });
    const expressionCakeKnewButDidntSayCount = expressionCakeCounts.knewNotSay;
    const expressionCakeNotThereYetCount = expressionCakeCounts.notThereYet;
    const expressionCakeStats = {
      exact: expressionCakeCounts.exact,
      almost: expressionCakeCounts.almost,
      knewNotSay: expressionCakeKnewButDidntSayCount,
      notThereYet: expressionCakeNotThereYetCount,
      total: expressionCakeCounts.total
    };
    const comprehensionCakeStats = {
      correct: compStats.correct,
      partial: compStats.partial,
      wrong: compStats.wrong,
      total: compStats.total
    };

    const strongerLabel = (function () {
      if (compStats.correct > exprStats.correct) {
        return lang === "en" ? "Stronger in comprehension" : "חזק יותר בהבנה";
      }
      if (exprStats.correct > compStats.correct) {
        return lang === "en" ? "Stronger in expression" : "חזק יותר בהבעה";
      }
      return lang === "en" ? "Balanced between comprehension and expression" : "מאוזן בין הבנה להבעה";
    })();
    const totalStats = {
      total: compStats.total + exprStats.total,
      compTotal: compStats.total,
      exprTotal: exprStats.total
    };

    const hasExpressionQuestions = exprStats.total > 0;
    var expressionAiStatus = expressionAiResult && expressionAiResult.status;
    const expressionAiResolved =
      !hasExpressionQuestions ||
      (expressionAiResult &&
        (expressionAiStatus === "done" || expressionAiStatus === "failed"));
    const expressionFeedbackPending =
      hasExpressionQuestions &&
      lastCompletedTestId &&
      (!expressionAiResult ||
        expressionAiStatus === "pending" ||
        expressionAiLoading);
    const expressionAiProgress = expressionAiResult && expressionAiResult.meta && expressionAiResult.meta.progress
      ? expressionAiResult.meta.progress
      : null;
    const expressionAiProcessed = expressionAiProgress && typeof expressionAiProgress.processed_questions === "number"
      ? expressionAiProgress.processed_questions
      : 0;
    var expressionAiTotalRaw =
      expressionAiProgress && typeof expressionAiProgress.total_questions === "number"
        ? expressionAiProgress.total_questions
        : exprStats.total;
    var exprAnsweredThisSession = countAnsweredByType(questionResults, "expression");
    var expressionAiTotalForProgress =
      expressionAiStatus === "pending" &&
      exprAnsweredThisSession > 0 &&
      expressionAiTotalRaw > exprAnsweredThisSession
        ? exprAnsweredThisSession
        : expressionAiTotalRaw;
    var expressionAiProcessedRaw = Math.min(expressionAiProcessed, expressionAiTotalForProgress);
    var expressionAiProcessedForProgress = Math.min(
      expressionAiTotalForProgress,
      Math.max(expressionAiMaxProcessedRef.current, expressionAiProcessedRaw)
    );
    expressionAiMaxProcessedRef.current = expressionAiProcessedForProgress;
    const expressionAiPhase = expressionAiProgress && expressionAiProgress.phase
      ? String(expressionAiProgress.phase)
      : "pending";
    function expressionPhaseLabel(phaseKey) {
      if (lang === "en") {
        if (phaseKey === "queued") return "Feedback generation will start shortly";
        if (phaseKey === "processing_started") return "Started";
        if (phaseKey === "preparing_audio") return "Processing audio";
        if (phaseKey === "scoring_questions") return "Scoring questions";
        if (phaseKey === "scoring_clips") return "Scoring expression clips";
        if (phaseKey === "finalize_merge") return "Merging results";
        if (phaseKey === "draft") return "Queued";
        if (phaseKey === "building_impression") return "Building summary";
        if (phaseKey === "done") return "Done";
        if (phaseKey === "failed") return "Failed";
        return "Pending";
      }
      if (phaseKey === "queued") return "יצירת המשוב תתחיל בקרוב";
      if (phaseKey === "processing_started") return "התחיל עיבוד";
      if (phaseKey === "preparing_audio") return "מעבד שמע";
      if (phaseKey === "scoring_questions") return "מחשב ציונים";
      if (phaseKey === "scoring_clips") return "מחשב ציוני קטעי הבעה";
      if (phaseKey === "finalize_merge") return "מאחד תוצאות";
      if (phaseKey === "draft") return "בתור";
      if (phaseKey === "building_impression") return "מכין סיכום";
      if (phaseKey === "done") return "הושלם";
      if (phaseKey === "failed") return "נכשל";
      return "ממתין";
    }
    const ageMatchedForDisplay =
      !hasExpressionQuestions || expressionAiResolved ? ageMatchedStats : ageMatchedCompStats;

    const parentExprByQ = {};
    questionResults.forEach(function (item) {
      if (item.questionType !== "expression") return;
      parentExprByQ[String(item.questionNumber)] = item.result;
    });

    const statsLine = function (titleHe, titleEn, stats) {
      const title = lang === "en" ? titleEn : titleHe;
      return title + ": " + stats.correct + " ✔ / " + stats.partial + " ~ / " + stats.wrong + " ✖ מתוך " + stats.total;
    };
    function buildVisualSummarySegments(stats, mode, customItems) {
      var total = Math.max(1, Number(stats && stats.total) || 0);
      if (Array.isArray(customItems) && customItems.length > 0) {
        var customCursor = 0;
        return customItems.map(function (item, index) {
          var value = Number(item && item.value) || 0;
          var pct = (value / total) * 100;
          var seg = {
            key: (item && item.key) || ("custom_" + index),
            color: (item && item.color) || "#d5dde5",
            value: value,
            label: lang === "en" ? (item && item.labelEn) : (item && item.labelHe),
            start: customCursor,
            end: customCursor + pct
          };
          customCursor += pct;
          return seg;
        });
      }
      var isExpression = mode === "expression";
      var items = [
        {
          key: "correct",
          color: "#9EDFC2",
          value: Number(stats && stats.correct) || 0,
          labelEn: isExpression ? "Exactly" : "Succeeded",
          labelHe: isExpression ? "בדיוק" : "הצליח"
        },
        {
          key: "partial",
          color: "#F4D474",
          value: Number(stats && stats.partial) || 0,
          labelEn: isExpression ? "Knew but didn't say" : "Not on first attempt",
          labelHe: isExpression ? "כמעט ידע אבל לא אמר" : "לא בניסיון הראשון"
        },
        {
          key: "wrong",
          color: "#F3A8AF",
          value: Number(stats && stats.wrong) || 0,
          labelEn: "Not there yet",
          labelHe: "לא הצליח"
        }
      ];
      var cursor = 0;
      return items.map(function (item) {
        var pct = (item.value / total) * 100;
        var seg = {
          key: item.key,
          color: item.color,
          value: item.value,
          label: lang === "en" ? item.labelEn : item.labelHe,
          start: cursor,
          end: cursor + pct
        };
        cursor += pct;
        return seg;
      });
    }
    function renderVisualSummaryCard(opts) {
      var stats = opts && opts.stats ? opts.stats : { correct: 0, partial: 0, wrong: 0, total: 0 };
      var segments = buildVisualSummarySegments(stats, opts.mode, opts.items);
      var gradient = segments
        .map(function (seg) {
          return seg.color + " " + seg.start.toFixed(2) + "% " + seg.end.toFixed(2) + "%";
        })
        .join(", ");
      return React.createElement(
        "div",
        { className: "session-visual-summary__card", key: opts.key },
        React.createElement(
          "h3",
          { className: "session-visual-summary__card-title" },
          lang === "en" ? opts.titleEn : opts.titleHe
        ),
        React.createElement("div", { className: "session-visual-summary__corner-emoji", "aria-hidden": "true" }, opts.cornerEmoji || ""),
        React.createElement(
          "div",
          { className: "session-visual-summary__chart-wrap" },
          React.createElement(
            "div",
            {
              className: "session-visual-summary__donut",
              style: { background: "conic-gradient(" + gradient + ")" }
            },
            React.createElement("div", { className: "session-visual-summary__donut-center" }, "\u263A")
          )
        ),
        React.createElement(
          "div",
          { className: "session-visual-summary__legend" },
          segments.map(function (seg) {
            return React.createElement(
              "div",
              { className: "session-visual-summary__legend-row", key: opts.key + "-" + seg.key },
              React.createElement("span", { className: "session-visual-summary__legend-dot", style: { backgroundColor: seg.color } }),
              React.createElement("span", { className: "session-visual-summary__legend-label" }, seg.label),
              React.createElement("span", { className: "session-visual-summary__legend-value" }, String(seg.value))
            );
          })
        )
      );
    }

    function parentEvalLabel(result) {
      if (result === "correct") return lang === "en" ? "Success" : "הצליח";
      if (result === "partly") return lang === "en" ? "Partial" : "חלקי";
      if (result === "wrong") return lang === "en" ? "Wrong" : "שגוי";
      return "—";
    }

    const parentStatusForReport = function (parentResult) {
      if (parentResult === "correct") return lang === "en" ? "Success" : "הצליח";
      if (parentResult === "partly") return lang === "en" ? "Partial" : "חלקי";
      if (parentResult === "wrong") return lang === "en" ? "Wrong / knew but didn't say" : "לא הצליח / ידע ולא אמר";
      return "—";
    };
    const parentScoreForReport = function (parentResult) {
      if (parentResult === "correct") return 2;
      if (parentResult === "partly") return 1;
      if (parentResult === "wrong") return 0;
      return null;
    };

    const getExpressionAiReportRowModels = function () {
      if (!expressionAiResult) return null;
      var rawRows = Array.isArray(expressionAiResult.per_question) ? expressionAiResult.per_question : [];
      var gradeMatchedCount = 0;
      var gradeComparedCount = 0;
      var rowModels = rawRows.map(function (r) {
        var qn = String((r && r.question_number) != null ? r.question_number : "");
        var parentResult = parentExprByQ[qn];
        var parentStatus = parentStatusForReport(parentResult);
        var parentScore = parentScoreForReport(parentResult);
        var aiScoreNum = (r && (r.ai_score === 0 || r.ai_score === 1 || r.ai_score === 2)) ? Number(r.ai_score) : null;
        var isMatch = parentScore != null && aiScoreNum != null ? (parentScore === aiScoreNum) : null;
        if (isMatch !== null) {
          gradeComparedCount += 1;
          if (isMatch) gradeMatchedCount += 1;
        }
        var matchLabel =
          isMatch === null
            ? "—"
            : isMatch
              ? (lang === "en" ? "Match" : "תואם")
              : (lang === "en" ? "Different" : "שונה");
        return {
          qn: qn || "—",
          parentStatus: parentStatus,
          parentScoreStr: parentScore == null ? "—" : String(parentScore),
          aiScoreStr: String((r && r.ai_score) != null ? r.ai_score : "—"),
          matchLabel: matchLabel,
          reason: String((r && r.ai_reason_short) || "—"),
          listen: String((r && r.ai_speaker_observation) || "—")
        };
      });
      return {
        rowModels: rowModels,
        gradeMatchedCount: gradeMatchedCount,
        gradeComparedCount: gradeComparedCount
      };
    };

    const renderExpressionAiReportInline = function () {
      if (!expressionAiResolved || !hasExpressionQuestions || !expressionAiResult) return null;
      var pack = getExpressionAiReportRowModels();
      if (!pack) return null;
      var rowModels = pack.rowModels;
      var thStyle = {
        border: "1px solid #cfd8e6",
        padding: "8px 6px",
        fontSize: "12px",
        background: "#eef2f8",
        color: "#1f3d53",
        fontWeight: 700
      };
      var tdStyle = {
        border: "1px solid #e2e8f0",
        padding: "8px 6px",
        fontSize: "12px",
        color: "#2c3e50",
        textAlign: "start",
        verticalAlign: "top",
        wordBreak: "break-word"
      };
      function th(label, extraStyle) {
        return React.createElement("th", { style: Object.assign({}, thStyle, extraStyle || {}), scope: "col" }, label);
      }
      function cell(text) {
        return React.createElement("td", { style: tdStyle }, text);
      }
      var thead = React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          th("Q#"),
          th(lang === "en" ? "Parent answer" : "תשובת הורה"),
          th(lang === "en" ? "Parent score" : "ציון הורה"),
          th("AI score"),
          th(lang === "en" ? "Reason" : "סיבה", { minWidth: "220px", width: "40%" }),
          th(lang === "en" ? "Listen" : "האזנה")
        )
      );
      var tbody;
      if (rowModels.length === 0) {
        tbody = React.createElement(
          "tbody",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement(
              "td",
              { colSpan: 6, style: Object.assign({}, tdStyle, { textAlign: "center" }) },
              lang === "en" ? "No per-question AI rows." : "אין שורות AI לפי שאלה."
            )
          )
        );
      } else {
        tbody = React.createElement(
          "tbody",
          null,
          rowModels.map(function (m, idx) {
            return React.createElement(
              "tr",
              { key: "expr-ai-row-" + idx },
              cell(m.qn),
              cell(m.parentStatus),
              cell(m.parentScoreStr),
              cell(m.aiScoreStr),
              cell(m.reason),
              cell(m.listen)
            );
          })
        );
      }
      return React.createElement(
        "div",
        { className: "session-expression-ai-report" },
        React.createElement(
          "h3",
          { className: "session-expression-ai-report__title" },
          lang === "en" ? "Expression AI feedback report" : "דוח משוב הבעה (AI)"
        ),
        React.createElement(
          "p",
          { className: "session-expression-ai-report__matchline" },
          React.createElement("strong", null, lang === "en" ? "Parent vs AI match: " : "התאמה הורה מול AI: "),
          String(pack.gradeMatchedCount) + " / " + String(pack.gradeComparedCount)
        ),
        React.createElement(
          "div",
          { className: "session-expression-ai-report__scroll" },
          React.createElement("table", { className: "session-expression-ai-report__table" }, thead, tbody)
        )
      );
    };

    const downloadExpressionAiReportDoc = function () {
      var pack = getExpressionAiReportRowModels();
      if (!pack) return;
      var testId = lastCompletedTestId || "unknown";
      var rowsHtml = pack.rowModels.length
        ? pack.rowModels.map(function (m) {
            return "<tr>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.qn +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.parentStatus +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.parentScoreStr +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.aiScoreStr +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.matchLabel +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.reason +"</td>" +
              "<td style='border:1px solid #bbb;padding:6px;'>"+ m.listen +"</td>" +
              "</tr>";
          }).join("")
        : "<tr><td colspan='7' style='border:1px solid #bbb;padding:6px;'>No per-question AI rows.</td></tr>";
      var html = "<html><head><meta charset='utf-8'><title>Expression AI Report</title></head><body style='font-family:Arial,sans-serif;padding:16px;'>" +
        "<h2>Expression AI Feedback Report</h2>" +
        "<p><strong>" + (lang === "en" ? "Parent vs AI match" : "התאמה הורה מול AI") + ":</strong> " + pack.gradeMatchedCount + " / " + pack.gradeComparedCount + "</p>" +
        "<h3>Per-question rows</h3>" +
        "<table style='border-collapse:collapse;width:100%;font-size:13px;'><thead><tr>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Q#</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (lang === "en" ? "Parent answer" : "תשובת הורה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (lang === "en" ? "Parent score" : "ציון הורה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>AI score</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>" + (lang === "en" ? "Match" : "התאמה") + "</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Reason</th>" +
        "<th style='border:1px solid #bbb;padding:6px;'>Listen</th>" +
        "</tr></thead><tbody>" + rowsHtml + "</tbody></table>" +
        "</body></html>";
      var blob = new Blob(["\ufeff", html], { type: "application/msword" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "expression_ai_feedback_" + testId + ".doc";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const plsFeedbackText = function (eli, catId) {
      if (!eli) return "";
      if (catId === "integrative") return String(eli.feedback_integrative_language_he || "").trim();
      if (catId === "semantics") return String(eli.feedback_semantics_he || "").trim();
      if (catId === "structure") return String(eli.feedback_language_structure_he || "").trim();
      if (catId === "phonology") return String(eli.feedback_phonological_awareness_he || "").trim();
      return "";
    };
    const buildPlsNarrativeViewModel = function (eli) {
      if (!eli || eli.status !== "done") return null;
      var pos = Array.isArray(eli.positive_points_he) && eli.positive_points_he.length
        ? eli.positive_points_he
        : (Array.isArray(eli.observed_strengths) ? eli.observed_strengths : []);
      var imp = Array.isArray(eli.improvement_points_he) && eli.improvement_points_he.length
        ? eli.improvement_points_he
        : (Array.isArray(eli.observed_challenges) ? eli.observed_challenges : []);
      var intro = String(eli.summary_card_intro_he || "").trim();
      if (!intro) intro = String(eli.summary_paragraph_he || "").trim();
      var steps = Array.isArray(eli.recommended_next_steps_he) ? eli.recommended_next_steps_he : [];
      var hasExtended = !!(
        (eli.feedback_semantics_he && String(eli.feedback_semantics_he).trim()) ||
        (eli.feedback_integrative_language_he && String(eli.feedback_integrative_language_he).trim()) ||
        (eli.feedback_language_structure_he && String(eli.feedback_language_structure_he).trim()) ||
        (eli.feedback_phonological_awareness_he && String(eli.feedback_phonological_awareness_he).trim())
      );
      if (!intro && !pos.length && !imp.length) return null;
      return { intro: intro, positive: pos, improvement: imp, steps: steps, hasExtended: hasExtended };
    };
    const renderPlsNarrativeReport = function (eli) {
      var vm = buildPlsNarrativeViewModel(eli);
      if (!vm) return null;
      var plsCats = [
        { id: "integrative", emoji: "💬", labelHe: "מיומנויות שפה אינטגרטיביות", labelEn: "Integrative language skills" },
        { id: "semantics", emoji: "📚", labelHe: "סמנטיקה", labelEn: "Semantics" },
        { id: "structure", emoji: "🧱", labelHe: "מבנה שפה", labelEn: "Language structure" },
        { id: "phonology", emoji: "👂", labelHe: "מודעות פונולוגית", labelEn: "Phonological awareness" }
      ];
      var sel = plsCats.some(function (c) { return c.id === plsReportCategory; }) ? plsReportCategory : "semantics";
      var selMeta = plsCats.filter(function (c) { return c.id === sel; })[0] || plsCats[1];
      var feedbackBody = plsFeedbackText(eli, sel) || (lang === "en" ? "No category feedback available." : "אין משוב זמין לקטגוריה זו.");
      var stepIcons = ["🧩", "💬", "👂"];
      var heroBlock = React.createElement(
        "div",
        { className: "pls-narrative-report__hero" },
        React.createElement("div", { className: "pls-narrative-report__hero-illus", "aria-hidden": "true" }, "🤖"),
        React.createElement(
          "div",
          { className: "pls-narrative-report__hero-copy" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__hero-title" },
            lang === "en" ? "Summary after AI analysis" : "סיכום לאחר ניתוח בינה מלאכותית"
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__hero-text" },
            vm.intro
              ? vm.intro
              : (lang === "en"
                ? "Key insights from the sampled expression tasks — strengths and areas to reinforce."
                : "תובנות מרכזיות מהדגימות שנבדקו — נקודות חוזק ותחומים לחיזוק.")
          )
        )
      );
      var colBlock = React.createElement(
        "div",
        { className: "pls-narrative-report__columns" },
        React.createElement(
          "div",
          { className: "pls-narrative-report__col pls-narrative-report__col--positive" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__col-head" },
            React.createElement("span", { className: "pls-narrative-report__col-icon", "aria-hidden": "true" }, "✅"),
            lang === "en" ? "Positive points" : "נקודות חיוביות"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__list" },
            (vm.positive.length ? vm.positive : [lang === "en" ? "—" : "—"]).slice(0, 6).map(function (line, idx) {
              return React.createElement("li", { key: "pos-" + idx }, line);
            })
          )
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__col pls-narrative-report__col--improve" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__col-head" },
            React.createElement("span", { className: "pls-narrative-report__col-icon", "aria-hidden": "true" }, "📈"),
            lang === "en" ? "Points to strengthen" : "נקודות לחיזוק / שיפור"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__list" },
            (vm.improvement.length ? vm.improvement : [lang === "en" ? "—" : "—"]).slice(0, 6).map(function (line, idx) {
              return React.createElement("li", { key: "imp-" + idx }, line);
            })
          )
        )
      );
      if (!vm.hasExtended) {
        return React.createElement(
          "div",
          { className: "pls-narrative-report pls-narrative-report--legacy", dir: "rtl" },
          heroBlock,
          colBlock
        );
      }
      return React.createElement(
        "div",
        { className: "pls-narrative-report", dir: "rtl" },
        heroBlock,
        colBlock,
        React.createElement(
          "div",
          { className: "pls-narrative-report__wheel-wrap" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__wheel" },
            React.createElement(
              "div",
              { className: "pls-narrative-report__wheel-center" },
              lang === "en" ? "Choose a category — tap for feedback" : "בחרו קטגוריה — לחצו כדי לראות משוב"
            ),
            React.createElement(
              "div",
              { className: "pls-narrative-report__wheel-nodes" },
              plsCats.map(function (c) {
                var active = c.id === sel;
                return React.createElement(
                  "button",
                  {
                    key: c.id,
                    type: "button",
                    className: "pls-narrative-report__wheel-node" + (active ? " is-active" : ""),
                    onClick: function () { setPlsReportCategory(c.id); }
                  },
                  React.createElement("span", { className: "pls-narrative-report__wheel-emoji", "aria-hidden": "true" }, c.emoji),
                  React.createElement("span", { className: "pls-narrative-report__wheel-label" }, lang === "en" ? c.labelEn : c.labelHe)
                );
              })
            )
          )
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__by-cat" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__by-cat-title" },
            lang === "en" ? "Feedback by category" : "משוב לפי קטגוריה"
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__pill" },
            lang === "en" ? selMeta.labelEn : selMeta.labelHe
          ),
          React.createElement("div", { className: "pls-narrative-report__by-cat-body" }, feedbackBody)
        ),
        React.createElement(
          "div",
          { className: "pls-narrative-report__next" },
          React.createElement(
            "div",
            { className: "pls-narrative-report__next-title" },
            lang === "en" ? "Recommended next steps" : "תכנים מומלצים להמשך"
          ),
          React.createElement(
            "ul",
            { className: "pls-narrative-report__next-list" },
            (vm.steps.length >= 1 ? vm.steps.slice(0, 3) : []).map(function (title, idx) {
              return React.createElement(
                "li",
                { key: "step-" + idx, className: "pls-narrative-report__next-row" },
                React.createElement("span", { className: "pls-narrative-report__next-arrow", "aria-hidden": "true" }, "←"),
                React.createElement("span", { className: "pls-narrative-report__next-ico", "aria-hidden": "true" }, stepIcons[idx] || "⭐"),
                React.createElement("span", { className: "pls-narrative-report__next-text" }, title)
              );
            })
          ),
          React.createElement(
            "div",
            { className: "pls-narrative-report__next-foot" },
            lang === "en"
              ? "Suggestions are adapted to patterns seen in this evaluation sample."
              : "התכנים מותאמים לממצאים שעלו בהערכה."
          )
        )
      );
    };

    return React.createElement(
  React.Fragment,
  null,

  // Navigation bar for completion screen — outside the summary card
  (function () {
    var AppNavbar = window.AppNavbar;
    if (!AppNavbar) {
      return React.createElement("div", { className: "session-complete__nav" }, null);
    }

    return React.createElement(
      "div",
      { className: "session-complete__nav" },
      React.createElement(
        "div",
        { className: "test-navbar" },
        React.createElement(AppNavbar, {
          variant: "complete",
          lang: lang,
          t: t,
          onHome: onHome,
          onReset: onReset,
          setLang: setLang,
        })
      )
    );
  })(),

  React.createElement(
    "div",
    { className: "session-complete" },

    React.createElement(
      "div",
      { className: "session-immediate-summary" },
      React.createElement(
        "div",
        { className: "session-immediate-summary__hero" },
        React.createElement("div", { className: "session-immediate-summary__hero-icon", "aria-hidden": "true" }, "\ud83c\udfc6"),
        React.createElement(
          "div",
          { className: "session-immediate-summary__hero-copy" },
          React.createElement(
            "div",
            { className: "session-immediate-summary__hero-title" },
            lang === "en" ? "Great job — test completed" : "כל הכבוד — סיימתם את ההערכה"
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__hero-subtitle" },
            lang === "en"
              ? "Here is a short game summary."
              : "לפניכם סיכום קצר של המשחק"
          )
        )
      ),
      React.createElement(
        "div",
        { className: "session-immediate-summary__stats" },
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-title" },
          lang === "en" ? "Overall snapshot" : "מבט כללי"
        ),
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-grid" },
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, lang === "en" ? "Age stage" : "גיל"),
            React.createElement("span", { className: "session-immediate-summary__stat-value session-immediate-summary__stat-value--small" }, expectedAgeGroupDisplay)
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile session-immediate-summary__stat-tile--strong" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, lang === "en" ? "Total questions" : "סה\"כ שאלות"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.total))
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, lang === "en" ? "Expression questions" : "שאלות הבעה"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.exprTotal))
          ),
          React.createElement(
            "div",
            { className: "session-immediate-summary__stat-tile" },
            React.createElement("span", { className: "session-immediate-summary__stat-label" }, lang === "en" ? "Comprehension questions" : "שאלות הבנה"),
            React.createElement("span", { className: "session-immediate-summary__stat-value" }, String(totalStats.compTotal))
          )
        ),
        React.createElement(
          "div",
          { className: "session-immediate-summary__stats-note" },
          lang === "en"
            ? "The evaluation included comprehension and expression, and was adjusted to the selected age stage."
            : "ההערכה כללה שאלות הבנה ושאלות הבעה, והותאמה לגיל הילד."
        )
      ),
      React.createElement(
        "div",
        { className: "session-visual-summary" },
        renderVisualSummaryCard({
          key: "comp",
          mode: "comprehension",
          cornerEmoji: "👂",
          titleEn: "Comprehension questions summary",
          titleHe: "סיכום שאלות הבנה",
          stats: comprehensionCakeStats
        }),
        renderVisualSummaryCard({
          key: "expr",
          mode: "expression",
          cornerEmoji: "🗣️",
          titleEn: "Expression questions summary",
          titleHe: "סיכום שאלות הבעה",
          items: [
            { key: "exact", color: "#9EDFC2", value: expressionCakeStats.exact, labelEn: "Exactly", labelHe: "בדיוק" },
            { key: "almost", color: "#BFE7F8", value: expressionCakeStats.almost, labelEn: "Almost", labelHe: "כמעט" },
            { key: "knew_not_say", color: "#F4D474", value: expressionCakeStats.knewNotSay, labelEn: "Knew but didn't say", labelHe: "ידע אבל לא אמר" },
            { key: "not_there_yet", color: "#F3A8AF", value: expressionCakeStats.notThereYet, labelEn: "Not there yet", labelHe: "לא שם עדיין" }
          ],
          stats: expressionCakeStats
        })
      ),
      renderExpressionAiReportInline(),
      expressionAiResolved
        ? React.createElement("div", { className: "session-immediate-summary__balance" }, strongerLabel)
        : null
    ),
      hasExpressionQuestions &&
      expressionAiResult &&
      expressionAiResult.expressive_language_impression &&
      expressionAiResult.expressive_language_impression.status === "done"
        ? renderPlsNarrativeReport(expressionAiResult.expressive_language_impression)
        : null,
      hasExpressionQuestions && lastCompletedTestId && expressionFeedbackPending
        ? React.createElement(
            "div",
            { style: { marginTop: "12px", textAlign: "center", display: "grid", gap: "8px", justifyItems: "center" } },
            React.createElement(
              "div",
              {
                style: {
                  width: "min(100%, 560px)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #d5dbe3",
                  background: "#f5f7fa",
                  color: "#34495e",
                  fontSize: "14px",
                  lineHeight: 1.4
                }
              },
              React.createElement(
                "div",
                { style: { fontWeight: 700, marginBottom: "4px" } },
                lang === "en"
                  ? "Expression AI status: " + expressionPhaseLabel(expressionAiPhase)
                  : "סטטוס משוב הבעה: " + expressionPhaseLabel(expressionAiPhase)
              ),
              React.createElement(
                "div",
                null,
                lang === "en"
                  ? ("Progress: " + expressionAiProcessedForProgress + "/" + expressionAiTotalForProgress + " questions")
                  : ("התקדמות: " + expressionAiProcessedForProgress + "/" + expressionAiTotalForProgress + " שאלות")
              )
            ),
            React.createElement(
              "button",
              {
                type: "button",
                disabled: expressionAiLoading,
                onClick: function () {
                  void refreshExpressionAiStatus();
                },
                style: {
                  padding: "10px 18px",
                  fontSize: "15px",
                  backgroundColor: expressionAiLoading ? "#9aa3b2" : "#6c8fb0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: expressionAiLoading ? "not-allowed" : "pointer",
                  opacity: 0.95,
                  maxWidth: "min(100%, 520px)"
                }
              },
              expressionAiLoading
                ? (lang === "en" ? "Refreshing..." : "מרענן...")
                : (lang === "en"
                  ? "Refresh AI status"
                  : "רענון סטטוס AI")
            )
          )
        : null,
      expressionAiResolved && hasExpressionQuestions && expressionAiResult
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "18px",
                width: "min(100%, 620px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "14px 14px 14px",
                textAlign: "center",
                background: "#f7f8fd",
                border: "1px solid #d7defb",
                borderRadius: "12px",
                display: "grid",
                gap: "10px"
              }
            },
            React.createElement(
              "div",
              { style: { fontWeight: 800, fontSize: "17px", color: "#20364a" } },
              lang === "en" ? "AI feedback is ready" : "משוב ה-AI מוכן"
            ),
            React.createElement(
              "div",
              { style: { fontSize: "14px", color: "#4b5d6f" } },
              lang === "en"
                ? "The same report is shown in the summary above. You can also download a Word file to share."
                : "אותו דוח מוצג למעלה בסיכום. אפשר גם להוריד קובץ Word לשיתוף."
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" } },
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: downloadExpressionAiReportDoc,
                  style: {
                    padding: "10px 14px",
                    fontSize: "14px",
                    backgroundColor: "#4a9a62",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    opacity: 0.96
                  }
                },
                lang === "en" ? "Download Word" : "הורדת Word"
              )
            )
          )
        : null
      )
    );
  }


  if (questions.length === 0) {
    return React.createElement("div", null, tr("test.noQuestions"));
  }

  // Show loading screen ONLY if current question images aren't ready
  if (!currentQuestionImagesLoaded) {
    return React.createElement(
      "div",
      { className: "question-loading-screen" },
      React.createElement("h2", null, tr("test.loadingQuestion.title")),
      React.createElement("p", null, tr("test.loadingQuestion.body")),
      showQuestionLoadingRecovery
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "p",
              { style: { marginTop: "12px", color: "#5c6b70", maxWidth: "320px", textAlign: "center", lineHeight: 1.5 } },
              lang === "en"
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
                  onClick: retryCurrentQuestionLoading,
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
                lang === "en" ? "Retry loading" : "נסה לטעון שוב"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: onHome,
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
                lang === "en" ? "Back to home" : "חזרה לדף הבית"
              )
            )
          )
        : null
    );
  }

  const currentIdx = getCurrentQuestionIndex();
  const currentQuestion = questions[currentIdx];
  const currentQuestionAgeGroup = currentQuestion ? currentQuestion.age_group : "";
  const currentQuestionAgeBadge = formatQuestionAgeBadge(currentQuestionAgeGroup);
  const currentImageCount = images.length;
  const maxRows = 2;
  // For ≤4 images put all in ONE row; for more, split into 2 rows
  const gridColumns = currentImageCount <= 4
    ? currentImageCount
    : Math.max(1, Math.ceil(currentImageCount / maxRows));
  const compactImages = currentImageCount > 6;
  const minImgWidth = compactImages ? (isMobile ? 140 : 120) : (isMobile ? 160 : 140);
  const imagesGridStyle = { gridTemplateColumns: "repeat(" + gridColumns + ", 1fr)", gap: "8px" };
  const imagesContainerClassName =
    "images-container" +
    (currentImageCount === 1 ? " images-container--single" : "") +
    (questionType === "C" ? " images-container--comprehension" : " images-container--expression");
  const shouldShowSpeakerStatusUi =
    !sessionCompleted && !trafficPopupOpen && !showContinue;
  const getTrafficOptionExample = function (resultKey) {
    if (!currentQuestion) return "";
    if (resultKey === "success") return String(currentQuestion.expected_full_parents || "").trim();
    if (resultKey === "partial") return String(currentQuestion.expected_partial || "").trim();
    return String(currentQuestion.expected_wrong || "").trim();
  };
  const renderTrafficOptionExample = function (resultKey) {
    var exampleText = getTrafficOptionExample(resultKey);
    if (!exampleText) return null;
    return React.createElement(
      "div",
      { className: "traffic-option__desc" },
      React.createElement("span", { className: "traffic-option__example-prefix" }, tr("test.trafficPopup.examplePrefix") + " "),
      exampleText
    );
  };
  // Main UI
  return React.createElement(
    "div",
    {
      className: "app-container"
    },
    renderConfettiOverlay(),
    renderClappingAvatarOverlay(),

    blockFinishUntilVerifyOverlay
      ? React.createElement(
        "div",
        {
          className: "finish-verify-blocking-overlay",
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.97)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10002,
            padding: "28px 20px",
            boxSizing: "border-box",
            textAlign: "center",
            pointerEvents: "auto"
          },
          role: "dialog",
          "aria-modal": "true",
          "aria-live": "polite"
        },
        React.createElement("div", {
          style: {
            width: "44px",
            height: "44px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #4CAF50",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "22px"
          }
        }),
        React.createElement("h2", { style: { fontSize: "22px", marginBottom: "14px", color: "#304348", maxWidth: "440px" } }, tr("test.finish.verifyOverlayTitle")),
        React.createElement("p", { style: { fontSize: "17px", color: "#556", maxWidth: "440px", lineHeight: 1.55 } }, tr("test.finish.verifyOverlayBody"))
      )
      : null,

    // Paused overlay
    isPaused
      ? React.createElement(
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
        React.createElement("h1", { style: { color: "white", fontSize: "clamp(36px, 10vw, 52px)", marginBottom: "14px", textAlign: "center", lineHeight: 1.1, maxWidth: "90vw" } }, tr("test.paused.title")),
        React.createElement("p", { style: { color: "white", fontSize: "clamp(17px, 4.6vw, 24px)", marginBottom: "22px", textAlign: "center", lineHeight: 1.35, maxWidth: "90vw" } },
          tr("test.paused.body")
        ),
        React.createElement(
          "button",
          {
            onClick: resumeTest,
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
          tr("test.paused.cta")
        ),
        React.createElement(
          "button",
          {
            onClick: onHome,
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
          lang === "en" ? "🏠 Back to home" : "🏠 חזרה לבית"
        )
      )
      : null,
    // Session could not be saved to server — parent returns home only (draft at start, or clip mid-test).
    sessionGoHomeBlock
      ? React.createElement(
          "div",
          {
            className: "session-start-blocked-overlay",
            style: {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.82)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: "16px",
              boxSizing: "border-box"
            },
            role: "alertdialog",
            "aria-modal": "true",
            "aria-labelledby": "session-go-home-blocked-title"
          },
          React.createElement(
            "div",
            {
              style: {
                backgroundColor: "white",
                padding: "32px 28px",
                borderRadius: "14px",
                textAlign: "center",
                maxWidth: "440px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)"
              },
              dir: lang === "he" ? "rtl" : "ltr"
            },
            React.createElement(
              "h2",
              {
                id: "session-go-home-blocked-title",
                style: { margin: "0 0 14px", fontSize: "22px", color: "#1a2b3c", lineHeight: 1.3 }
              },
              tr(
                sessionGoHomeBlock === "clipSave"
                  ? "test.sessionClipSaveFailed.title"
                  : "test.sessionStartFailed.title"
              )
            ),
            React.createElement(
              "p",
              { style: { margin: "0 0 26px", fontSize: "17px", color: "#4a5568", lineHeight: 1.45 } },
              tr(
                sessionGoHomeBlock === "clipSave"
                  ? "test.sessionClipSaveFailed.body"
                  : "test.sessionStartFailed.body"
              )
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: function () {
                  setSessionGoHomeBlock(null);
                  onHome();
                },
                style: {
                  padding: "14px 28px",
                  fontSize: "17px",
                  backgroundColor: "#2E5D73",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "700",
                  minWidth: "200px"
                }
              },
              tr(
                sessionGoHomeBlock === "clipSave"
                  ? "test.sessionClipSaveFailed.ctaHome"
                  : "test.sessionStartFailed.ctaHome"
              )
            )
          )
        )
      : null,
    // AFK Warning popup (hidden while go-home failure overlay is shown)
    showAfkWarning && !isPaused && !sessionGoHomeBlock
      ? React.createElement(
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
          React.createElement("h2", { style: { marginBottom: "20px", fontSize: "28px" } }, tr("test.afk.title")),
          React.createElement("p", { style: { marginBottom: "30px", fontSize: "18px", color: "#666" } },
            tr("test.afk.body")
          ),
          React.createElement(
            "button",
            {
              onClick: handleAfkResponse,
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
            tr("test.afk.cta")
          )
        )
      )
      : null,
    React.createElement(TestNavbar),
    (!sessionCompleted && !isPortraitMobile) ? React.createElement(ProgressBar) : null,
    shouldShowSpeakerStatusUi
      ? (
        speakerVerificationStatus === "failed"
          ? React.createElement(
            "div",
            { className: "speaker-status-banner speaker-status-banner--warning" },
            lang === "en"
              ? "Parent voice verification failed. You can continue for now, but you must retry before finishing."
              : "אימות קול ההורה נכשל. אפשר להמשיך כרגע, אך חייבים לנסות שוב לפני סיום."
          )
          : speakerVerificationStatus === "success"
            ? React.createElement(
              "div",
              { className: "speaker-status-banner speaker-status-banner--success" },
              lang === "en"
                ? "Parent voice verified successfully."
                : "קול ההורה אומת בהצלחה."
            )
            : null
      )
      : null,
    null,


    trafficPopupOpen
      ? React.createElement(
        "div",
        {
          className: "traffic-popup-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": tr("test.trafficLight.aria"),
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
            if (questionType === "E" && evaluationEnabled) return null;
            const fallbackBack = lang === "en" ? "↪️ Back" : "↪️ חזור";
            const fallbackAria = lang === "en" ? "Back to question" : "חזרה לשאלה";
            const backLabel = (function () {
              const s = tr("test.trafficPopup.back");
              return s && s !== "test.trafficPopup.back" ? s : fallbackBack;
            })();
            const backAria = (function () {
              const s = tr("test.trafficPopup.backAria");
              return s && s !== "test.trafficPopup.backAria" ? s : fallbackAria;
            })();
            return React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-popup__back",
                onClick: cancelTrafficPopup,
                "aria-label": backAria
              },
              fallbackBack.charAt(0) // keep only the icon/arrow portion
            );
          })(),
          React.createElement(
            "div",
            { className: "traffic-popup__grid" },
            ENABLE_EXPRESSION_HINTS && questionType === "E" && hintWasUsedThisQuestion
              ? null
              : React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "traffic-option traffic-option--green",
                    onClick: function () { handleTrafficPopupChoice("success"); },
                    disabled: !!trafficPopupChoice,
                  },
                  React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.green.title")),
                  renderTrafficOptionExample("success")
                ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--lime",
                onClick: function () { handleTrafficPopupChoice("partial"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.orange.title")),
              renderTrafficOptionExample("partial")
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--amber",
                onClick: function () { handleTrafficPopupChoice("midFailure"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.midFailure.title"))
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--yellow",
                onClick: function () { handleTrafficPopupChoice("failure"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.red.title")),
              renderTrafficOptionExample("failure")
            )
          ),
          trafficPopupChoice
            ? React.createElement(
              "div",
              { className: "traffic-popup__feedback" },
              trafficPopupChoice === "success"
                ? (lang === "en" ? "Great!" : "כל הכבוד!")
                : trafficPopupChoice === "partial"
                  ? (lang === "en" ? "Noted." : "רשמנו.")
                  : (lang === "en" ? "We'll practice." : "נתרגל שוב.")
            )
            : null
        )
      )
      : null,

    incompleteSummaryConfirmOpen
      ? React.createElement(
          "div",
          {
            className: "traffic-popup-overlay",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": tr("test.incompleteSummary.title"),
            onClick: function () {
              setIncompleteSummaryConfirmOpen(false);
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
            React.createElement("h2", { className: "traffic-popup__title" }, tr("test.incompleteSummary.title")),
            React.createElement("p", { style: { margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, color: "#304348", textAlign: "center" } }, tr("test.incompleteSummary.body")),
            React.createElement(
              "div",
              { className: "onboarding-cta-row", style: { maxWidth: "100%", marginTop: 4 } },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "onboarding-btn onboarding-btn--secondary",
                  onClick: function () {
                    setIncompleteSummaryConfirmOpen(false);
                  },
                },
                tr("test.incompleteSummary.stay")
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "onboarding-btn onboarding-btn--primary",
                  onClick: function () {
                    setIncompleteSummaryConfirmOpen(false);
                    completeSession(questionResults);
                  },
                },
                tr("test.incompleteSummary.finish")
              )
            )
          )
        )
      : null,

    // ── Question section (audio + question only) ──────────
React.createElement(
  "div",
  { className: "question-section", key: "question-section-" + ((currentQuestion && currentQuestion.query_number) || currentIdx) },
  React.createElement(
    "div",
    { className: "question-section__query-row" },
    questionAudio
      ? React.createElement(
          "button",
          {
            type: "button",
            className: "replay-audio-btn",
            onClick: replayQuestionAudio,
            disabled: isAudioPlaying,
            "aria-label": tr("test.audio.playQuestion"),
          },
          React.createElement("span", {
            className: "material-symbols-outlined replay-audio-btn__icon",
            "aria-hidden": "true"
          }, "volume_up"),
          React.createElement("span", { className: "replay-audio-btn__label" }, "")
        )
      : null,
    React.createElement("h2", { className: "query-text" }, (questions[currentIdx] && questions[currentIdx].query) || ""),
    React.createElement(
      "span",
      {
        className: "material-symbols-outlined question-type-indicator",
        "aria-hidden": "true",
        title: questionType === "E"
          ? (lang === "en" ? "Expression question" : "שאלת הבעה")
          : (lang === "en" ? "Comprehension question" : "שאלת הבנה")
      },
      questionType === "E" ? "mic" : "touch_app"
    ),
    currentQuestionAgeBadge
      ? React.createElement(
          "span",
          {
            className: "question-age-indicator",
            title: lang === "en"
              ? ("Target age for this question: " + currentQuestionAgeGroup)
              : ("גיל היעד לשאלה: " + currentQuestionAgeGroup),
            "aria-label": lang === "en"
              ? ("Target age " + currentQuestionAgeGroup)
              : ("גיל יעד " + currentQuestionAgeGroup)
          },
          React.createElement("span", { className: "question-age-indicator__label", "aria-hidden": "true" }, "שנים"),
          React.createElement(
            "span",
            { className: "question-age-indicator__text" },
            currentQuestionAgeBadge
          ),
          React.createElement("span", { className: "question-age-indicator__emoji", "aria-hidden": "true" }, "🎂")
        )
      : null
    
  )
),

renderExpectedAnswerNote(),

questionType === "C"
  ? React.createElement(
      "div",
      {
        className:
          "comprehension-container" +
          (isPortraitMobile && currentImageCount === 3 ? " comprehension-container--three-up" : "") +
          (isPortraitMobile && currentImageCount >= 4 ? " comprehension-container--two-col" : "")
      },
      (function () {
        const shouldUseThreeUp = isPortraitMobile && currentImageCount === 3;
        const shouldUseFiveUp = isPortraitMobile && currentImageCount === 5;
        const shouldUseTwoColumnGrid = isPortraitMobile && currentImageCount >= 4;
        const shouldUseSingleColumn = isPortraitMobile && currentImageCount === 2;

        const comprehensionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          :shouldUseThreeUp || shouldUseFiveUp ? { display: "flex", flexDirection: "column", gap: "12px" }
          : shouldUseTwoColumnGrid
            ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }
            : (isTwoRow ? { display: "flex", flexDirection: "column", gap: "6px" } : imagesGridStyle);

        function renderImage(img, i, extraClassName) {
          const imgIndex = i + 1;
          const isCorrectMulti = answerType === "multi" && clickedMultiAnswers.includes(imgIndex);
          const isTargetSingle = answerType === "single" && img === target && clickedCorrect;
          const isOrderedCorrect =
            answerType === "ordered" &&
            orderedAnswers.length > 0 &&
            imgIndex === orderedAnswers[0] &&
            orderedClickSequence.length > 0 &&
            orderedClickSequence[0] === orderedAnswers[0];
          const showGreenBorder =
            isCorrectMulti ||
            isTargetSingle ||
            isOrderedCorrect ||
            (answerType === "mask" && clickedCorrect);
          const isNonClickable = nonClickableImage && imgIndex === nonClickableImage;

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
              "data-fallback-png-first": answerType === "mask" ? "1" : undefined,
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
              onError: handleImageFallbackError,
              onClick: function (e) { handleClick(img, e); },
            })
          );
        }

        if (!isPortraitMobile && isTwoRow) {
          const topCountDynamic = topRowCount;
          const bottomImages = images.slice(topCountDynamic);

          return React.createElement(
            "div",
            {
              className: imagesContainerClassName,
              style: comprehensionGridStyle,
              "data-count": currentImageCount,
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
                images.slice(0, topCountDynamic).map(function (img, i) {
                  return renderImage(img, i, topRowBigger ? "top-row-big" : "");
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
              className: imagesContainerClassName + " images-container--three-up",
              style: comprehensionGridStyle,
              "data-count": currentImageCount,
              "data-question-type": "C",
            },
            React.createElement(
              "div",
              { className: "images-container--three-up-top" },
              images.slice(0, 2).map(function (img, i) {
                return renderImage(img, i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--three-up-bottom" },
              images.slice(2, 3).map(function (img, i) {
                return renderImage(img, 2 + i, "");
              })
            )
          );
        }

        if (shouldUseFiveUp) {
          return React.createElement(
            "div",
            {
              className: imagesContainerClassName + " images-container--five-up",
              style: comprehensionGridStyle,
              "data-count": currentImageCount,
              "data-question-type": "C",
            },
            React.createElement(
              "div",
              { className: "images-container--five-up-bottom" },
              images.slice(4, 5).map(function (img, i) {
                return renderImage(img, 4 + i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              images.slice(0, 2).map(function (img, i) {
                return renderImage(img, i, "");
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              images.slice(2, 4).map(function (img, i) {
                return renderImage(img, 2 + i, "");
              })
            )
          );
        }

        return React.createElement(
          "div",
          {
            className:
              imagesContainerClassName +
              (shouldUseSingleColumn ? " images-container--single-column" : "") +
              (shouldUseTwoColumnGrid ? " images-container--two-col" : ""),
            style: comprehensionGridStyle,
            "data-count": currentImageCount,
            "data-question-type": "C",
          },
          images.map(function (img, i) {
            return renderImage(img, i, "");
          })
        );
      })()
    )
  : null,

questionType === "E"
  ? React.createElement(
      "div",
      { className: "expression-container" },
      (function () {
        const shouldUseSingleColumn = isPortraitMobile && currentImageCount === 2;
        const shouldUseThreeUp = isPortraitMobile && currentImageCount === 3;
        const shouldUseFiveUp = isPortraitMobile && currentImageCount === 5;
        const shouldUseTwoColumnGrid = isPortraitMobile && currentImageCount >= 4;

        const expressionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          : shouldUseThreeUp || shouldUseFiveUp ? { display: "flex", flexDirection: "column", gap: "12px" }
          : shouldUseTwoColumnGrid
            ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }
            : imagesGridStyle;

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
              onError: handleImageFallbackError
            })
          );
        }

        if (shouldUseThreeUp) {
          return React.createElement(
            "div",
            {
              className: imagesContainerClassName + " images-container--three-up",
              style: expressionGridStyle,
              "data-count": currentImageCount,
              "data-question-type": "E",
            },
            React.createElement(
              "div",
              { className: "images-container--three-up-top" },
              images.slice(0, 2).map(function (img, i) {
                return renderExpressionImage(img, i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--three-up-bottom" },
              images.slice(2, 3).map(function (img, i) {
                return renderExpressionImage(img, 2 + i);
              })
            )
          );
        }

        if (shouldUseFiveUp) {
          return React.createElement(
            "div",
            {
              className: imagesContainerClassName + " images-container--five-up",
              style: expressionGridStyle,
              "data-count": currentImageCount,
              "data-question-type": "E",
            },
            React.createElement(
              "div",
              { className: "images-container--five-up-bottom" },
              images.slice(4, 5).map(function (img, i) {
                return renderExpressionImage(img, 4 + i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              images.slice(0, 2).map(function (img, i) {
                return renderExpressionImage(img, i);
              })
            ),
            React.createElement(
              "div",
              { className: "images-container--five-up-top" },
              images.slice(2, 4).map(function (img, i) {
                return renderExpressionImage(img, 2 + i);
              })
            )
          );
        }

        return React.createElement(
          "div",
          {
            className:
              imagesContainerClassName +
              (shouldUseSingleColumn ? " images-container--single-column" : "") +
              (shouldUseTwoColumnGrid ? " images-container--two-col" : ""),
            style: expressionGridStyle,
            "data-count": currentImageCount,
            "data-question-type": "E",
          },
          images.map(function (img, i) {
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