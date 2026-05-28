function Test({ allQuestions, lang, t, onHome, onReset, setLang, onTestPhase }) {
  var TM = window.MiliTestModules || {};
  var AVATAR_INTRO_VIDEO = TM.AVATAR_INTRO_VIDEO;
  var resolveAvatarIntroVideoSources = TM.resolveAvatarIntroVideoSources;
  var switchAvatarIntroVideoToMp4Fallback = TM.switchAvatarIntroVideoToMp4Fallback;
  const PRIVACY_POLICY_URL = TM.PRIVACY_POLICY_URL;
  const TERMS_OF_USE_URL = TM.TERMS_OF_USE_URL;
  const tr = function (key, vars) {
    return t ? t(key, vars) : key;
  };
  const getQuestionAudioFolderByGender = function (genderValue) {
    const normalized = String(genderValue || "").toLowerCase();
    if (normalized === "female" || normalized === "girl") return "audio_girl";
    return "audio_boy";
  };

  var EXPRESSION_EVAL_DELAY_MS = TM.getExpressionEvalDelayMs();

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
  /** Holds 20s eval timer while incremental segment upload / queue drain runs after traffic submit. */
  const expressionEvalFrozenForIncrementalUploadRef = React.useRef(false);
  const expressionEvalEnableTimerRef = React.useRef(null);
  const expressionEvalArmedQuestionRef = React.useRef(null);
  const expressionAnswerEndTimerRef = React.useRef(null);
  const expressionSegmentRecorderRef = React.useRef(null);
  const expressionSegmentQueueRef = React.useRef(null);
  var exprTimerCtxRef = React.useRef({});
  var exprTimersRef = React.useRef(null);
  function ensureExprTimers() {
    if (!exprTimersRef.current && TM.createExpressionTimers) {
      exprTimersRef.current = TM.createExpressionTimers(function () {
        return exprTimerCtxRef.current;
      });
    }
    return exprTimersRef.current;
  }
  function clearExpressionEvalEnableTimer() {
    var api = ensureExprTimers();
    if (api) api.clearExpressionEvalEnableTimer();
  }
  function scheduleExpressionEvalEnable(ms) {
    var api = ensureExprTimers();
    if (api) api.scheduleExpressionEvalEnable(ms);
  }
  function scheduleExpressionAnswerEndMark(q, delayMs) {
    var api = ensureExprTimers();
    if (api) api.scheduleExpressionAnswerEndMark(q, delayMs);
  }
  function freezeExpressionEvalCountdown() {
    var api = ensureExprTimers();
    if (api) api.freezeExpressionEvalCountdown();
  }
  function resumeExpressionEvalCountdown() {
    var api = ensureExprTimers();
    if (api) api.resumeExpressionEvalCountdown();
  }
  function beginExpressionEvalFreezeForIncrementalUpload() {
    expressionEvalFrozenForIncrementalUploadRef.current = true;
    markCurrentQuestionEndTimestamp();
    freezeExpressionEvalCountdown();
  }
  function clearExpressionEvalFreezeForIncrementalUpload() {
    expressionEvalFrozenForIncrementalUploadRef.current = false;
  }
  function clearExpressionAnswerEndTimer() {
    var api = ensureExprTimers();
    if (api) api.clearExpressionAnswerEndTimer();
  }
  // Track full array of question results: [{questionNumber, result}, ...]
  const [questionResults, setQuestionResults] = usePersistentState("questionResults", []);

  // Transcription state
  const [lastCompletedTestId, setLastCompletedTestId] = usePersistentState("lastCompletedTestId", null);
  const [expressionAiResult, setExpressionAiResult] = usePersistentState("expressionAiResult", null);
  const [expressionAiLoading, setExpressionAiLoading] = React.useState(false);
  const [testUploadState, setTestUploadState] = React.useState("idle");
  const [testUploadError, setTestUploadError] = React.useState(null);
  const [expressionAiPollError, setExpressionAiPollError] = React.useState(null);
  const expressionAiPollStartedRef = React.useRef(null);
  const pendingCompleteSessionResultsRef = React.useRef(null);
  const retryRecordingUploadRef = React.useRef(null);
  /** Which PLS frame is selected in the narrative report wheel (integrative | semantics | structure | phonology). */
  const [plsReportCategory, setPlsReportCategory] = React.useState("semantics");

  // Microphone persistent
  const [permission, setPermission] = usePersistentState("permission", false);
  const [microphoneSkipped, setMicrophoneSkipped] = usePersistentState("microphoneSkipped", false);
  const [micCheckPassed, setMicCheckPassed] = usePersistentState("micCheckPassed", false);
  const [awaitingExpressionMicCheck, setAwaitingExpressionMicCheck] = usePersistentState("awaitingExpressionMicCheck", false);
  const [comprIntroVideoComplete, setComprIntroVideoComplete] = usePersistentState("comprIntroVideoComplete", false);
  const [expIntroVideoComplete, setExpIntroVideoComplete] = usePersistentState("expIntroVideoComplete", false);
  const [pendingExpressionIntroIndex, setPendingExpressionIntroIndex] = usePersistentState("pendingExpressionIntroIndex", -1);
  const [voiceIdentifierConfirmed, setVoiceIdentifierConfirmed] = usePersistentState("voiceIdentifierConfirmed", false);
  const comprIntroVideoRef = React.useRef(null);
  const comprIntroAutoplayBlockedRef = React.useRef(false);
  const expIntroVideoRef = React.useRef(null);
  const expIntroAutoplayBlockedRef = React.useRef(false);
  const pendingFirstExpressionIndexRef = React.useRef(null);
  const expressionIntroActiveRef = React.useRef(false);
  const [micCheckRunning, setMicCheckRunning] = React.useState(false);
  const [micCheckReady, setMicCheckReady] = React.useState(false);
  const [micCheckLevel, setMicCheckLevel] = React.useState(0);
  const [micCheckPeak, setMicCheckPeak] = React.useState(0);
  const [micPermissionError, setMicPermissionError] = React.useState("");
  const micCheckStreamRef = React.useRef(null);
  const micCheckAudioContextRef = React.useRef(null);
  const micCheckAnalyserRef = React.useRef(null);
  const micCheckRafRef = React.useRef(null);

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

  const maskAwaitingSecondRef = React.useRef(false);
  const singleComprehensionRetryRef = React.useRef(false);
  const multiWrongClicksRef = React.useRef(0);
  const comprehensionAdvanceLockRef = React.useRef(false);
  /** Ordered (2-step): rescue tap after duplicate first; four-image questions use a 3-click cap (partial if clicks 2–3 are first→second). */
  const orderedRescueActiveRef = React.useRef(false);
  const orderedRescueTargetRef = React.useRef(null); // 1-based image index
  const [incompleteSummaryConfirmOpen, setIncompleteSummaryConfirmOpen] = React.useState(false);
  const incompleteSummaryConfirmOpenRef = React.useRef(false);
  incompleteSummaryConfirmOpenRef.current = incompleteSummaryConfirmOpen;
  /** True when we called pauseTest() opening the early-finish dialog (Stay may resume). */
  const incompleteFinishDialogPausedByUsRef = React.useRef(false);

  window.MiliTestFinishDialog = {
    isOpen: function () {
      return incompleteSummaryConfirmOpenRef.current;
    },
  };

  var micIntroCtxRef = React.useRef({});
  var micIntroRef = React.useRef(null);
  function ensureMicIntro() {
    if (!micIntroRef.current && TM.createMicIntro) {
      micIntroRef.current = TM.createMicIntro(function () {
        return micIntroCtxRef.current;
      });
    }
    return micIntroRef.current;
  }
  function stopMicrophoneCheck() {
    var api = ensureMicIntro();
    if (api) api.stopMicrophoneCheck();
  }
  async function startMicrophoneCheck() {
    var api = ensureMicIntro();
    if (api) return api.startMicrophoneCheck();
  }

  // Continuous recording state (persistent so it survives refresh)
  const [sessionRecordingStarted, setSessionRecordingStarted] = usePersistentState("sessionRecordingStarted", false);
  const [recordingInterruptedBannerOpen, setRecordingInterruptedBannerOpen] = React.useState(false);
  /** Incremental-only: hard segment capture failure (call / OS mic revoke). */
  const [incrementalSegmentInterrupt, setIncrementalSegmentInterrupt] = React.useState(null);
  /** True when getUserMedia succeeds while incremental interrupt modal is open (restart gate). */
  const [incrementalRestartMicReady, setIncrementalRestartMicReady] = React.useState(false);
  /** Bumps when interrupt poll sees upload-state change (re-render modal). */
  const [incrementalInterruptUploadState, setIncrementalInterruptUploadState] = React.useState("none");
  const expressionPhaseRecordingStartedRef = React.useRef(false);
  /** True only during expression answer capture: after prompt audio ends until end-mark / score / navigation / finish. */
  const expressionAnswerCaptureActiveRef = React.useRef(false);
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
      "forceFreshStartAfterMicCheck",
      "comprIntroVideoComplete",
      "awaitingExpressionMicCheck",
      "expIntroVideoComplete",
      "pendingExpressionIntroIndex",
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    if (SessionRecorder && SessionRecorder.resetTimestamps) {
      SessionRecorder.resetTimestamps();
    }
    if (SessionRecorder && SessionRecorder.cleanup) {
      SessionRecorder.cleanup({ preserveQuestionTimestamps: false });
    }
    expressionPhaseRecordingStartedRef.current = false;
    expressionAnswerCaptureActiveRef.current = false;
    clearExpressionAnswerEndTimer();
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
    setComprIntroVideoComplete(false);
    setAwaitingExpressionMicCheck(false);
    setExpIntroVideoComplete(false);
    setPendingExpressionIntroIndex(-1);
    pendingFirstExpressionIndexRef.current = null;
  }

  const isPausedRef = React.useRef(isPaused);
  isPausedRef.current = isPaused;
  const sessionCompletedRef = React.useRef(sessionCompleted);
  sessionCompletedRef.current = sessionCompleted;
  const voiceIdentifierConfirmedRef = React.useRef(voiceIdentifierConfirmed);
  voiceIdentifierConfirmedRef.current = voiceIdentifierConfirmed;
  const awaitingExpressionMicCheckRef = React.useRef(awaitingExpressionMicCheck);
  awaitingExpressionMicCheckRef.current = awaitingExpressionMicCheck;

  function isExpressionMicCheckGateActive() {
    var api = ensureMicIntro();
    return api ? api.isExpressionMicCheckGateActive() : false;
  }
  function applyWelcomeDirectToFirstQuestion() {
    var api = ensureMicIntro();
    if (api) api.applyWelcomeDirectToFirstQuestion();
  }

  expressionIntroActiveRef.current =
    !sessionCompleted &&
    !expIntroVideoComplete &&
    pendingExpressionIntroIndex >= 0 &&
    (micCheckPassed || microphoneSkipped);
  const sessionRecordingStartedRef = React.useRef(sessionRecordingStarted);
  sessionRecordingStartedRef.current = sessionRecordingStarted;
  const recordingPermissionRef = React.useRef(permission);
  recordingPermissionRef.current = permission;
  const showClappingAvatarRef = React.useRef(showClappingAvatar);
  showClappingAvatarRef.current = showClappingAvatar;
  const questionTypeRef = React.useRef(questionType);
  questionTypeRef.current = questionType;
  const trafficPopupOpenRef = React.useRef(trafficPopupOpen);
  trafficPopupOpenRef.current = trafficPopupOpen;
  const evaluationEnabledRef = React.useRef(evaluationEnabled);
  evaluationEnabledRef.current = evaluationEnabled;

  /** null | "choice" (comp OK, restart expression or home) | "forceHome" (comp data lost). */
  const [expressionRefreshRecovery, setExpressionRefreshRecovery] = React.useState(null);
  const expressionRefreshCheckedRef = React.useRef(false);

  function endExpressionAnswerRecordingCapture() {
    expressionAnswerCaptureActiveRef.current = false;
    if (typeof SessionRecorder !== "undefined" && SessionRecorder.pauseRecordingIfActive) {
      SessionRecorder.pauseRecordingIfActive();
    }
  }

  /** Keeps MediaRecorder paused unless we're inside the bounded expression answer capture window and overlays don't forbid it. */
  function syncExpressionAnswerRecordingCapture() {
    if (
      typeof SessionRecorder === "undefined" ||
      !SessionRecorder.pauseRecordingIfActive ||
      !SessionRecorder.resumeRecordingIfPaused
    ) {
      return;
    }
    if (!sessionRecordingStartedRef.current || !recordingPermissionRef.current) {
      return;
    }
    if (!expressionPhaseRecordingStartedRef.current) {
      return;
    }

    var captureActive = expressionAnswerCaptureActiveRef.current;
    var completed = sessionCompletedRef.current;
    var userPaused = isPausedRef.current;
    var clapping = showClappingAvatarRef.current;
    /** 20s expression timer expired — not early evaluate popup alone. */
    var timerExpired = evaluationEnabledRef.current;

    if (completed || !captureActive) {
      SessionRecorder.pauseRecordingIfActive();
      return;
    }

    if (userPaused) {
      return;
    }

    if (clapping) {
      SessionRecorder.pauseRecordingIfActive();
      return;
    }

    if (timerExpired) {
      SessionRecorder.pauseRecordingIfActive();
      return;
    }

    var pr = SessionRecorder.resumeRecordingIfPaused();
    if (pr && typeof pr.then === "function") {
      pr.catch(function () {});
    }
  }

  function beginExpressionAnswerRecordingCapture() {
    expressionAnswerCaptureActiveRef.current = true;
    syncExpressionAnswerRecordingCapture();
    if (getExpressionAudioMode() === "incremental" && expressionSegmentRecorderRef.current) {
      var q = questions[getSafeCurrentQuestionIndex()];
      if (q && q.query_type === "הבעה") {
        return expressionSegmentRecorderRef.current.startSegment(q.query_number);
      }
    }
    return Promise.resolve();
  }

  function getExpressionAudioMode() {
    try {
      var mode = JSON.parse(localStorage.getItem("expressionAudioMode") || "\"legacy\"");
      return mode === "incremental" ? "incremental" : "legacy";
    } catch (e) {
      return "legacy";
    }
  }

  async function enqueueExpressionSegmentUpload(question, headlightResult) {
    if (!question || question.query_type !== "הבעה") return;
    if (getExpressionAudioMode() !== "incremental") return;
    if (!expressionSegmentRecorderRef.current || !expressionSegmentQueueRef.current) return;
    var testId = ensurePendingTestId();
    var blob = await expressionSegmentRecorderRef.current.stopSegment(question.query_number);
    if (!blob) {
      console.warn("[incremental] missing segment blob for q" + String(question.query_number || ""));
      return;
    }
    expressionSegmentQueueRef.current.enqueue({
      userId: idDigits,
      testId: testId,
      questionNumber: String(question.query_number || ""),
      headlightResult: headlightResult,
      segmentBlob: blob,
      childGender: childGender,
      ageYears: ageYears,
      ageMonths: ageMonths,
    });
    console.log("[incremental] queued segment upload q" + String(question.query_number || ""));
    expressionSegmentRecorderRef.current.clearLastBlob();
  }

  function releaseIncrementalCaptureResources() {
    if (getExpressionAudioMode() !== "incremental") return;
    if (expressionSegmentRecorderRef.current && expressionSegmentRecorderRef.current.cleanup) {
      expressionSegmentRecorderRef.current.cleanup();
    }
    if (typeof SessionRecorder !== "undefined" && SessionRecorder.releaseCaptureStream) {
      SessionRecorder.releaseCaptureStream();
    }
  }

  function reportIncrementalSegmentInterrupt(payload) {
    if (getExpressionAudioMode() !== "incremental") return;
    if (questionTypeRef.current !== "E") return;
    if (sessionCompletedRef.current) return;
    if (isPausedRef.current) return;
    if (showClappingAvatarRef.current) return;
    if (expressionEvalFrozenForIncrementalUploadRef.current) return;
    var idx = getSafeCurrentQuestionIndex();
    var q = questions[idx];
    if (!q || q.query_type !== "הבעה") return;
    var qn = String(q.query_number || "");
    if (payload && payload.questionNumber && String(payload.questionNumber) !== qn) return;
    var force = !!(payload && payload.force);
    var rec = expressionSegmentRecorderRef.current;
    var health =
      rec && typeof rec.checkHealth === "function" ? rec.checkHealth() : { ok: false };
    if (!force && health.ok) return;
    freezeExpressionEvalCountdown();
    setIncrementalSegmentInterrupt({
      questionNumber: qn,
      reason: (payload && payload.reason) || health.reason || "unknown",
    });
  }

  function isIncrementalExpressionInterruptBlocking() {
    return (
      !!incrementalSegmentInterrupt &&
      getExpressionAudioMode() === "incremental" &&
      questionType === "E" &&
      !sessionCompleted
    );
  }

  var reportIncrementalSegmentInterruptRef = React.useRef(reportIncrementalSegmentInterrupt);
  reportIncrementalSegmentInterruptRef.current = reportIncrementalSegmentInterrupt;

  function dismissIncrementalSegmentInterruptModal() {
    if (!incrementalSegmentInterrupt) return;
    var qn = incrementalSegmentInterrupt.questionNumber;
    var queue = expressionSegmentQueueRef.current;
    var uploadState =
      queue && queue.getQuestionUploadState
        ? queue.getQuestionUploadState(qn)
        : "none";
    if (uploadState !== "completed") return;
    setIncrementalSegmentInterrupt(null);
    setIncrementalRestartMicReady(false);
  }

  async function probeExpressionMicAvailable() {
    if (!permission || microphoneSkipped) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async function restartCurrentIncrementalExpressionQuestion() {
    if (getExpressionAudioMode() !== "incremental") return;
    if (questionType !== "E" || sessionCompleted) return;
    if (!(await probeExpressionMicAvailable())) return;
    var interrupt = incrementalSegmentInterrupt;
    var qn = interrupt && interrupt.questionNumber;
    if (!qn) return;
    var queue = expressionSegmentQueueRef.current;
    if (queue && queue.getQuestionUploadState(qn) === "completed") return;
    if (queue && queue.getQuestionUploadState(qn) === "in_flight") {
      await queue.waitForQuestionIdle(qn, 30000);
      if (queue.getQuestionUploadState(qn) === "completed") return;
    }
    if (queue && queue.cancelPendingForQuestion) {
      queue.cancelPendingForQuestion(qn);
    }
    var rows = dedupeQuestionResultsKeepLastAttempt(questionResults);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].questionNumber) === qn) {
        target = rows[i];
        break;
      }
    }
    if (target && target.result) {
      adjustCountsForResult(target.result, -1);
    }
    setQuestionResults(rows.filter(function (r) {
      return String(r.questionNumber) !== qn;
    }));
    expressionAnswerCaptureActiveRef.current = false;
    if (expressionSegmentRecorderRef.current && expressionSegmentRecorderRef.current.cleanup) {
      expressionSegmentRecorderRef.current.cleanup();
    }
    resetExpressionUiForNewCapture();
    clearExpressionEvalFreezeForIncrementalUpload();
    setIncrementalSegmentInterrupt(null);
    loadQuestion(getSafeCurrentQuestionIndex());
  }

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

  // Layout tier: match CSS phone band (max-width: 600px); used only for legacy minImgWidth (unused in render).
  const isMobile = React.useMemo(function () {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 600px)").matches;
  }, []);

  /** Phone-like image grids: golden ≤600px portrait, short-wide (1280×800), or tall desktop (1920×1080). */
  const usePhoneLikeGrid = React.useMemo(function () {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return (
      window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches ||
      window.matchMedia("(min-width: 721px) and (max-height: 860px)").matches ||
      window.matchMedia("(min-width: 900px) and (min-height: 861px)").matches
    );
  }, []);

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
    return TM.dedupeQuestionResultsKeepLastAttempt(results);
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

  function reconcileSessionScoreCountersFromResults(results) {
    var deduped = dedupeQuestionResultsKeepLastAttempt(results || []);
    var buckets = countBucketsFromResults(deduped);
    setCorrectAnswers(buckets.correct);
    setPartialAnswers(buckets.partly);
    setWrongAnswers(buckets.wrong);
    return buckets;
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
  const questionAudioCacheRef = React.useRef({});
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
    if (
      questionAudioMuted ||
      isPausedRef.current ||
      sessionCompletedRef.current ||
      awaitingExpressionMicCheckRef.current ||
      expressionIntroActiveRef.current
    ) {
      return;
    }
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
      if (
        questionAudioMuted ||
        isPausedRef.current ||
        sessionCompletedRef.current ||
        awaitingExpressionMicCheckRef.current ||
        expressionIntroActiveRef.current
      ) {
        return;
      }
      if (!audioEl || questionAudioRef.current !== audioEl) return;
      try {
        audioEl.currentTime = 0;
        var retryPlay = audioEl.play();
        if (retryPlay && typeof retryPlay.then === "function") {
          retryPlay.then(function () {
            setIsAudioPlaying(true);
            resetFirstQuestionRetryState();
          }).catch(function () {
            firstQuestionRetryAttemptRef.current = attempt + 1;
            scheduleFirstQuestionAutoRetry(audioEl, qn);
          });
        } else {
          setIsAudioPlaying(true);
          resetFirstQuestionRetryState();
        }
      } catch (e) {
        firstQuestionRetryAttemptRef.current = attempt + 1;
        scheduleFirstQuestionAutoRetry(audioEl, qn);
      }
    }, retryDelays[attempt]);
  }

  function stopAllQuestionPlayback() {
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
        tryAgainAudioRef.current.onended = null;
        tryAgainAudioRef.current.pause();
        tryAgainAudioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setQuestionAudio(function (prev) {
      if (prev) {
        try {
          prev.pause();
          prev.currentTime = 0;
        } catch (e) {}
      }
      return null;
    });
    setIsAudioPlaying(false);
  }

  function stopQuestionAudioForSessionComplete() {
    stopAllQuestionPlayback();
  }

  React.useEffect(function () {
    if (!sessionCompleted) return;
    stopAllQuestionPlayback();
  }, [sessionCompleted]);

  React.useEffect(function () {
    if (!awaitingExpressionMicCheck) return;
    stopAllQuestionPlayback();
  }, [awaitingExpressionMicCheck]);

  React.useEffect(function cleanupFirstQuestionRetryTimer() {
    return function () {
      if (firstQuestionRetryTimerRef.current) {
        clearTimeout(firstQuestionRetryTimerRef.current);
        firstQuestionRetryTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(function initIncrementalExpressionPipeline() {
    if (!window.MiliTestModules) return;
    if (window.MiliTestModules.createExpressionSegmentRecorder) {
      expressionSegmentRecorderRef.current = window.MiliTestModules.createExpressionSegmentRecorder();
      if (expressionSegmentRecorderRef.current.setOnInterrupted) {
        expressionSegmentRecorderRef.current.setOnInterrupted(function (payload) {
          if (reportIncrementalSegmentInterruptRef.current) {
            reportIncrementalSegmentInterruptRef.current(payload);
          }
        });
      }
    }
    if (window.MiliTestModules.createExpressionSegmentUploadQueue) {
      expressionSegmentQueueRef.current = window.MiliTestModules.createExpressionSegmentUploadQueue({
        prepareSegmentUpload: prepareSegmentUpload,
        registerExpressionSegment: registerExpressionSegment,
        putSessionAudioToBlob: putSessionAudioToBlob,
      });
    }
    return function () {
      if (expressionSegmentRecorderRef.current && expressionSegmentRecorderRef.current.cleanup) {
        expressionSegmentRecorderRef.current.cleanup();
      }
    };
  }, []);

  React.useEffect(function incrementalSegmentHealthPoll() {
    if (getExpressionAudioMode() !== "incremental") return;
    if (!expressionEvalArmed) return;
    var timerId = setInterval(function () {
      if (questionTypeRef.current !== "E") return;
      if (sessionCompletedRef.current || isPausedRef.current || showClappingAvatarRef.current) return;
      if (expressionEvalFrozenForIncrementalUploadRef.current) return;
      var rec = expressionSegmentRecorderRef.current;
      if (!rec || !rec.isExpectingActiveCapture || !rec.isExpectingActiveCapture()) return;
      var health = rec.checkHealth();
      if (!health.ok && reportIncrementalSegmentInterruptRef.current) {
        reportIncrementalSegmentInterruptRef.current({ reason: health.reason });
      }
    }, 2000);
    return function () {
      clearInterval(timerId);
    };
  }, [expressionEvalArmed, sessionCompleted, isPaused, showClappingAvatar]);

  React.useEffect(function pollMicForIncrementalInterruptRestart() {
    if (!incrementalSegmentInterrupt) {
      setIncrementalRestartMicReady(false);
      setIncrementalInterruptUploadState("none");
      return;
    }
    if (getExpressionAudioMode() !== "incremental") return;
    var cancelled = false;
    var qn = incrementalSegmentInterrupt.questionNumber;
    function pollInterruptRecovery() {
      probeExpressionMicAvailable().then(function (ok) {
        if (!cancelled) setIncrementalRestartMicReady(!!ok);
      });
      var queue = expressionSegmentQueueRef.current;
      if (queue && queue.getQuestionUploadState && qn) {
        var st = queue.getQuestionUploadState(qn);
        if (!cancelled) {
          setIncrementalInterruptUploadState(function (prev) {
            return prev === st ? prev : st;
          });
        }
      }
    }
    pollInterruptRecovery();
    var timerId = setInterval(pollInterruptRecovery, 1500);
    return function () {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [incrementalSegmentInterrupt, permission, microphoneSkipped]);

  // Report current test phase to App so it can show top navbar on age/mic screens
  React.useEffect(function () {
    if (!onTestPhase) return;
    var phase =
      !ageConfirmed && !ageInvalid
        ? "age"
        : ageInvalid
          ? "ageInvalid"
          : sessionCompleted
                ? "complete"
                : awaitingExpressionMicCheck && permission && !microphoneSkipped && !micCheckPassed
                  ? "mic"
                  : voiceIdentifierConfirmed && !comprIntroVideoComplete
                    ? "compIntro"
                    : !expIntroVideoComplete &&
                        pendingExpressionIntroIndex >= 0 &&
                        (micCheckPassed || microphoneSkipped)
                      ? "expIntro"
                      : "questions";
    onTestPhase(phase);
  }, [
    onTestPhase,
    ageConfirmed,
    ageInvalid,
    permission,
    microphoneSkipped,
    voiceIdentifierConfirmed,
    awaitingExpressionMicCheck,
    micCheckPassed,
    comprIntroVideoComplete,
    expIntroVideoComplete,
    pendingExpressionIntroIndex,
    sessionCompleted,
  ]);


  /** Start session MP3 when expression prompt audio begins (not on navigation). */
  function prepareExpressionRecordingBeforeQuestionAudio() {
    var idx = getSafeCurrentQuestionIndex();
    var q = questions[idx];
    if (!q || q.query_type !== "הבעה") return Promise.resolve(false);
    if (!permission || !voiceIdentifierConfirmed) return Promise.resolve(false);
    return ensureExpressionPhaseRecording();
  }

  /** Mark answer window start after prompt audio ends; recording must already be running. */
  async function markExpressionTimestampAndArm(q) {
    if (!q || q.query_type !== "הבעה") return;
    var qNum = String(q.query_number || "");
    if (!qNum) return;
    if (expressionEvalArmedQuestionRef.current === qNum) return;

    clearExpressionAnswerEndTimer();

    if (
      getExpressionAudioMode() === "incremental" &&
      permission &&
      !microphoneSkipped
    ) {
      if (!(await probeExpressionMicAvailable())) {
        reportIncrementalSegmentInterrupt({
          questionNumber: qNum,
          reason: "mic_unavailable_at_arm",
          force: true,
        });
        return;
      }
    }

    if (permission && voiceIdentifierConfirmed && SessionRecorder && SessionRecorder.markQuestionStart) {
      SessionRecorder.markQuestionStart(q.query_number);
    }
    expressionEvalArmedQuestionRef.current = qNum;
    setExpressionEvalArmed(true);
    try {
      await beginExpressionAnswerRecordingCapture();
      if (getExpressionAudioMode() === "incremental") {
        var rec = expressionSegmentRecorderRef.current;
        var health =
          rec && typeof rec.checkHealth === "function" ? rec.checkHealth() : { ok: true };
        if (!health.ok) {
          reportIncrementalSegmentInterrupt({
            questionNumber: qNum,
            reason: health.reason || "segment_unhealthy_at_arm",
            force: true,
          });
        }
      }
    } catch (e) {
      if (getExpressionAudioMode() === "incremental") {
        reportIncrementalSegmentInterrupt({
          questionNumber: qNum,
          reason: "segment_start_failed",
          force: true,
        });
      }
    }
  }

  // Expression evaluation timer - opens traffic evaluation after 20 seconds.
  React.useEffect(function () {
    if (sessionCompleted || questionType !== "E" || !expressionEvalArmed) {
      clearExpressionEvalEnableTimer();
      clearExpressionAnswerEndTimer();
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
    var armedIdx = getSafeCurrentQuestionIndex();
    var armedQ = questions[armedIdx];
    if (!isPaused && !showClappingAvatar && !incompleteSummaryConfirmOpen) {
      expressionEvalDeadlineRef.current = Date.now() + EXPRESSION_EVAL_DELAY_MS;
      scheduleExpressionEvalEnable(EXPRESSION_EVAL_DELAY_MS);
      if (armedQ && armedQ.query_type === "הבעה") {
        scheduleExpressionAnswerEndMark(armedQ, EXPRESSION_EVAL_DELAY_MS);
      }
    } else {
      expressionEvalDeadlineRef.current = null;
      clearExpressionEvalEnableTimer();
      clearExpressionAnswerEndTimer();
    }

    return function () {
      clearExpressionEvalEnableTimer();
      clearExpressionAnswerEndTimer();
    };
  }, [currentIndex, questionType, sessionCompleted, expressionEvalArmed, questions]);

  React.useEffect(function pauseAwareExpressionTimer() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled) return;
    if (incrementalSegmentInterrupt) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (expressionEvalFrozenForIncrementalUploadRef.current) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (incompleteSummaryConfirmOpen) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (isPaused) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (!expressionEvalDeadlineRef.current) {
      resumeExpressionEvalCountdown();
    }
  }, [isPaused, sessionCompleted, questionType, evaluationEnabled, incompleteSummaryConfirmOpen, incrementalSegmentInterrupt]);

  /** Freeze expression traffic countdown while streak clapping overlay is up. */
  React.useEffect(function pauseExpressionEvalDuringClappingAvatar() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || !expressionEvalArmed) return;
    if (incrementalSegmentInterrupt) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (expressionEvalFrozenForIncrementalUploadRef.current) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (showClappingAvatar) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (isPaused || incompleteSummaryConfirmOpen) {
      return;
    }
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
    incompleteSummaryConfirmOpen,
    incrementalSegmentInterrupt,
  ]);

  /** Freeze countdown while Finish / incomplete-summary gate is open. */
  React.useEffect(function pauseExpressionEvalDuringFinishFlow() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || !expressionEvalArmed) return;
    if (incrementalSegmentInterrupt) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (expressionEvalFrozenForIncrementalUploadRef.current) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (incompleteSummaryConfirmOpen) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (isPaused || showClappingAvatar) {
      return;
    }
    if (!expressionEvalDeadlineRef.current) {
      resumeExpressionEvalCountdown();
    }
  }, [
    incompleteSummaryConfirmOpen,
    isPaused,
    showClappingAvatar,
    sessionCompleted,
    questionType,
    evaluationEnabled,
    expressionEvalArmed,
    incrementalSegmentInterrupt,
  ]);

  React.useEffect(function tickExpressionEvalCountdown() {
    if (
      sessionCompleted ||
      questionType !== "E" ||
      !expressionEvalArmed ||
      evaluationEnabled ||
      isPaused ||
      showClappingAvatar ||
      incompleteSummaryConfirmOpen ||
      incrementalSegmentInterrupt ||
      expressionEvalFrozenForIncrementalUploadRef.current ||
      !expressionEvalDeadlineRef.current
    ) {
      return;
    }
    const intervalId = setInterval(function () {
      if (expressionEvalFrozenForIncrementalUploadRef.current) {
        return;
      }
      if (!expressionEvalDeadlineRef.current) {
        setExpressionEvalMsLeft(0);
        return;
      }
      const next = Math.max(0, expressionEvalDeadlineRef.current - Date.now());
      setExpressionEvalMsLeft(next);
    }, 100);

    return function () {
      clearInterval(intervalId);
    };
  }, [
    currentIndex,
    questionType,
    sessionCompleted,
    expressionEvalArmed,
    evaluationEnabled,
    isPaused,
    showClappingAvatar,
    incompleteSummaryConfirmOpen,
    incrementalSegmentInterrupt,
  ]);

  React.useEffect(function clearIncrementalUploadEvalFreezeOnQuestionChange() {
    clearExpressionEvalFreezeForIncrementalUpload();
  }, [currentIndex]);

  React.useEffect(function clearIncrementalUploadEvalFreezeOnSessionComplete() {
    if (sessionCompleted) {
      clearExpressionEvalFreezeForIncrementalUpload();
    }
  }, [sessionCompleted]);

  React.useEffect(function armExpressionTimerWhenQuestionAudioUnavailable() {
    if (sessionCompleted || questionType !== "E" || expressionEvalArmed) return;
    if (!questionAudioMuted) return;
    var idx = getSafeCurrentQuestionIndex();
    var q = questions[idx];
    if (!q || q.query_type !== "הבעה") return;
    prepareExpressionRecordingBeforeQuestionAudio()
      .then(function () {
        markExpressionTimestampAndArm(q);
      })
      .catch(function () {
        markExpressionTimestampAndArm(q);
      });
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
    return TM.totalMonths(ageYears, ageMonths);
  }

  function deriveAgeFromDob(dobValue) {
    return TM.deriveAgeFromDob(dobValue);
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
    return TM.getQuestionTypeLabel(q);
  }

  function findFirstExpressionQuestionIndex() {
    return TM.findFirstExpressionQuestionIndex(questions);
  }

  function isOnExpressionPhaseByIndex(idx) {
    return TM.isOnExpressionPhaseByIndex(idx, questions);
  }

  function tryGateExpressionMicCheckBeforeNavigatingTo(targetIdx) {
    var api = ensureMicIntro();
    return api ? api.tryGateExpressionMicCheckBeforeNavigatingTo(targetIdx) : false;
  }
  function beginExpressionIntroBeforeIndex(targetIdx) {
    var api = ensureMicIntro();
    return api ? api.beginExpressionIntroBeforeIndex(targetIdx) : false;
  }
  function tryDeferExpressionIntroBeforeNavigatingTo(targetIdx) {
    var api = ensureMicIntro();
    return api ? api.tryDeferExpressionIntroBeforeNavigatingTo(targetIdx) : false;
  }
  function continueFromExpressionMicCheck() {
    var api = ensureMicIntro();
    if (api) api.continueFromExpressionMicCheck();
  }
  function finishExpressionIntroVideo() {
    var api = ensureMicIntro();
    if (api) api.finishExpressionIntroVideo();
  }
  async function ensureExpressionPhaseRecording() {
    var api = ensureMicIntro();
    return api ? api.ensureExpressionPhaseRecording() : false;
  }

  function ageValueFromPart(part) {
    return TM.ageValueFromPart(part);
  }

  function formatAgePartCompact(part) {
    return TM.formatAgePartCompact(part);
  }

  function formatQuestionAgeBadge(ageGroup) {
    return TM.formatQuestionAgeBadge(ageGroup);
  }

  function parseAgeTokenToMonths(token) {
    return TM.parseAgeTokenToMonths(token);
  }

  function getAgeGroupStartMonths(ageGroup) {
    return TM.getAgeGroupStartMonths(ageGroup);
  }

  function shouldApplyAdaptiveWrongLogic(questionObj) {
    return TM.shouldApplyAdaptiveWrongLogic(questionObj, totalMonths());
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
    setAwaitingExpressionMicCheck(false);
    setComprIntroVideoComplete(false);
    setExpIntroVideoComplete(false);
    setPendingExpressionIntroIndex(-1);
    pendingFirstExpressionIndexRef.current = null;
    const internalUserId = ensureInternalUserId();

    function unlockTestSessionForQuestions() {
      setSessionRecordingStarted(false);
      setVoiceIdentifierConfirmed(true);
      try {
        localStorage.removeItem("readingValidated");
        localStorage.removeItem("readingValidationResult");
        localStorage.removeItem("readingRecordingBlob");
        if (typeof ensurePendingTestId === "function") {
          ensurePendingTestId();
        } else if (window.MiliTestSession && window.MiliTestSession.resetPendingTestId) {
          window.MiliTestSession.resetPendingTestId();
        }
      } catch (e) {}
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

    unlockTestSessionForQuestions();
    setAgeConfirmed(true);
    var phoneForApi = null;
    try {
      var storedPhone = JSON.parse(localStorage.getItem("parentPhone") || "\"\"");
      if (storedPhone && String(storedPhone).trim()) phoneForApi = String(storedPhone).trim();
    } catch (e) {}
    createUser(internalUserId, String(childName).trim() || "SomeUserName", phoneForApi);
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
    setMicrophoneSkipped(true);
    setMicCheckPassed(true);
    setMicCheckReady(false);
    setVoiceIdentifierConfirmed(true);
    setSessionRecordingStarted(false);
  };

  React.useEffect(function unlockTestSessionWhenAgeAndMicReady() {
    if (!ageConfirmed || sessionCompleted) return;
    if ((permission || microphoneSkipped) && !voiceIdentifierConfirmed) {
      setVoiceIdentifierConfirmed(true);
    }
  }, [ageConfirmed, sessionCompleted, permission, microphoneSkipped, voiceIdentifierConfirmed]);

  // Expression only: open traffic popup after 20s (evaluationEnabled) or when showContinue triggers it
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

  React.useEffect(function syncExpressionAnswerRecordingCaptureEffect() {
    syncExpressionAnswerRecordingCapture();
  }, [
    questionType,
    expressionEvalArmed,
    evaluationEnabled,
    isPaused,
    showClappingAvatar,
    sessionCompleted,
    sessionRecordingStarted,
    permission,
    currentIndex,
  ]);

  React.useEffect(function registerSessionRecordingMaxDuration() {
    if (typeof SessionRecorder === "undefined" || !SessionRecorder.setOnMaxDurationReached) {
      return undefined;
    }
    SessionRecorder.setOnMaxDurationReached(function () {
      console.warn("Recording stopped: maximum session audio length (12:30) reached.");
      if (SessionRecorder.pauseRecordingIfActive) {
        SessionRecorder.pauseRecordingIfActive();
      }
    });
    return function () {
      SessionRecorder.setOnMaxDurationReached(null);
    };
  }, []);

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

  var sessionFinishCtxRef = React.useRef({});
  var sessionFinishRef = React.useRef(null);
  function ensureSessionFinish() {
    if (!sessionFinishRef.current && TM.createSessionFinish) {
      sessionFinishRef.current = TM.createSessionFinish(function () {
        return sessionFinishCtxRef.current;
      });
    }
    return sessionFinishRef.current;
  }

  var pauseAfkCtxRef = React.useRef({});
  var pauseAfkRef = React.useRef(null);
  function ensurePauseAfk() {
    if (!pauseAfkRef.current && TM.createPauseAfk) {
      pauseAfkRef.current = TM.createPauseAfk(function () {
        return pauseAfkCtxRef.current;
      });
    }
    return pauseAfkRef.current;
  }

  var questionFlowCtxRef = React.useRef({});
  var questionFlowRef = React.useRef(null);
  function ensureQuestionFlow() {
    if (!questionFlowRef.current && TM.createQuestionFlow) {
      questionFlowRef.current = TM.createQuestionFlow(function () {
        return questionFlowCtxRef.current;
      });
    }
    return questionFlowRef.current;
  }

  var scoringCtxRef = React.useRef({});
  var scoringRef = React.useRef(null);
  function ensureTestScoring() {
    if (!scoringRef.current && TM.createTestScoring) {
      scoringRef.current = TM.createTestScoring(function () {
        return scoringCtxRef.current;
      });
    }
    return scoringRef.current;
  }
  function playTrafficFeedback(result) {
    var api = ensureTestScoring();
    if (api) api.playTrafficFeedback(result);
  }
  function handleClick(img, event) {
    var api = ensureTestScoring();
    if (api) api.handleClick(img, event);
  }
  function handleContinue(result) {
    var api = ensureTestScoring();
    if (api) api.handleContinue(result);
  }

  function handleTrafficPopupChoice(result) {
    var api = ensurePauseAfk();
    if (api) api.handleTrafficPopupChoice(result);
  }

  var overlaysCtxRef = React.useRef({});
  var overlaysRef = React.useRef(null);
  function ensureTestOverlays() {
    if (!overlaysRef.current && TM.createTestOverlays) {
      overlaysRef.current = TM.createTestOverlays(function () {
        return overlaysCtxRef.current;
      });
    }
    return overlaysRef.current;
  }

  var questionRenderCtxRef = React.useRef({});
  var questionRenderRef = React.useRef(null);
  function ensureTestQuestionRender() {
    if (!questionRenderRef.current && TM.createTestQuestionRender) {
      questionRenderRef.current = TM.createTestQuestionRender(function () {
        return questionRenderCtxRef.current;
      });
    }
    return questionRenderRef.current;
  }

  var summaryRenderCtxRef = React.useRef({});
  var summaryRenderRef = React.useRef(null);
  function ensureTestSummaryRender() {
    if (!summaryRenderRef.current && TM.createTestSummaryRender) {
      summaryRenderRef.current = TM.createTestSummaryRender(function () {
        return summaryRenderCtxRef.current;
      });
    }
    return summaryRenderRef.current;
  }

  var startScreensCtxRef = React.useRef({});
  var startScreensRef = React.useRef(null);
  function ensureTestStartScreens() {
    if (!startScreensRef.current && TM.createTestStartScreens) {
      startScreensRef.current = TM.createTestStartScreens(function () {
        return startScreensCtxRef.current;
      });
    }
    return startScreensRef.current;
  }
  function tryRenderStartScreen() {
    var api = ensureTestStartScreens();
    return api ? api.tryRenderStartScreen() : null;
  }

  function finishComprehensionIntroVideo() {
    setComprIntroVideoComplete(true);
    firstQuestionMicGateArmedRef.current = true;
    resetFirstQuestionRetryState();
  }

  var comprIntroVideoSources = React.useMemo(function () {
    return resolveAvatarIntroVideoSources(
      AVATAR_INTRO_VIDEO.compr.webm,
      AVATAR_INTRO_VIDEO.compr.mp4Fallback
    );
  }, []);

  var expIntroVideoSources = React.useMemo(function () {
    return resolveAvatarIntroVideoSources(
      AVATAR_INTRO_VIDEO.exp.webm,
      AVATAR_INTRO_VIDEO.exp.mp4Fallback
    );
  }, []);

  function handleComprIntroVideoError() {
    switchAvatarIntroVideoToMp4Fallback(
      comprIntroVideoRef.current,
      AVATAR_INTRO_VIDEO.compr.mp4Fallback,
      finishComprehensionIntroVideo
    );
  }

  function handleExpIntroVideoError() {
    switchAvatarIntroVideoToMp4Fallback(
      expIntroVideoRef.current,
      AVATAR_INTRO_VIDEO.exp.mp4Fallback,
      finishExpressionIntroVideo
    );
  }

  React.useEffect(function applyWelcomeFreshTestEntry() {
    if (!ageConfirmed || sessionCompleted) return;
    if (!forceFreshStartAfterMicCheck) return;
    if (
      window.MiliTestRun &&
      typeof window.MiliTestRun.hasInProgressTestState === "function" &&
      window.MiliTestRun.hasInProgressTestState()
    ) {
      setForceFreshStartAfterMicCheck(false);
      return;
    }
    if (window.MiliTestSession && window.MiliTestSession.beginNewTestSessionIdentity) {
      window.MiliTestSession.beginNewTestSessionIdentity();
    }
    setLastCompletedTestId(null);
    setExpressionAiResult(null);
    setExpressionAiPollError(null);
    expressionAiPollStartedRef.current = null;
    resetFreshTestRunReactState();
    applyWelcomeDirectToFirstQuestion();
    var idx = parseInt(String(currentIndex || "0"), 10);
    if (!Number.isFinite(idx) || idx !== 0) {
      setCurrentIndex(0);
    }
  }, [ageConfirmed, sessionCompleted, forceFreshStartAfterMicCheck]);

  React.useEffect(function clearOrphanExpressionMicGate() {
    if (!awaitingExpressionMicCheck || micCheckPassed || microphoneSkipped || !permission) return;
    if (forceFreshStartAfterMicCheck) {
      setAwaitingExpressionMicCheck(false);
      return;
    }
    if (!isExpressionMicCheckGateActive()) {
      setAwaitingExpressionMicCheck(false);
    }
  }, [
    awaitingExpressionMicCheck,
    micCheckPassed,
    microphoneSkipped,
    permission,
    forceFreshStartAfterMicCheck,
    currentIndex,
    questions.length,
  ]);

  React.useEffect(function resumeExpressionMicGateAfterRefresh() {
    if (sessionCompleted || !voiceIdentifierConfirmed || !questions.length) return;
    if (forceFreshStartAfterMicCheck) return;
    if (micCheckPassed || microphoneSkipped || !permission) return;
    if (awaitingExpressionMicCheck) return;
    if (pendingExpressionIntroIndex >= 0) return;
    var idx = getSafeCurrentQuestionIndex();
    var firstExpr = findFirstExpressionQuestionIndex();
    if (firstExpr < 0 || idx < firstExpr || !isOnExpressionPhaseByIndex(idx)) return;
    var results = readPersistedJson("questionResults", []);
    if (!Array.isArray(results) || results.length === 0) return;
    pendingFirstExpressionIndexRef.current = idx;
    setAwaitingExpressionMicCheck(true);
  }, [
    sessionCompleted,
    voiceIdentifierConfirmed,
    questions.length,
    currentIndex,
    micCheckPassed,
    microphoneSkipped,
    permission,
    awaitingExpressionMicCheck,
    pendingExpressionIntroIndex,
    forceFreshStartAfterMicCheck,
  ]);

  React.useEffect(function resumeExpIntroAfterRefresh() {
    if (sessionCompleted || expIntroVideoComplete) return;
    if (!micCheckPassed && !microphoneSkipped) return;
    var idx = getSafeCurrentQuestionIndex();
    if (isOnExpressionPhaseByIndex(idx)) {
      beginExpressionIntroBeforeIndex(idx);
      return;
    }
    if (pendingExpressionIntroIndex >= 0) {
      pendingFirstExpressionIndexRef.current = pendingExpressionIntroIndex;
    }
  }, [
    sessionCompleted,
    expIntroVideoComplete,
    micCheckPassed,
    microphoneSkipped,
    questions.length,
    currentIndex,
    pendingExpressionIntroIndex,
  ]);

  React.useEffect(function tryAutoplayExpIntroVideo() {
    if (sessionCompleted || expIntroVideoComplete || pendingExpressionIntroIndex < 0) return;
    if (!(micCheckPassed || microphoneSkipped)) return;
    var el = expIntroVideoRef.current;
    if (!el) return;
    expIntroAutoplayBlockedRef.current = false;
    var p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        expIntroAutoplayBlockedRef.current = true;
      });
    }
  }, [
    sessionCompleted,
    expIntroVideoComplete,
    pendingExpressionIntroIndex,
    micCheckPassed,
    microphoneSkipped,
  ]);

  React.useEffect(function retryExpIntroVideoOnFirstInteraction() {
    if (sessionCompleted || expIntroVideoComplete || pendingExpressionIntroIndex < 0) return;
    if (!(micCheckPassed || microphoneSkipped)) return;
    function tryStart() {
      if (!expIntroAutoplayBlockedRef.current) return;
      var el = expIntroVideoRef.current;
      if (!el) return;
      var p = el.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          expIntroAutoplayBlockedRef.current = false;
        }).catch(function () {});
      }
    }
    document.addEventListener("pointerdown", tryStart, { passive: true });
    document.addEventListener("touchstart", tryStart, { passive: true });
    return function () {
      document.removeEventListener("pointerdown", tryStart);
      document.removeEventListener("touchstart", tryStart);
    };
  }, [
    sessionCompleted,
    expIntroVideoComplete,
    pendingExpressionIntroIndex,
    micCheckPassed,
    microphoneSkipped,
  ]);

  React.useEffect(function tryAutoplayComprIntroVideo() {
    if (!voiceIdentifierConfirmed || comprIntroVideoComplete || sessionCompleted) return;
    var el = comprIntroVideoRef.current;
    if (!el) return;
    comprIntroAutoplayBlockedRef.current = false;
    var p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        comprIntroAutoplayBlockedRef.current = true;
      });
    }
  }, [voiceIdentifierConfirmed, comprIntroVideoComplete, sessionCompleted]);

  React.useEffect(function retryComprIntroVideoOnFirstInteraction() {
    if (!voiceIdentifierConfirmed || comprIntroVideoComplete || sessionCompleted) return;
    function tryStart() {
      if (!comprIntroAutoplayBlockedRef.current) return;
      var el = comprIntroVideoRef.current;
      if (!el) return;
      var p = el.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          comprIntroAutoplayBlockedRef.current = false;
        }).catch(function () {});
      }
    }
    document.addEventListener("pointerdown", tryStart, { passive: true });
    document.addEventListener("touchstart", tryStart, { passive: true });
    return function () {
      document.removeEventListener("pointerdown", tryStart);
      document.removeEventListener("touchstart", tryStart);
    };
  }, [voiceIdentifierConfirmed, comprIntroVideoComplete, sessionCompleted]);

  // Start AFK timer when test begins
  React.useEffect(function () {
    if (voiceIdentifierConfirmed && comprIntroVideoComplete && !isPaused && !sessionCompleted) {
      resetAfkTimer();
    }

    // Cleanup timers on unmount
    return function () {
      stopAfkTimer();
    };
  }, [voiceIdentifierConfirmed, comprIntroVideoComplete]);

  // Reset AFK timer when loading a new question
  React.useEffect(function () {
    if (voiceIdentifierConfirmed && comprIntroVideoComplete && !isPaused && !sessionCompleted) {
      resetAfkTimer();
    }
  }, [currentIndex, comprIntroVideoComplete]);

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

  const playQuestionAudio = function (opts) {
    opts = opts || {};
    var isReplayPlayback = !!(opts && opts.isReplay);
    if (
      awaitingExpressionMicCheckRef.current ||
      expressionIntroActiveRef.current ||
      sessionCompletedRef.current
    ) {
      return;
    }
    if (!questionAudio || questionAudioMuted) return;
    var audioEl = questionAudio;
    prepareExpressionRecordingBeforeQuestionAudio()
      .then(function () {
        if (!audioEl) return;
        if (!isReplayPlayback) {
          try {
            var pIdx = getSafeCurrentQuestionIndex();
            var pq = questions[pIdx];
            if (
              pq &&
              pq.query_type === "הבעה" &&
              expressionPhaseRecordingStartedRef.current &&
              typeof SessionRecorder !== "undefined" &&
              SessionRecorder.pauseRecordingIfActive
            ) {
              SessionRecorder.pauseRecordingIfActive();
            }
          } catch (ePQ) {}
        }
        audioEl.currentTime = 0;
        audioEl.play().catch(function (err) {
          console.warn("Question audio play failed:", err);
        });
        setIsAudioPlaying(true);
      })
      .catch(function (e) {
        console.error("playQuestionAudio:", e);
        if (!isReplayPlayback) {
          try {
            var pIdx2 = getSafeCurrentQuestionIndex();
            var pq2 = questions[pIdx2];
            if (
              pq2 &&
              pq2.query_type === "הבעה" &&
              expressionPhaseRecordingStartedRef.current &&
              typeof SessionRecorder !== "undefined" &&
              SessionRecorder.pauseRecordingIfActive
            ) {
              SessionRecorder.pauseRecordingIfActive();
            }
          } catch (ePQ2) {}
        }
        audioEl.currentTime = 0;
        audioEl.play().catch(function () {});
        setIsAudioPlaying(true);
      });
  };

  const replayQuestionAudio = function () {
    playQuestionAudio({ isReplay: true });
  };

  const TRY_AGAIN_AUDIO_SRC = "resources/questions_audio/try_again.mp3";

  const playTryAgainAudio = function () {
    if (
      awaitingExpressionMicCheckRef.current ||
      expressionIntroActiveRef.current ||
      sessionCompletedRef.current
    ) {
      return;
    }
    if (questionAudioMuted) return;
    try {
      if (!tryAgainAudioRef.current) {
        tryAgainAudioRef.current = new Audio(TRY_AGAIN_AUDIO_SRC);
      }
      const a = tryAgainAudioRef.current;
      if (!a.src || a.src.indexOf("try_again.mp3") === -1) {
        a.src = TRY_AGAIN_AUDIO_SRC;
      }
      var replayQuestionIdx = getCurrentQuestionIndex();
      a.onended = function () {
        if (
          questionAudioMuted ||
          isPausedRef.current ||
          sessionCompletedRef.current ||
          awaitingExpressionMicCheckRef.current ||
          expressionIntroActiveRef.current
        ) {
          return;
        }
        if (getCurrentQuestionIndex() !== replayQuestionIdx) return;
        if (questionType !== "C" && questionType !== "E") return;
        replayQuestionAudio();
      };
      a.currentTime = 0;
      a.play().catch(function () {
        // If try-again fails to play (autoplay policy, decode issue), still attempt immediate question replay.
        if (
          !questionAudioMuted &&
          !isPausedRef.current &&
          !sessionCompletedRef.current &&
          !awaitingExpressionMicCheckRef.current &&
          !expressionIntroActiveRef.current
        ) {
          replayQuestionAudio();
        }
      });
    } catch (e) {}
  };

  React.useEffect(function autoplayQuestionAudioAfterImagesReady() {
    if (sessionCompleted || awaitingExpressionMicCheck || expressionIntroActiveRef.current || !ageConfirmed) return;
    if (!currentQuestionImagesLoaded) return;
    if (!questionAudioAutoplayPendingRef.current) return;
    if (!comprIntroVideoComplete) return;
    if (pendingExpressionIntroIndex >= 0) return;
    if (!expIntroVideoComplete && isOnExpressionPhaseByIndex(getSafeCurrentQuestionIndex())) return;
    if (!micCheckPassed && isOnExpressionPhaseByIndex(getSafeCurrentQuestionIndex())) return;
    if (questionAudioMuted) return;
    if (!(permission || microphoneSkipped) || !voiceIdentifierConfirmed) return;
    if (!questionAudio) return;

    questionAudioAutoplayPendingRef.current = false;

    var audioEl = questionAudio;
    var currentIdxForAutoplay = getSafeCurrentQuestionIndex();
    var currentQuestion = questions[currentIdxForAutoplay];
    var firstExprIdxForAutoplay = findFirstExpressionQuestionIndex();
    var isFirstQuestionAutoplay = currentIdxForAutoplay === 0;
    var isFirstExpressionAutoplay =
      firstExprIdxForAutoplay >= 0 && currentIdxForAutoplay === firstExprIdxForAutoplay;
    var currentQuestionNumber = currentQuestion ? String(currentQuestion.query_number || "") : "";
    function runPlay() {
      if (questionAudioMuted) return;
      function startPlayback() {
        try {
          try {
            var apIdx = getSafeCurrentQuestionIndex();
            var apQ = questions[apIdx];
            if (
              apQ &&
              apQ.query_type === "הבעה" &&
              expressionPhaseRecordingStartedRef.current &&
              typeof SessionRecorder !== "undefined" &&
              SessionRecorder.pauseRecordingIfActive
            ) {
              SessionRecorder.pauseRecordingIfActive();
            }
          } catch (eAp) {}
          audioEl.currentTime = 0;
          audioEl.play().catch(function (err) {
            console.warn("Audio autoplay failed:", err);
            if (isFirstQuestionAutoplay) {
              scheduleFirstQuestionAutoRetry(audioEl, currentQuestionNumber);
            }
          });
          setIsAudioPlaying(true);
        } catch (e) {
          console.warn("Audio play error:", e);
          if (isFirstQuestionAutoplay) {
            scheduleFirstQuestionAutoRetry(audioEl, currentQuestionNumber);
          }
        }
      }
      prepareExpressionRecordingBeforeQuestionAudio()
        .then(startPlayback)
        .catch(function (e) {
          console.error("autoplay prepareExpressionRecording:", e);
          startPlayback();
        });
    }

    if (
      (isFirstQuestionAutoplay || isFirstExpressionAutoplay) &&
      firstQuestionMicGateArmedRef.current
    ) {
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
    comprIntroVideoComplete,
    expIntroVideoComplete,
    pendingExpressionIntroIndex,
    questionAudioMuted,
    voiceIdentifierConfirmed,
    permission,
    microphoneSkipped,
    sessionCompleted,
    awaitingExpressionMicCheck,
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

  const pauseTest = function () {
    var api = ensurePauseAfk();
    if (api) api.pauseTest();
  };
  const resumeTest = async function () {
    var api = ensurePauseAfk();
    if (api) await api.resumeTest();
    checkExpressionRecordingHealth();
  };

  function checkExpressionRecordingHealth() {
    if (!sessionRecordingStartedRef.current || sessionCompletedRef.current) return;
    if (
      getExpressionAudioMode() === "incremental" &&
      incrementalSegmentInterrupt
    ) {
      return;
    }
    if (typeof SessionRecorder === "undefined" || !SessionRecorder.checkRecordingHealth) return;
    var health = SessionRecorder.checkRecordingHealth();
    if (health && health.ok === false) {
      setRecordingInterruptedBannerOpen(true);
    }
  }

  function dismissRecordingInterruptedBanner() {
    setRecordingInterruptedBannerOpen(false);
  }

  const checkExpressionRecordingHealthRef = React.useRef(checkExpressionRecordingHealth);
  checkExpressionRecordingHealthRef.current = checkExpressionRecordingHealth;

  React.useEffect(function bindRecordingInterruptedCallback() {
    if (typeof SessionRecorder === "undefined" || !SessionRecorder.setOnRecordingInterrupted) {
      return;
    }
    SessionRecorder.setOnRecordingInterrupted(function () {
      if (
        getExpressionAudioMode() === "incremental" &&
        questionTypeRef.current === "E" &&
        !sessionCompletedRef.current
      ) {
        return;
      }
      setRecordingInterruptedBannerOpen(true);
    });
    return function () {
      SessionRecorder.setOnRecordingInterrupted(null);
    };
  }, []);

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
        if (
          getExpressionAudioMode() === "incremental" &&
          questionTypeRef.current === "E" &&
          !sessionCompletedRef.current &&
          expressionSegmentRecorderRef.current &&
          typeof expressionSegmentRecorderRef.current.checkHealth === "function"
        ) {
          var segHealth = expressionSegmentRecorderRef.current.checkHealth();
          if (!segHealth.ok && reportIncrementalSegmentInterruptRef.current) {
            reportIncrementalSegmentInterruptRef.current({ reason: segHealth.reason });
          }
        }
        if (sessionRecordingStartedRef.current && !sessionCompletedRef.current) {
          checkExpressionRecordingHealthRef.current();
        }
        if (!pausedRecordingForVisibilityOnlyRef.current) return;
        pausedRecordingForVisibilityOnlyRef.current = false;
        if (sessionCompletedRef.current) return;
        if (isPausedRef.current) return;
        try {
          if (typeof SessionRecorder !== "undefined" && SessionRecorder.resumeRecording) {
            SessionRecorder.resumeRecording()
              .catch(function () {})
              .then(function () {
                checkExpressionRecordingHealthRef.current();
              });
          }
        } catch (e) {}
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return function () {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const resetAfkTimer = function () {
    var api = ensurePauseAfk();
    if (api) api.resetAfkTimer();
  };
  const stopAfkTimer = function () {
    var api = ensurePauseAfk();
    if (api) api.stopAfkTimer();
  };
  const handleAfkResponse = function () {
    var api = ensurePauseAfk();
    if (api) api.handleAfkResponse();
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
    return TM.countUniqueQuestionsAnswered(rows || questionResults);
  }

  function countAnsweredByType(rows, typeLabel) {
    return TM.countAnsweredByType(rows || questionResults, typeLabel, questions);
  }

  function countQuestionsByType(typeLabel) {
    return TM.countQuestionsByType(typeLabel, questions);
  }

  function isNavigationReload() {
    try {
      var nav = performance.getEntriesByType("navigation")[0];
      if (nav && (nav.type === "reload" || nav.type === "back_forward")) return true;
    } catch (e) {}
    try {
      if (performance.navigation && performance.navigation.type === 1) return true;
    } catch (e2) {}
    return false;
  }

  function readPersistedJson(key, fallback) {
    try {
      var saved = localStorage.getItem(key);
      if (saved === null) return fallback;
      return JSON.parse(saved);
    } catch (e) {
      return fallback;
    }
  }

  /** Snapshot at page load (localStorage), not live navigation — avoids modal after comp refresh when reaching exp later. */
  function wasInExpressionPhaseAtPageLoad() {
    if (!questions.length) return false;
    if (readPersistedJson("sessionCompleted", false)) return false;
    if (!readPersistedJson("ageConfirmed", false)) return false;
    if (readPersistedJson("ageInvalid", false)) return false;
    var hasMic = readPersistedJson("permission", false) || readPersistedJson("microphoneSkipped", false);
    if (!hasMic) return false;
    if (!readPersistedJson("micCheckPassed", false)) return false;
    if (!readPersistedJson("voiceIdentifierConfirmed", false)) return false;
    var idx = parseInt(readPersistedJson("currentIndex", 0), 10);
    if (isNaN(idx)) idx = 0;
    idx = Math.max(0, Math.min(idx, questions.length - 1));
    return isOnExpressionPhaseByIndex(idx);
  }

  function enrichResultRowType(row) {
    if (!row) return row;
    if (row.questionType === "comprehension" || row.questionType === "expression") return row;
    var qn = parseInt(row.questionNumber, 10);
    var q = null;
    for (var i = 0; i < questions.length; i++) {
      if (parseInt(questions[i].query_number, 10) === qn) {
        q = questions[i];
        break;
      }
    }
    return Object.assign({}, row, { questionType: getQuestionTypeLabel(q) });
  }

  function getComprehensionResultsInQuestionOrder(rows) {
    var deduped = dedupeQuestionResultsKeepLastAttempt(rows || []);
    var byNum = {};
    deduped.forEach(function (r) {
      var enriched = enrichResultRowType(r);
      if (enriched.questionType === "comprehension") {
        byNum[String(enriched.questionNumber)] = enriched;
      }
    });
    var ordered = [];
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      if (!q || q.query_type !== "הבנה") continue;
      var key = String(q.query_number);
      if (byNum[key]) ordered.push(byNum[key]);
    }
    return ordered;
  }

  function comprehensionProgressIsPreserved(rows) {
    var compTotal = countQuestionsByType("comprehension");
    if (compTotal <= 0) return true;
    var compNums = [];
    for (var i = 0; i < questions.length; i++) {
      if (questions[i] && questions[i].query_type === "הבנה") {
        compNums.push(String(questions[i].query_number));
      }
    }
    var ordered = getComprehensionResultsInQuestionOrder(rows);
    var answeredNums = {};
    ordered.forEach(function (r) {
      answeredNums[String(r.questionNumber)] = true;
    });
    var allAnswered = compNums.every(function (n) {
      return !!answeredNums[n];
    });
    if (allAnswered) return true;
    if (ordered.length >= 2) {
      var last = ordered[ordered.length - 1];
      var prev = ordered[ordered.length - 2];
      if (last.result === "wrong" && prev.result === "wrong") {
        return true;
      }
    }
    return false;
  }

  /** Refresh recovery applies only after mic check and on/ past first expression question (not mic/voice gates). */
  function isPastMicCheckAndInExpressionPhase() {
    if (sessionCompleted || !ageConfirmed || ageInvalid) return false;
    if (!(permission || microphoneSkipped)) return false;
    if (!micCheckPassed) return false;
    if (!voiceIdentifierConfirmed) return false;
    if (!questions.length) return false;
    return isOnExpressionPhaseByIndex(getSafeCurrentQuestionIndex());
  }

  function clearExpressionRecordingForFreshCapture() {
    expressionPhaseRecordingStartedRef.current = false;
    expressionAnswerCaptureActiveRef.current = false;
    setSessionRecordingStarted(false);
    try {
      if (typeof SessionRecorder !== "undefined") {
        if (SessionRecorder.stopContinuousRecording) {
          SessionRecorder.stopContinuousRecording();
        }
        if (SessionRecorder.cleanup) {
          SessionRecorder.cleanup({ preserveQuestionTimestamps: false });
        }
        if (SessionRecorder.resetTimestamps) {
          SessionRecorder.resetTimestamps();
        }
      }
    } catch (e) {
      console.warn("clearExpressionRecordingForFreshCapture:", e);
    }
    [
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
    ].forEach(function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e2) {}
    });
  }

  function applyComprehensionOnlyQuestionResults() {
    var kept = dedupeQuestionResultsKeepLastAttempt(questionResults).filter(function (r) {
      return enrichResultRowType(r).questionType === "comprehension";
    });
    setQuestionResults(kept);
    var buckets = countBucketsFromResults(kept);
    setCorrectAnswers(buckets.correct);
    setPartialAnswers(buckets.partly);
    setWrongAnswers(buckets.wrong);
  }

  function resetExpressionUiForNewCapture() {
    clearExpressionEvalEnableTimer();
    clearExpressionAnswerEndTimer();
    expressionEvalDeadlineRef.current = null;
    expressionEvalPausedRemainingRef.current = EXPRESSION_EVAL_DELAY_MS;
    expressionEvalArmedQuestionRef.current = null;
    setExpressionEvalArmed(false);
    setEvaluationEnabled(false);
    setExpressionTrafficSubmitted(false);
    setExpressionAdvanceLock(false);
    setExpressionEvalMsLeft(EXPRESSION_EVAL_DELAY_MS);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setShowContinue(false);
  }

  function restartExpressionAfterRefresh() {
    var firstIdx = findFirstExpressionQuestionIndex();
    if (firstIdx < 0) {
      setExpressionRefreshRecovery(null);
      return;
    }
    applyComprehensionOnlyQuestionResults();
    clearExpressionRecordingForFreshCapture();
    resetExpressionUiForNewCapture();
    setExpressionRefreshRecovery(null);
    setCurrentIndex(firstIdx);
  }

  function finishExpressionRefreshForceHome() {
    if (window.MiliTestRun && window.MiliTestRun.setResumeBlockedAfterDataLoss) {
      window.MiliTestRun.setResumeBlockedAfterDataLoss(true);
    }
    if (window.MiliTestRun && window.MiliTestRun.clearStoredTestRunKeepChildProfile) {
      window.MiliTestRun.clearStoredTestRunKeepChildProfile();
    } else {
      enforceFreshRunStartFromQuestionOne();
    }
    try {
      sessionStorage.removeItem("seeandsayWasInTest");
    } catch (e) {}
    setExpressionRefreshRecovery(null);
    onHome();
  }

  function finishExpressionRefreshChoiceHome() {
    clearExpressionRecordingForFreshCapture();
    try {
      sessionStorage.removeItem("seeandsayWasInTest");
    } catch (e) {}
    setExpressionRefreshRecovery(null);
    onHome();
  }

  React.useEffect(function persistExpressionPhaseUnloadFlag() {
    function onPageHide() {
      try {
        if (isPastMicCheckAndInExpressionPhase()) {
          sessionStorage.setItem("seeandsayWasInTest", "1");
        } else {
          sessionStorage.removeItem("seeandsayWasInTest");
        }
      } catch (e) {}
    }
    window.addEventListener("pagehide", onPageHide);
    return function () {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [
    voiceIdentifierConfirmed,
    sessionCompleted,
    questions.length,
    micCheckPassed,
    permission,
    microphoneSkipped,
    currentIndex,
    ageConfirmed,
    ageInvalid,
  ]);

  React.useEffect(function clearActiveTestTabWhenSessionCompletes() {
    if (!sessionCompleted) return;
    try {
      sessionStorage.removeItem("seeandsayWasInTest");
    } catch (e) {}
  }, [sessionCompleted]);

  React.useEffect(function clearExpressionRefreshWhenLeavingExpressionPhase() {
    if (!expressionRefreshRecovery) return;
    if (isPastMicCheckAndInExpressionPhase()) return;
    setExpressionRefreshRecovery(null);
  }, [
    expressionRefreshRecovery,
    voiceIdentifierConfirmed,
    sessionCompleted,
    questions.length,
    micCheckPassed,
    permission,
    microphoneSkipped,
    currentIndex,
    ageConfirmed,
    ageInvalid,
  ]);

  React.useEffect(function detectExpressionRefreshAfterReload() {
    if (expressionRefreshCheckedRef.current) return;
    if (!questions.length) return;

    expressionRefreshCheckedRef.current = true;

    if (!isNavigationReload()) return;

    var reloadDuringExpression =
      wasInExpressionPhaseAtPageLoad() ||
      (function () {
        try {
          return sessionStorage.getItem("seeandsayWasInTest") === "1";
        } catch (e) {
          return false;
        }
      })();
    try {
      sessionStorage.removeItem("seeandsayWasInTest");
    } catch (e2) {}

    if (!reloadDuringExpression) return;

    if (!comprehensionProgressIsPreserved(questionResults)) {
      setExpressionRefreshRecovery("forceHome");
      return;
    }
    setExpressionRefreshRecovery("choice");
  }, [questions.length]);

  function shouldShowIncompleteSummaryBeforeFinish(results) {
    var api = ensurePauseAfk();
    return api ? api.shouldShowIncompleteSummaryBeforeFinish(results) : false;
  }
  function openIncompleteSummaryConfirm(rows) {
    var api = ensurePauseAfk();
    if (api) api.openIncompleteSummaryConfirm(rows);
  }
  async function stayAfterIncompleteSummaryConfirm() {
    var api = ensurePauseAfk();
    if (api) await api.stayAfterIncompleteSummaryConfirm();
  }
  function finishAnywayFromIncompleteSummaryConfirm() {
    var api = ensurePauseAfk();
    if (api) api.finishAnywayFromIncompleteSummaryConfirm();
  }
  function requestCompleteSessionOrConfirm(results) {
    var api = ensurePauseAfk();
    if (api) api.requestCompleteSessionOrConfirm(results);
  }
  function requestFinishTest() {
    var api = ensurePauseAfk();
    if (api) api.requestFinishTest();
  }

  function resetFreshTestRunReactState() {
    setQuestionResults([]);
    setCorrectAnswers(0);
    setPartialAnswers(0);
    setWrongAnswers(0);
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionRecordingStarted(false);
    setIsPaused(false);
    consecutiveCompFailRef.current = 0;
    consecutiveExprFailRef.current = 0;
    if (typeof SessionRecorder !== "undefined" && SessionRecorder.cleanup) {
      SessionRecorder.cleanup(false);
    }
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  // Format question results grouped by type
  function formatQuestionResultsArray(resultsArray) {
    return TM.formatQuestionResultsArray(resultsArray || questionResults);
  }

  function loadAllQuestions() {
    setQuestions(TM.normalizeAndSortQuestions(allQuestions, childGender));
  }

  function markCurrentQuestionEndTimestamp() {
    var api = ensureQuestionFlow();
    if (api) api.markCurrentQuestionEndTimestamp();
  }

  function updateCurrentQuestionIndex(newIndex) {
    var api = ensureQuestionFlow();
    if (api) api.updateCurrentQuestionIndex(newIndex);
  }

  function loadQuestion(index) {
    var api = ensureQuestionFlow();
    if (api) api.loadQuestion(index);
  }

  const tryRecoverSavedTest = React.useCallback(async function () {
    if (typeof recoverLatestTest !== "function") return;
    setTestUploadError(null);
    var recovered = await recoverLatestTest(idDigits);
    if (!recovered || !recovered.success || !recovered.test_id) {
      setTestUploadError(
        lang === "en"
          ? "No saved test found for this session."
          : "לא נמצא מבחן שמור לסשן הזה."
      );
      return;
    }
    setLastCompletedTestId(recovered.test_id);
    if (recovered.expression_ai) {
      setExpressionAiResult(recovered.expression_ai);
    }
    setTestUploadState("ok");
    setExpressionAiPollError(null);
  }, [idDigits, lang]);

  React.useEffect(function autoRecoverAfterUploadFailure() {
    if (!sessionCompleted || testUploadState !== "failed" || lastCompletedTestId) return;
    var pendingId =
      typeof ensurePendingTestId === "function" ? ensurePendingTestId() : null;
    if (!pendingId || typeof getTestStatus !== "function") return;
    getTestStatus(idDigits, pendingId).then(function (statusResp) {
      if (statusResp && statusResp.success && statusResp.test_id) {
        setLastCompletedTestId(statusResp.test_id);
        if (statusResp.expression_ai) {
          setExpressionAiResult(statusResp.expression_ai);
        }
        setTestUploadState("ok");
        setExpressionAiPollError(null);
      }
    });
  }, [sessionCompleted, testUploadState, lastCompletedTestId, idDigits]);

  function completeSession(updatedQuestionResults) {
    var api = ensureSessionFinish();
    if (api) api.completeSession(updatedQuestionResults);
  }

  const refreshExpressionAiStatus = React.useCallback(async function () {
    if (!lastCompletedTestId) return;
    setExpressionAiLoading(true);
    try {
      const resp = await getExpressionAiStatus(idDigits, lastCompletedTestId);
      if (resp && resp.expression_ai) {
        setExpressionAiResult(resp.expression_ai);
        setExpressionAiPollError(null);
      } else {
        setExpressionAiPollError(
          lang === "en"
            ? "Could not load AI status. Tap Refresh."
            : "לא ניתן לטעון סטטוס משוב. לחצו רענון."
        );
      }
    } catch (pollErr) {
      console.error("refreshExpressionAiStatus:", pollErr);
      setExpressionAiPollError(
        lang === "en"
          ? "Could not load AI status. Tap Refresh."
          : "לא ניתן לטעון סטטוס משוב. לחצו רענון."
      );
    } finally {
      setExpressionAiLoading(false);
    }
  }, [idDigits, lastCompletedTestId, lang]);

  function isExpressionAiTerminalForAnsweredQuestions(aiPayload) {
    if (!aiPayload) return false;
    var answeredExpressionCount = questionResults.filter(function (r) {
      return r.questionType === "expression";
    }).length;
    var progress = aiPayload.meta && aiPayload.meta.progress ? aiPayload.meta.progress : null;
    var processed = progress && typeof progress.processed_questions === "number"
      ? progress.processed_questions
      : 0;
    var total = progress && typeof progress.total_questions === "number"
      ? progress.total_questions
      : answeredExpressionCount;
    var impressionStatus = aiPayload.expressive_language_impression && aiPayload.expressive_language_impression.status
      ? String(aiPayload.expressive_language_impression.status)
      : "pending";
    var impressionTerminal =
      impressionStatus === "done" || impressionStatus === "failed" || impressionStatus === "skipped";
    if (String(aiPayload.status || "") === "failed") return true;
    return (
      String(aiPayload.status || "") === "done" &&
      processed >= Math.max(answeredExpressionCount, total) &&
      impressionTerminal
    );
  }

  React.useEffect(function pollExpressionAiWhilePending() {
    if (!sessionCompleted) return;
    if (!lastCompletedTestId) return;
    if (isExpressionAiTerminalForAnsweredQuestions(expressionAiResult)) return;

    if (expressionAiPollStartedRef.current == null) {
      expressionAiPollStartedRef.current = Date.now();
    }
    refreshExpressionAiStatus();
    var pollMs =
      Date.now() - expressionAiPollStartedRef.current < 120000 ? 2000 : 5000;
    var timer = setInterval(refreshExpressionAiStatus, pollMs);
    return function () {
      clearInterval(timer);
    };
  }, [sessionCompleted, lastCompletedTestId, expressionAiResult, refreshExpressionAiStatus, questionResults]);

  React.useEffect(function resetPlsReportCategoryOnNewTest() {
    setPlsReportCategory("semantics");
    expressionAiPollStartedRef.current = Date.now();
  }, [lastCompletedTestId]);

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
        if (voiceIdentifierConfirmed && !comprIntroVideoComplete) return;
        if (pendingExpressionIntroIndex >= 0) return;
        const idx = getSafeCurrentQuestionIndex();
        if (!expIntroVideoComplete && isOnExpressionPhaseByIndex(idx)) return;
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
    [
      ageConfirmed,
      questions,
      currentIndex,
      sessionCompleted,
      voiceIdentifierConfirmed,
      micCheckPassed,
      comprIntroVideoComplete,
      expIntroVideoComplete,
      pendingExpressionIntroIndex,
    ]
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

  function renderTestNavbar() {
    var api = ensureTestQuestionRender();
    return api ? api.renderTestNavbar() : null;
  }

  function renderQuestionLoadingScreen() {
    var api = ensureTestQuestionRender();
    return api ? api.renderQuestionLoadingScreen() : null;
  }

  function renderBottomActions() {
    var api = ensureTestQuestionRender();
    return api ? api.renderBottomActions() : null;
  }

  function renderDevAudioToggle() {
    var api = ensureTestQuestionRender();
    return api ? api.renderDevAudioToggle() : null;
  }

  function renderExpectedAnswerToggle() {
    var api = ensureTestQuestionRender();
    return api ? api.renderExpectedAnswerToggle() : null;
  }

  function renderConfettiOverlay() {
    var api = ensureTestOverlays();
    return api ? api.renderConfettiOverlay() : null;
  }

  function renderClappingAvatarOverlay() {
    var api = ensureTestOverlays();
    return api ? api.renderClappingAvatarOverlay() : null;
  }

  function renderQuestionSection() {
    var api = ensureTestQuestionRender();
    return api ? api.renderQuestionSection() : null;
  }

  function renderExpressionRefreshRecoveryModal() {
    var api = ensureTestOverlays();
    return api ? api.renderExpressionRefreshRecoveryModal() : null;
  }

  function renderRecordingInterruptedBanner() {
    var api = ensureTestOverlays();
    return api ? api.renderRecordingInterruptedBanner() : null;
  }

  function renderIncrementalSegmentInterruptModal() {
    var api = ensureTestOverlays();
    return api ? api.renderIncrementalSegmentInterruptModal() : null;
  }

  function renderPausedOverlay() {
    var api = ensureTestOverlays();
    return api ? api.renderPausedOverlay() : null;
  }

  function renderAfkWarningOverlay() {
    var api = ensureTestOverlays();
    return api ? api.renderAfkWarningOverlay() : null;
  }

  function renderTrafficPopup() {
    var api = ensureTestOverlays();
    return api ? api.renderTrafficPopup() : null;
  }

  function renderIncompleteSummaryConfirm() {
    var api = ensureTestOverlays();
    return api ? api.renderIncompleteSummaryConfirm() : null;
  }

  function renderVisualSummaryCard(opts) {
    var api = ensureTestSummaryRender();
    return api ? api.renderVisualSummaryCard(opts) : null;
  }

  overlaysCtxRef.current = {
    fireworksVisible: fireworksVisible,
    showClappingAvatar: showClappingAvatar,
    streakVideoDoneRef: streakVideoDoneRef,
    maybeFinishStreakCelebration: maybeFinishStreakCelebration,
    expressionRefreshRecovery: expressionRefreshRecovery,
    isPastMicCheckAndInExpressionPhase: isPastMicCheckAndInExpressionPhase,
    lang: lang,
    tr: tr,
    finishExpressionRefreshForceHome: finishExpressionRefreshForceHome,
    restartExpressionAfterRefresh: restartExpressionAfterRefresh,
    finishExpressionRefreshChoiceHome: finishExpressionRefreshChoiceHome,
    isPaused: isPaused,
    incompleteSummaryConfirmOpen: incompleteSummaryConfirmOpen,
    resumeTest: resumeTest,
    onHome: onHome,
    showAfkWarning: showAfkWarning,
    handleAfkResponse: handleAfkResponse,
    trafficPopupOpen: trafficPopupOpen,
    trafficPopupChoice: trafficPopupChoice,
    questions: questions,
    getCurrentQuestionIndex: getCurrentQuestionIndex,
    questionType: questionType,
    evaluationEnabled: evaluationEnabled,
    cancelTrafficPopup: cancelTrafficPopup,
    handleTrafficPopupChoice: handleTrafficPopupChoice,
    stayAfterIncompleteSummaryConfirm: stayAfterIncompleteSummaryConfirm,
    finishAnywayFromIncompleteSummaryConfirm: finishAnywayFromIncompleteSummaryConfirm,
    recordingInterruptedBannerOpen: recordingInterruptedBannerOpen,
    sessionCompleted: sessionCompleted,
    dismissRecordingInterruptedBanner: dismissRecordingInterruptedBanner,
    getExpressionAudioMode: getExpressionAudioMode,
    incrementalSegmentInterrupt: incrementalSegmentInterrupt,
    incrementalRestartMicReady: incrementalRestartMicReady,
    incrementalInterruptUploadState: incrementalInterruptUploadState,
    getIncrementalSegmentUploadState: function (questionNumber) {
      if (!expressionSegmentQueueRef.current || !expressionSegmentQueueRef.current.getQuestionUploadState) {
        return "none";
      }
      return expressionSegmentQueueRef.current.getQuestionUploadState(questionNumber);
    },
    dismissIncrementalSegmentInterruptModal: dismissIncrementalSegmentInterruptModal,
    restartCurrentIncrementalExpressionQuestion: restartCurrentIncrementalExpressionQuestion,
  };

  summaryRenderCtxRef.current = {
    lang: lang,
    t: t,
    correctAnswers: correctAnswers,
    partialAnswers: partialAnswers,
    wrongAnswers: wrongAnswers,
    permission: permission,
    sessionRecordingStarted: sessionRecordingStarted,
    questions: questions,
    questionResults: questionResults,
    expressionAiResult: expressionAiResult,
    testUploadState: testUploadState,
    sessionCompleted: sessionCompleted,
    lastCompletedTestId: lastCompletedTestId,
    expressionAiLoading: expressionAiLoading,
    testUploadError: testUploadError,
    expressionAiPollError: expressionAiPollError,
    plsReportCategory: plsReportCategory,
    setPlsReportCategory: setPlsReportCategory,
    onHome: onHome,
    onReset: onReset,
    setLang: setLang,
    retryRecordingUploadRef: retryRecordingUploadRef,
    tryRecoverSavedTest: tryRecoverSavedTest,
    refreshExpressionAiStatus: refreshExpressionAiStatus,
    totalMonths: totalMonths,
    formatQuestionAgeBadge: formatQuestionAgeBadge,
  };

  questionFlowCtxRef.current = {
    permission: permission,
    microphoneSkipped: microphoneSkipped,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    getSafeCurrentQuestionIndex: getSafeCurrentQuestionIndex,
    questions: questions,
    clearExpressionAnswerEndTimer: clearExpressionAnswerEndTimer,
    endExpressionAnswerRecordingCapture: endExpressionAnswerRecordingCapture,
    resetFirstQuestionRetryState: resetFirstQuestionRetryState,
    firstQuestionMicGateArmedRef: firstQuestionMicGateArmedRef,
    setCurrentIndex: setCurrentIndex,
    questionAudioAutoplayPendingRef: questionAudioAutoplayPendingRef,
    questionAudioRef: questionAudioRef,
    questionAudio: questionAudio,
    setIsAudioPlaying: setIsAudioPlaying,
    tryAgainAudioRef: tryAgainAudioRef,
    setCurrentQuestionImagesLoaded: setCurrentQuestionImagesLoaded,
    setImages: setImages,
    fireworksTimerRef: fireworksTimerRef,
    setFireworksVisible: setFireworksVisible,
    setShowContinue: setShowContinue,
    setClickedCorrect: setClickedCorrect,
    setClickedMultiAnswers: setClickedMultiAnswers,
    setAllClickedAnswers: setAllClickedAnswers,
    setOrderedClickSequence: setOrderedClickSequence,
    setMultiAttemptCount: setMultiAttemptCount,
    setMaskImage: setMaskImage,
    setMaskCanvas: setMaskCanvas,
    maskAwaitingSecondRef: maskAwaitingSecondRef,
    singleComprehensionRetryRef: singleComprehensionRetryRef,
    multiWrongClicksRef: multiWrongClicksRef,
    comprehensionAdvanceLockRef: comprehensionAdvanceLockRef,
    orderedRescueActiveRef: orderedRescueActiveRef,
    orderedRescueTargetRef: orderedRescueTargetRef,
    incompleteFinishDialogPausedByUsRef: incompleteFinishDialogPausedByUsRef,
    setIncompleteSummaryConfirmOpen: setIncompleteSummaryConfirmOpen,
    setAnswerType: setAnswerType,
    setTarget: setTarget,
    setMultiAnswers: setMultiAnswers,
    setMinCorrectAnswers: setMinCorrectAnswers,
    setOrderedAnswers: setOrderedAnswers,
    setNonClickableImage: setNonClickableImage,
    setQuestionType: setQuestionType,
    setExpressionEvalArmed: setExpressionEvalArmed,
    expressionEvalArmedQuestionRef: expressionEvalArmedQuestionRef,
    childGender: childGender,
    getQuestionAudioFolderByGender: getQuestionAudioFolderByGender,
    markExpressionTimestampAndArm: markExpressionTimestampAndArm,
    setQuestionAudio: setQuestionAudio,
    questionAudioCacheRef: questionAudioCacheRef,
    ensurePendingTestId: ensurePendingTestId,
    lang: lang,
    devMode: devMode,
    micCheckPassed: micCheckPassed,
    expIntroVideoComplete: expIntroVideoComplete,
    setIsTwoRow: setIsTwoRow,
    setTopRowCount: setTopRowCount,
    setTopRowBigger: setTopRowBigger,
    setCommentText: setCommentText,
  };

  sessionFinishCtxRef.current = {
    isPaused: isPaused,
    setIsPaused: setIsPaused,
    markCurrentQuestionEndTimestamp: markCurrentQuestionEndTimestamp,
    expressionAnswerCaptureActiveRef: expressionAnswerCaptureActiveRef,
    stopQuestionAudioForSessionComplete: stopQuestionAudioForSessionComplete,
    setImages: setImages,
    setExpressionAiResult: setExpressionAiResult,
    setExpressionAiLoading: setExpressionAiLoading,
    setTestUploadError: setTestUploadError,
    setExpressionAiPollError: setExpressionAiPollError,
    expressionAiPollStartedRef: expressionAiPollStartedRef,
    consecutiveCompFailRef: consecutiveCompFailRef,
    consecutiveExprFailRef: consecutiveExprFailRef,
    questionResults: questionResults,
    pendingCompleteSessionResultsRef: pendingCompleteSessionResultsRef,
    lang: lang,
    setTestUploadState: setTestUploadState,
    setLastCompletedTestId: setLastCompletedTestId,
    ensurePendingTestId: ensurePendingTestId,
    prepareAudioUpload: prepareAudioUpload,
    putSessionAudioToBlob: putSessionAudioToBlob,
    idDigits: idDigits,
    updateUserTests: updateUserTests,
    ageYears: ageYears,
    ageMonths: ageMonths,
    correctAnswers: correctAnswers,
    partialAnswers: partialAnswers,
    wrongAnswers: wrongAnswers,
    childGender: childGender,
    formatQuestionResultsArray: formatQuestionResultsArray,
    expressionPhaseRecordingStartedRef: expressionPhaseRecordingStartedRef,
    setSessionCompleted: setSessionCompleted,
    enqueueExpressionSegmentUpload: enqueueExpressionSegmentUpload,
    getExpressionAudioMode: getExpressionAudioMode,
    getPendingExpressionSegmentUploads: function () {
      return expressionSegmentQueueRef.current && expressionSegmentQueueRef.current.pendingCount
        ? expressionSegmentQueueRef.current.pendingCount()
        : 0;
    },
    getExpressionSegmentUploadStats: function () {
      return expressionSegmentQueueRef.current && expressionSegmentQueueRef.current.stats
        ? expressionSegmentQueueRef.current.stats()
        : { pending: 0, completed: 0, failed: 0 };
    },
    waitForExpressionSegmentQueueIdle: async function (timeoutMs) {
      if (!expressionSegmentQueueRef.current || !expressionSegmentQueueRef.current.waitForIdle) return;
      await expressionSegmentQueueRef.current.waitForIdle(timeoutMs);
    },
    reconcileSessionScoreCounters: reconcileSessionScoreCountersFromResults,
    beginExpressionEvalFreezeForIncrementalUpload: beginExpressionEvalFreezeForIncrementalUpload,
    releaseIncrementalCaptureResources: releaseIncrementalCaptureResources,
    retryRecordingUploadRef: retryRecordingUploadRef,
    sessionRecordingStarted: sessionRecordingStarted,
    permission: permission,
  };

  scoringCtxRef.current = {
    comprehensionAdvanceLockRef: comprehensionAdvanceLockRef,
    fireworksTimerRef: fireworksTimerRef,
    singleComprehensionRetryRef: singleComprehensionRetryRef,
    multiWrongClicksRef: multiWrongClicksRef,
    orderedRescueActiveRef: orderedRescueActiveRef,
    orderedRescueTargetRef: orderedRescueTargetRef,
    maskAwaitingSecondRef: maskAwaitingSecondRef,
    consecutiveExprFailRef: consecutiveExprFailRef,
    consecutiveCompFailRef: consecutiveCompFailRef,
    questionType: questionType,
    images: images,
    nonClickableImage: nonClickableImage,
    answerType: answerType,
    target: target,
    allClickedAnswers: allClickedAnswers,
    multiAnswers: multiAnswers,
    multiAttemptCount: multiAttemptCount,
    clickedMultiAnswers: clickedMultiAnswers,
    minCorrectAnswers: minCorrectAnswers,
    orderedAnswers: orderedAnswers,
    orderedClickSequence: orderedClickSequence,
    maskCanvas: maskCanvas,
    questions: questions,
    questionResults: questionResults,
    consecutiveSuccessStreak: consecutiveSuccessStreak,
    setClickedCorrect: setClickedCorrect,
    setFireworksVisible: setFireworksVisible,
    setMultiAttemptCount: setMultiAttemptCount,
    setAllClickedAnswers: setAllClickedAnswers,
    setClickedMultiAnswers: setClickedMultiAnswers,
    setOrderedClickSequence: setOrderedClickSequence,
    setShowContinue: setShowContinue,
    setQuestionResults: setQuestionResults,
    setConsecutiveSuccessStreak: setConsecutiveSuccessStreak,
    resetAfkTimer: resetAfkTimer,
    playTryAgainAudio: playTryAgainAudio,
    adjustCountsForResult: adjustCountsForResult,
    startThreeInRowCelebration: startThreeInRowCelebration,
    requestCompleteSessionOrConfirm: requestCompleteSessionOrConfirm,
    enqueueExpressionSegmentUpload: enqueueExpressionSegmentUpload,
    getExpressionAudioMode: getExpressionAudioMode,
    waitForExpressionSegmentQueueIdle: async function (timeoutMs) {
      if (!expressionSegmentQueueRef.current || !expressionSegmentQueueRef.current.waitForIdle) return;
      await expressionSegmentQueueRef.current.waitForIdle(timeoutMs);
    },
    beginExpressionEvalFreezeForIncrementalUpload: beginExpressionEvalFreezeForIncrementalUpload,
    openIncompleteSummaryConfirm: openIncompleteSummaryConfirm,
    tryGateExpressionMicCheckBeforeNavigatingTo: tryGateExpressionMicCheckBeforeNavigatingTo,
    tryDeferExpressionIntroBeforeNavigatingTo: tryDeferExpressionIntroBeforeNavigatingTo,
    updateCurrentQuestionIndex: updateCurrentQuestionIndex,
    getCurrentQuestionIndex: getCurrentQuestionIndex,
    getQuestionTypeLabel: getQuestionTypeLabel,
    shouldApplyAdaptiveWrongLogic: shouldApplyAdaptiveWrongLogic,
    findFirstExpressionQuestionIndex: findFirstExpressionQuestionIndex,
    dedupeQuestionResultsKeepLastAttempt: dedupeQuestionResultsKeepLastAttempt,
    countQuestionsByType: countQuestionsByType,
    countAnsweredByType: countAnsweredByType,
  };

  pauseAfkCtxRef.current = {
    isPaused: isPaused,
    sessionCompleted: sessionCompleted,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    permission: permission,
    sessionRecordingStarted: sessionRecordingStarted,
    stopAllQuestionPlayback: stopAllQuestionPlayback,
    setIsPaused: setIsPaused,
    afkTimerRef: afkTimerRef,
    afkWarningTimerRef: afkWarningTimerRef,
    setShowAfkWarning: setShowAfkWarning,
    questions: questions,
    questionResults: questionResults,
    getSafeCurrentQuestionIndex: getSafeCurrentQuestionIndex,
    getQuestionTypeLabel: getQuestionTypeLabel,
    countQuestionsByType: countQuestionsByType,
    countAnsweredByType: countAnsweredByType,
    countUniqueQuestionsAnswered: countUniqueQuestionsAnswered,
    incompleteFinishDialogPausedByUsRef: incompleteFinishDialogPausedByUsRef,
    setIncompleteSummaryConfirmOpen: setIncompleteSummaryConfirmOpen,
    setQuestionResults: setQuestionResults,
    completeSession: completeSession,
    trafficChoiceInProgressRef: trafficChoiceInProgressRef,
    endExpressionAnswerRecordingCapture: endExpressionAnswerRecordingCapture,
    setExpressionTrafficSubmitted: setExpressionTrafficSubmitted,
    setExpressionAdvanceLock: setExpressionAdvanceLock,
    playTrafficFeedback: playTrafficFeedback,
    setShowContinue: setShowContinue,
    setTrafficPopupOpen: setTrafficPopupOpen,
    setTrafficPopupChoice: setTrafficPopupChoice,
    handleContinue: handleContinue,
  };

  micIntroCtxRef.current = {
    micCheckRafRef: micCheckRafRef,
    micCheckStreamRef: micCheckStreamRef,
    micCheckAudioContextRef: micCheckAudioContextRef,
    micCheckAnalyserRef: micCheckAnalyserRef,
    setMicCheckRunning: setMicCheckRunning,
    setMicCheckLevel: setMicCheckLevel,
    setMicCheckPeak: setMicCheckPeak,
    setMicCheckReady: setMicCheckReady,
    setMicPermissionError: setMicPermissionError,
    permission: permission,
    microphoneSkipped: microphoneSkipped,
    micCheckPassed: micCheckPassed,
    awaitingExpressionMicCheck: awaitingExpressionMicCheck,
    pendingFirstExpressionIndexRef: pendingFirstExpressionIndexRef,
    findFirstExpressionQuestionIndex: findFirstExpressionQuestionIndex,
    getSafeCurrentQuestionIndex: getSafeCurrentQuestionIndex,
    setAwaitingExpressionMicCheck: setAwaitingExpressionMicCheck,
    setMicCheckPassed: setMicCheckPassed,
    setPendingExpressionIntroIndex: setPendingExpressionIntroIndex,
    setForceFreshStartAfterMicCheck: setForceFreshStartAfterMicCheck,
    setVoiceIdentifierConfirmed: setVoiceIdentifierConfirmed,
    expIntroVideoComplete: expIntroVideoComplete,
    pendingExpressionIntroIndex: pendingExpressionIntroIndex,
    stopAllQuestionPlayback: stopAllQuestionPlayback,
    primeMediaPlaybackFromUserGesture: primeMediaPlaybackFromUserGesture,
    firstQuestionMicGateArmedRef: firstQuestionMicGateArmedRef,
    resetFirstQuestionRetryState: resetFirstQuestionRetryState,
    updateCurrentQuestionIndex: updateCurrentQuestionIndex,
    setExpIntroVideoComplete: setExpIntroVideoComplete,
    expressionPhaseRecordingStartedRef: expressionPhaseRecordingStartedRef,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    setSessionRecordingStarted: setSessionRecordingStarted,
    tr: tr,
  };

  exprTimerCtxRef.current = {
    expressionEvalEnableTimerRef: expressionEvalEnableTimerRef,
    expressionEvalDeadlineRef: expressionEvalDeadlineRef,
    expressionEvalPausedRemainingRef: expressionEvalPausedRemainingRef,
    expressionEvalArmedQuestionRef: expressionEvalArmedQuestionRef,
    expressionAnswerEndTimerRef: expressionAnswerEndTimerRef,
    setEvaluationEnabled: setEvaluationEnabled,
    setExpressionEvalMsLeft: setExpressionEvalMsLeft,
    getSafeCurrentQuestionIndex: getSafeCurrentQuestionIndex,
    questions: questions,
    permission: permission,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    endExpressionAnswerRecordingCapture: endExpressionAnswerRecordingCapture,
    EXPRESSION_EVAL_DELAY_MS: EXPRESSION_EVAL_DELAY_MS,
  };

  startScreensCtxRef.current = {
    ageConfirmed: ageConfirmed,
    ageInvalid: ageInvalid,
    lang: lang,
    onHome: onHome,
    isExpressionMicCheckGateActive: isExpressionMicCheckGateActive,
    micCheckLevel: micCheckLevel,
    tr: tr,
    micCheckReady: micCheckReady,
    micPermissionError: micPermissionError,
    micCheckRunning: micCheckRunning,
    startMicrophoneCheck: startMicrophoneCheck,
    continueFromExpressionMicCheck: continueFromExpressionMicCheck,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    comprIntroVideoComplete: comprIntroVideoComplete,
    sessionCompleted: sessionCompleted,
    comprIntroVideoRef: comprIntroVideoRef,
    comprIntroVideoSources: comprIntroVideoSources,
    finishComprehensionIntroVideo: finishComprehensionIntroVideo,
    handleComprIntroVideoError: handleComprIntroVideoError,
    expIntroVideoComplete: expIntroVideoComplete,
    pendingExpressionIntroIndex: pendingExpressionIntroIndex,
    micCheckPassed: micCheckPassed,
    microphoneSkipped: microphoneSkipped,
    expIntroVideoRef: expIntroVideoRef,
    expIntroVideoSources: expIntroVideoSources,
    finishExpressionIntroVideo: finishExpressionIntroVideo,
    handleExpIntroVideoError: handleExpIntroVideoError,
    testUploadState: testUploadState,
  };

  questionRenderCtxRef.current = {
    lang: lang,
    tr: tr,
    t: t,
    permission: permission,
    sessionRecordingStarted: sessionRecordingStarted,
    voiceIdentifierConfirmed: voiceIdentifierConfirmed,
    sessionCompleted: sessionCompleted,
    questionType: questionType,
    expressionTrafficSubmitted: expressionTrafficSubmitted,
    expressionAdvanceLock: expressionAdvanceLock,
    evaluationEnabled: evaluationEnabled,
    trafficPopupOpen: trafficPopupOpen,
    incompleteSummaryConfirmOpen: incompleteSummaryConfirmOpen,
    isPaused: isPaused,
    pauseTest: pauseTest,
    resumeTest: resumeTest,
    devMode: devMode,
    setDevMode: setDevMode,
    questions: questions,
    getCurrentQuestionIndex: getCurrentQuestionIndex,
    goToPreviousQuestion: goToPreviousQuestion,
    updateCurrentQuestionIndex: updateCurrentQuestionIndex,
    requestFinishTest: requestFinishTest,
    onHome: onHome,
    onReset: onReset,
    setLang: setLang,
    showQuestionLoadingRecovery: showQuestionLoadingRecovery,
    retryCurrentQuestionLoading: retryCurrentQuestionLoading,
    expressionEvalMsLeft: expressionEvalMsLeft,
    EXPRESSION_EVAL_DELAY_MS: EXPRESSION_EVAL_DELAY_MS,
    expressionEvalArmed: expressionEvalArmed,
    showContinue: showContinue,
    setTrafficPopupOpen: setTrafficPopupOpen,
    questionAudioMuted: questionAudioMuted,
    setQuestionAudioMuted: setQuestionAudioMuted,
  };

  var startScreenNode = tryRenderStartScreen();
  if (startScreenNode) return startScreenNode;

  if (sessionCompleted) {
    var summaryApi = ensureTestSummaryRender();
    return summaryApi ? summaryApi.renderSessionCompleteScreen() : null;
  }

  if (questions.length === 0) {
    return React.createElement("div", null, tr("test.noQuestions"));
  }

  // Show loading screen ONLY if current question images aren't ready
  if (!currentQuestionImagesLoaded) {
    return React.createElement(
      React.Fragment,
      null,
      renderExpressionRefreshRecoveryModal(),
      renderQuestionLoadingScreen()
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

  Object.assign(questionRenderCtxRef.current, {
    currentIdx: currentIdx,
    currentQuestion: currentQuestion,
    questions: questions,
    questionAudio: questionAudio,
    replayQuestionAudio: replayQuestionAudio,
    isAudioPlaying: isAudioPlaying,
    currentQuestionAgeBadge: currentQuestionAgeBadge,
    currentQuestionAgeGroup: currentQuestionAgeGroup,
    usePhoneLikeGrid: usePhoneLikeGrid,
    currentImageCount: currentImageCount,
    isTwoRow: isTwoRow,
    topRowCount: topRowCount,
    topRowBigger: topRowBigger,
    images: images,
    imagesGridStyle: imagesGridStyle,
    imagesContainerClassName: imagesContainerClassName,
    answerType: answerType,
    clickedMultiAnswers: clickedMultiAnswers,
    clickedCorrect: clickedCorrect,
    target: target,
    orderedAnswers: orderedAnswers,
    orderedClickSequence: orderedClickSequence,
    nonClickableImage: nonClickableImage,
    handleClick: handleClick,
    handleImageFallbackError: handleImageFallbackError,
    commentText: commentText,
  });

  // Main UI
  return React.createElement(
    "div",
    {
      className: "app-container"
    },
    isIncrementalExpressionInterruptBlocking() ? null : renderConfettiOverlay(),
    isIncrementalExpressionInterruptBlocking() ? null : renderClappingAvatarOverlay(),
    isIncrementalExpressionInterruptBlocking()
      ? null
      : renderExpressionRefreshRecoveryModal(),
    isIncrementalExpressionInterruptBlocking()
      ? null
      : renderRecordingInterruptedBanner(),
    renderIncrementalSegmentInterruptModal(),
    isIncrementalExpressionInterruptBlocking() ? null : renderPausedOverlay(),
    isIncrementalExpressionInterruptBlocking() ? null : renderAfkWarningOverlay(),
    isIncrementalExpressionInterruptBlocking() ? null : renderTestNavbar(),
    isIncrementalExpressionInterruptBlocking() ? null : renderTrafficPopup(),
    isIncrementalExpressionInterruptBlocking() ? null : renderIncompleteSummaryConfirm(),

    isIncrementalExpressionInterruptBlocking() ? null : renderQuestionSection()
  );
}