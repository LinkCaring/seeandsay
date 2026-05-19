var AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT = null;

var AVATAR_INTRO_VIDEO = {
  compr: {
    webm: "resources/avatar/compr_intro.webm",
    mp4Fallback: "resources/avatar/compr_intro_fallback.mp4",
  },
  exp: {
    webm: "resources/avatar/exp_intro.webm",
    mp4Fallback: "resources/avatar/exp_intro_fallback.mp4",
  },
};

function isApplePlatformWithoutWebmAlpha() {
  try {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  } catch (e) {}
  return false;
}

/** WebM with usable alpha (Chrome/Android); iOS and no-WebM devices use MP4 fallback assets. */
function canPlayWebmWithTransparency() {
  if (AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT !== null) {
    return AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT;
  }
  var supported = false;
  try {
    var probe = document.createElement("video");
    var vp9 = probe.canPlayType('video/webm; codecs="vp9"');
    var vp8 = probe.canPlayType('video/webm; codecs="vp8"');
    var webm = probe.canPlayType("video/webm");
    var canPlayWebm =
      vp9 === "probably" ||
      vp9 === "maybe" ||
      vp8 === "probably" ||
      vp8 === "maybe" ||
      webm === "probably" ||
      webm === "maybe";
    supported = canPlayWebm && !isApplePlatformWithoutWebmAlpha();
  } catch (e) {
    supported = false;
  }
  AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT = supported;
  return supported;
}

function resolveAvatarIntroVideoSources(webmPath, mp4FallbackPath) {
  if (canPlayWebmWithTransparency()) {
    return { src: webmPath, isFallback: false };
  }
  return { src: mp4FallbackPath, isFallback: true };
}

function switchAvatarIntroVideoToMp4Fallback(videoEl, mp4FallbackPath, onGiveUp) {
  if (!videoEl || typeof onGiveUp !== "function") return;
  var currentSrc = String(videoEl.currentSrc || videoEl.src || "");
  if (currentSrc.indexOf(mp4FallbackPath) !== -1) {
    onGiveUp();
    return;
  }
  if (videoEl.getAttribute("data-avatar-intro-fallback") === "1") {
    onGiveUp();
    return;
  }
  videoEl.setAttribute("data-avatar-intro-fallback", "1");
  videoEl.classList.add("test-avatar-intro__video--solid-bg");
  videoEl.src = mp4FallbackPath;
  try {
    videoEl.load();
    var playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        onGiveUp();
      });
    }
  } catch (e) {
    onGiveUp();
  }
}

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

  /** Set true to show the expression (הבעה) hint bulb + hint-driven scoring rules again. */
  var ENABLE_EXPRESSION_HINTS = false;
  /** Expression answer window (ms); mirrors `frontend_demo/expressionTiming.js` → `window.SEEANDSAY_EXPRESSION_ANSWER_MS`. */
  var EXPRESSION_EVAL_DELAY_MS =
    typeof window !== "undefined" && Number(window.SEEANDSAY_EXPRESSION_ANSWER_MS) > 0
      ? Number(window.SEEANDSAY_EXPRESSION_ANSWER_MS)
      : 20000;

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
  const expressionAnswerEndTimerRef = React.useRef(null);

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

  function scheduleExpressionAnswerEndMark(q, delayMs) {
    clearExpressionAnswerEndTimer();
    if (!q || !permission || !voiceIdentifierConfirmed || !SessionRecorder || !SessionRecorder.markQuestionEnd) {
      return;
    }
    var delay = Math.max(0, delayMs);
    if (delay <= 0) {
      SessionRecorder.markQuestionEnd(q.query_number);
      endExpressionAnswerRecordingCapture();
      return;
    }
    var qNum = String(q.query_number || "");
    expressionAnswerEndTimerRef.current = setTimeout(function () {
      expressionAnswerEndTimerRef.current = null;
      if (expressionEvalArmedQuestionRef.current !== qNum) return;
      SessionRecorder.markQuestionEnd(q.query_number);
      console.log("🏁 Auto end mark at 20s answer window for question", q.query_number);
      endExpressionAnswerRecordingCapture();
    }, delay);
  }

  function freezeExpressionEvalCountdown() {
    clearExpressionEvalEnableTimer();
    clearExpressionAnswerEndTimer();
    if (expressionEvalDeadlineRef.current) {
      var remainingMs = Math.max(0, expressionEvalDeadlineRef.current - Date.now());
      expressionEvalPausedRemainingRef.current = remainingMs;
      setExpressionEvalMsLeft(remainingMs);
      expressionEvalDeadlineRef.current = null;
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
      scheduleExpressionEvalEnable(resumeMs);
      var armedIdx = getSafeCurrentQuestionIndex();
      var armedQ = questions[armedIdx];
      if (armedQ && armedQ.query_type === "הבעה") {
        scheduleExpressionAnswerEndMark(armedQ, resumeMs);
      }
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

  /** Mic-check UI only when gating navigation to the expression section (not at test start). */
  function isExpressionMicCheckGateActive() {
    if (!awaitingExpressionMicCheck || !permission || microphoneSkipped || micCheckPassed) {
      return false;
    }
    var pendingIdx = pendingFirstExpressionIndexRef.current;
    if (pendingIdx != null && pendingIdx >= 0) return true;
    var firstExpr = findFirstExpressionQuestionIndex();
    if (firstExpr < 0) return false;
    return getSafeCurrentQuestionIndex() >= firstExpr;
  }

  /** After welcome Start game: clear expression gates; comp intro plays when comprIntroVideoComplete is false. */
  function applyWelcomeDirectToFirstQuestion() {
    setAwaitingExpressionMicCheck(false);
    setMicCheckPassed(false);
    setMicCheckReady(false);
    pendingFirstExpressionIndexRef.current = null;
    setPendingExpressionIntroIndex(-1);
    setForceFreshStartAfterMicCheck(false);
    setVoiceIdentifierConfirmed(true);
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

  function clearExpressionAnswerEndTimer() {
    if (expressionAnswerEndTimerRef.current != null) {
      clearTimeout(expressionAnswerEndTimerRef.current);
      expressionAnswerEndTimerRef.current = null;
    }
  }

  /** Mark answer window start after prompt audio ends; recording must already be running. */
  function markExpressionTimestampAndArm(q) {
    if (!q || q.query_type !== "הבעה") return;
    var qNum = String(q.query_number || "");
    if (!qNum) return;
    if (expressionEvalArmedQuestionRef.current === qNum) return;

    clearExpressionAnswerEndTimer();

    if (permission && voiceIdentifierConfirmed && SessionRecorder && SessionRecorder.markQuestionStart) {
      SessionRecorder.markQuestionStart(q.query_number);
    }
    expressionEvalArmedQuestionRef.current = qNum;
    setExpressionEvalArmed(true);
    beginExpressionAnswerRecordingCapture();
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
    if (isPaused) {
      freezeExpressionEvalCountdown();
      return;
    }
    if (!expressionEvalDeadlineRef.current) {
      resumeExpressionEvalCountdown();
    }
  }, [isPaused, sessionCompleted, questionType, evaluationEnabled]);

  /** Freeze expression traffic countdown while streak clapping overlay is up. */
  React.useEffect(function pauseExpressionEvalDuringClappingAvatar() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || !expressionEvalArmed) return;
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
  ]);

  /** Freeze countdown while Finish / incomplete-summary gate is open. */
  React.useEffect(function pauseExpressionEvalDuringFinishFlow() {
    if (sessionCompleted || questionType !== "E" || evaluationEnabled || !expressionEvalArmed) return;
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
  ]);

  React.useEffect(function tickExpressionEvalCountdown() {
    if (
      sessionCompleted ||
      questionType !== "E" ||
      evaluationEnabled ||
      isPaused ||
      showClappingAvatar ||
      incompleteSummaryConfirmOpen ||
      !expressionEvalDeadlineRef.current
    ) {
      return;
    }
    const intervalId = setInterval(function () {
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
    evaluationEnabled,
    isPaused,
    showClappingAvatar,
    incompleteSummaryConfirmOpen,
  ]);

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

  function isOnExpressionPhaseByIndex(idx) {
    var firstExpr = findFirstExpressionQuestionIndex();
    if (firstExpr < 0) return false;
    return idx >= firstExpr;
  }

  /** Pause navigation and show sound check before the first expression question. */
  function tryGateExpressionMicCheckBeforeNavigatingTo(targetIdx) {
    if (microphoneSkipped || !permission) return false;
    if (micCheckPassed) return false;
    var firstExpr = findFirstExpressionQuestionIndex();
    if (firstExpr < 0 || targetIdx < firstExpr) return false;
    stopAllQuestionPlayback();
    pendingFirstExpressionIndexRef.current = targetIdx;
    setAwaitingExpressionMicCheck(true);
    return true;
  }

  function beginExpressionIntroBeforeIndex(targetIdx) {
    var firstExpr = findFirstExpressionQuestionIndex();
    if (firstExpr < 0 || targetIdx < firstExpr) return false;
    if (expIntroVideoComplete) return false;
    stopAllQuestionPlayback();
    pendingFirstExpressionIndexRef.current = targetIdx;
    setPendingExpressionIntroIndex(targetIdx);
    return true;
  }

  function tryDeferExpressionIntroBeforeNavigatingTo(targetIdx) {
    if (!(micCheckPassed || microphoneSkipped)) return false;
    return beginExpressionIntroBeforeIndex(targetIdx);
  }

  function continueFromExpressionMicCheck() {
    primeMediaPlaybackFromUserGesture();
    setMicCheckPassed(true);
    setMicCheckReady(false);
    setAwaitingExpressionMicCheck(false);
    stopMicrophoneCheck();
    var targetIdx = pendingFirstExpressionIndexRef.current;
    if (targetIdx == null || targetIdx < 0) {
      targetIdx = findFirstExpressionQuestionIndex();
    }
    if (targetIdx >= 0 && !expIntroVideoComplete) {
      beginExpressionIntroBeforeIndex(targetIdx);
      return;
    }
    firstQuestionMicGateArmedRef.current = true;
    resetFirstQuestionRetryState();
    pendingFirstExpressionIndexRef.current = null;
    setPendingExpressionIntroIndex(-1);
    if (targetIdx >= 0) {
      updateCurrentQuestionIndex(targetIdx);
    }
  }

  function finishExpressionIntroVideo() {
    setExpIntroVideoComplete(true);
    firstQuestionMicGateArmedRef.current = true;
    resetFirstQuestionRetryState();
    var targetIdx = pendingExpressionIntroIndex;
    if (targetIdx < 0) {
      targetIdx = pendingFirstExpressionIndexRef.current;
    }
    if (targetIdx == null || targetIdx < 0) {
      targetIdx = findFirstExpressionQuestionIndex();
    }
    pendingFirstExpressionIndexRef.current = null;
    setPendingExpressionIntroIndex(-1);
    if (targetIdx >= 0) {
      updateCurrentQuestionIndex(targetIdx);
    }
  }

  /** Start continuous MP3 capture at first expression question (not during comprehension). */
  async function ensureExpressionPhaseRecording() {
    if (!permission || !voiceIdentifierConfirmed) return false;
    if (expressionPhaseRecordingStartedRef.current) {
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
      const started = await SessionRecorder.startContinuousRecording();
      if (started) {
        expressionPhaseRecordingStartedRef.current = true;
        setSessionRecordingStarted(true);
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
        } else if (window.SeeAndSayTestSession && window.SeeAndSayTestSession.resetPendingTestId) {
          window.SeeAndSayTestSession.resetPendingTestId();
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

    endExpressionAnswerRecordingCapture();

    setExpressionTrafficSubmitted(true);
    setExpressionAdvanceLock(true);
    playTrafficFeedback(result);
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);

    // All traffic options advance to next question; midFailure is display-only and still counts as failure in flow.
    handleContinue(result);
    trafficChoiceInProgressRef.current = false;
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
      window.SeeAndSayTestRun &&
      typeof window.SeeAndSayTestRun.hasInProgressTestState === "function" &&
      window.SeeAndSayTestRun.hasInProgressTestState()
    ) {
      setForceFreshStartAfterMicCheck(false);
      return;
    }
    if (window.SeeAndSayTestSession && window.SeeAndSayTestSession.beginNewTestSessionIdentity) {
      window.SeeAndSayTestSession.beginNewTestSessionIdentity();
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

  // Pause test
  const pauseTest = function () {
    if (isPaused) return;

    stopAllQuestionPlayback();

    setIsPaused(true);

    // Pause recording if active
    if (permission && sessionRecordingStarted) {
      SessionRecorder.pauseRecording();
    }

    // Stop AFK timers
    stopAfkTimer();

    console.log("⏸️ Test paused");
  };

  // Resume test
  const resumeTest = async function () {
    if (!isPaused) return;

    // Resume recording if active (do this BEFORE setting isPaused to false)
    if (permission && sessionRecordingStarted) {
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
    if (window.SeeAndSayTestRun && window.SeeAndSayTestRun.setResumeBlockedAfterDataLoss) {
      window.SeeAndSayTestRun.setResumeBlockedAfterDataLoss(true);
    }
    if (window.SeeAndSayTestRun && window.SeeAndSayTestRun.clearStoredTestRunKeepChildProfile) {
      window.SeeAndSayTestRun.clearStoredTestRunKeepChildProfile();
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

  function shouldShowIncompleteSummaryBeforeFinish(results) {
    if (!questions.length) return false;
    var rows = results || questionResults;
    var idx = getSafeCurrentQuestionIndex();
    var currentQ = idx >= 0 ? questions[idx] : null;
    var qType = currentQ ? getQuestionTypeLabel(currentQ) : null;
    if (qType === "expression") {
      var exprTotal = countQuestionsByType("expression");
      var exprAnswered = countAnsweredByType(rows, "expression");
      return exprTotal > 0 && exprAnswered < exprTotal;
    }
    return countUniqueQuestionsAnswered(rows) < questions.length;
  }

  function requestCompleteSessionOrConfirm(results) {
    var rows = results || questionResults;
    if (shouldShowIncompleteSummaryBeforeFinish(rows)) {
      if (results) {
        setQuestionResults(results);
      }
      setIncompleteSummaryConfirmOpen(true);
      return;
    }
    completeSession(results);
  }

  function requestFinishTest() {
    if (sessionCompleted) return;
    if (questions.length === 0) {
      completeSession(questionResults);
      return;
    }
    requestCompleteSessionOrConfirm(questionResults);
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
              // Partial: X→1→2 or 1→X→2 (correct last tap on expSecond).
              var fourUpThirdTapPartial =
                imgIndex === expSecond &&
                (b4 === expFirst || a4 === expFirst);
              if (fourUpThirdTapPartial) {
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
        requestCompleteSessionOrConfirm(updatedQuestionResults);
        return;
      }
      if (consecutiveCompFailRef.current >= 2) {
        var firstExprIdx = findFirstExpressionQuestionIndex();
        consecutiveCompFailRef.current = 0;
        if (firstExprIdx >= 0 && currentIdx < firstExprIdx) {
          if (tryGateExpressionMicCheckBeforeNavigatingTo(firstExprIdx)) return;
          if (tryDeferExpressionIntroBeforeNavigatingTo(firstExprIdx)) return;
          updateCurrentQuestionIndex(firstExprIdx);
          return;
        }
      }
      // Last question in the CSV flow — still confirm if expression section is incomplete.
      if (currentIdx >= questions.length - 1) {
        requestCompleteSessionOrConfirm(updatedQuestionResults);
        return;
      }
      if (currentIdx < questions.length - 1) {
        var nextIdx = currentIdx + 1;
        var firstExprForAdvance = findFirstExpressionQuestionIndex();
        if (
          firstExprForAdvance >= 0 &&
          nextIdx >= firstExprForAdvance &&
          currentIdx < firstExprForAdvance &&
          tryGateExpressionMicCheckBeforeNavigatingTo(nextIdx)
        ) {
          return;
        }
        if (
          firstExprForAdvance >= 0 &&
          nextIdx >= firstExprForAdvance &&
          currentIdx < firstExprForAdvance &&
          tryDeferExpressionIntroBeforeNavigatingTo(nextIdx)
        ) {
          return;
        }
        updateCurrentQuestionIndex(nextIdx);
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
          requestCompleteSessionOrConfirm(updatedQuestionResults);
        } else {
          setIncompleteSummaryConfirmOpen(true);
          if (updatedQuestionResults) {
            setQuestionResults(updatedQuestionResults);
          }
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
    if (currentQ.query_type !== "הבעה") return;
    clearExpressionAnswerEndTimer();
    SessionRecorder.markQuestionEnd(currentQ.query_number);
    endExpressionAnswerRecordingCapture();
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

    clearExpressionAnswerEndTimer();
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
      audio.onended = function () {
        setIsAudioPlaying(false);
        if (q.query_type === "הבעה") {
          markExpressionTimestampAndArm(q);
        }
      };
      audio.onerror = function () {
        console.warn('Audio file not found for question:', q.query_number);
        if (q.query_type === "הבעה") {
          markExpressionTimestampAndArm(q);
        }
      };
      questionAudioRef.current = audio;
      setQuestionAudio(audio);
      // Autoplay runs in autoplayQuestionAudioAfterImagesReady once photos + loading gate clear.
      if (q.query_type !== "הבעה" || (micCheckPassed && expIntroVideoComplete)) {
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
    var pendingId = null;
    try {
      pendingId = sessionStorage.getItem("seeandsayPendingTestId");
    } catch (e) {}
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

  function handleLevelCompletion() {
    // Simplified: just complete the session
    completeSession();
  }
  function completeSession(updatedQuestionResults) {
    // If test is paused, unpause it first
    if (isPaused) {
      setIsPaused(false);
    }

    markCurrentQuestionEndTimestamp();

    expressionAnswerCaptureActiveRef.current = false;
    if (typeof SessionRecorder !== "undefined" && SessionRecorder.pauseRecordingIfActive) {
      SessionRecorder.pauseRecordingIfActive();
    }

    stopQuestionAudioForSessionComplete();

    setImages([]);
    setExpressionAiResult(null);
    setExpressionAiLoading(false);
    setTestUploadError(null);
    setExpressionAiPollError(null);
    expressionAiPollStartedRef.current = Date.now();
    consecutiveCompFailRef.current = 0;
    consecutiveExprFailRef.current = 0;

    var resultsForFinish = updatedQuestionResults || questionResults;
    pendingCompleteSessionResultsRef.current = resultsForFinish;

    var handleUploadResult = function (result) {
      if (!result || result.success === false) {
        setTestUploadState("failed");
        setTestUploadError(
          (result && result.error) ? String(result.error) : (lang === "en" ? "Upload failed" : "העלאת הנתונים נכשלה")
        );
        console.error("[completeSession] test upload failed:", result);
        return;
      }
      setTestUploadState("ok");
      setTestUploadError(null);
      if (result.transcription) {
        setTranscription(result.transcription);
      }
      if (result.test_id) {
        setLastCompletedTestId(result.test_id);
        console.log("[completeSession] test_id for AI polling:", result.test_id);
      }
      if (result.expression_ai) {
        setExpressionAiResult(result.expression_ai);
      }
    };

    function seedLocalExpressionUploadPhase(phaseKey) {
      setExpressionAiResult({
        status: "pending",
        meta: {
          progress: {
            phase: phaseKey,
            processed_questions: 0,
            total_questions: 0,
            last_updated_at: new Date().toISOString(),
          },
        },
        expressive_language_impression: { status: "pending" },
      });
    }

    async function uploadSessionResults(finalBlob, timestampText, fullArray) {
      var testId =
        typeof ensurePendingTestId === "function" ? ensurePendingTestId() : "test-" + Date.now();

      if (typeof prepareAudioUpload === "function" && typeof putSessionAudioToBlob === "function") {
        setTestUploadState("uploading_blob");
        seedLocalExpressionUploadPhase("uploading_audio");
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("seeandsayPendingBlobUploaded", "0");
          }
        } catch (ssErr) {}

        var prep = await prepareAudioUpload(idDigits, testId);
        if (!prep || prep.success === false) {
          throw new Error((prep && prep.error) || "prepareUpload failed");
        }

        var putResult = await putSessionAudioToBlob(prep.uploadUrl, finalBlob);
        if (!putResult || putResult.success === false) {
          throw new Error((putResult && putResult.error) || "Blob upload failed");
        }

        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("seeandsayPendingBlobUploaded", "1");
          }
        } catch (ssErr2) {}

        setTestUploadState("saving_metadata");
        seedLocalExpressionUploadPhase("saving_metadata");
        return await updateUserTests(
          idDigits,
          ageYears,
          ageMonths,
          fullArray,
          correctAnswers,
          partialAnswers,
          wrongAnswers,
          null,
          timestampText,
          childGender,
          prep.blobPath,
          testId
        );
      }

      setTestUploadState("uploading");
      return await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = async function () {
          try {
            var legacyResult = await updateUserTests(
              idDigits,
              ageYears,
              ageMonths,
              fullArray,
              correctAnswers,
              partialAnswers,
              wrongAnswers,
              reader.result,
              timestampText,
              childGender,
              null,
              testId
            );
            resolve(legacyResult);
          } catch (legacyErr) {
            reject(legacyErr);
          }
        };
        reader.onerror = function () {
          reject(new Error("Failed to read recording for upload"));
        };
        reader.readAsDataURL(finalBlob);
      });
    }

    async function runRecordingFinishPipeline() {
      var fullArray = formatQuestionResultsArray(resultsForFinish);
      setTestUploadState("preparing_recording");

      if (typeof SessionRecorder !== "undefined" && SessionRecorder.stopContinuousRecording) {
        SessionRecorder.stopContinuousRecording();
      }
      expressionPhaseRecordingStartedRef.current = false;

      var waitMs = 120000;
      if (typeof SessionRecorder !== "undefined" && SessionRecorder.getConversionWaitMs) {
        waitMs = SessionRecorder.getConversionWaitMs();
      }
      console.log("🛑 Waiting for session recording (up to " + Math.round(waitMs / 1000) + "s)...");

      try {
        if (typeof SessionRecorder === "undefined" || !SessionRecorder.whenFinalBlobReady) {
          throw new Error("SessionRecorder is not available");
        }

        var data = await SessionRecorder.whenFinalBlobReady({ timeoutMs: waitMs });
        if (!data || !data.recordingBlob) {
          throw new Error("Recording file is not available after preparation");
        }

        if (SessionRecorder.setFinalRecordingBlob) {
          SessionRecorder.setFinalRecordingBlob(data.recordingBlob, {
            mimeType: data.mimeType || "audio/mpeg",
            timestamp: data.recordingDate || Date.now(),
          });
        }
        var recordingUrl = URL.createObjectURL(data.recordingBlob);
        localStorage.setItem("sessionRecordingUrl", recordingUrl);
        setSessionCompleted(true);

        var uploadResult = await uploadSessionResults(
          data.recordingBlob,
          data.timestampText,
          fullArray
        );
        handleUploadResult(uploadResult);
      } catch (prepErr) {
        console.error("[completeSession] recording prepare/upload failed:", prepErr);
        setSessionCompleted(true);
        setTestUploadState("failed");
        var prepMsg =
          lang === "en"
            ? "Could not prepare the session recording. Wait a moment, then tap Retry."
            : "לא ניתן להכין את הקלטת המבחן. המתינו רגע ולחצו על ניסיון חוזר.";
        if (prepErr && prepErr.message) {
          prepMsg += " (" + prepErr.message + ")";
        }
        setTestUploadError(prepMsg);
      }
    }

    async function retryRecordingUpload() {
      var results = pendingCompleteSessionResultsRef.current || questionResults;
      pendingCompleteSessionResultsRef.current = results;
      setTestUploadError(null);
      await runRecordingFinishPipeline();
    }
    retryRecordingUploadRef.current = retryRecordingUpload;

    // Stop continuous session recording and send data to backend
    if (sessionRecordingStarted && permission) {
      runRecordingFinishPipeline();
    } else {
      setTestUploadState("uploading");
      // No recording, show completion and send immediately
      expressionPhaseRecordingStartedRef.current = false;
      setSessionCompleted(true);
      const fullArray = formatQuestionResultsArray(resultsForFinish);
      updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
        null, null, childGender).then(function(result) {
          handleUploadResult(result);
        }).catch(function(err) {
          console.error("updateUserTests (no recording):", err);
          handleUploadResult({
            success: false,
            error: err && err.message ? err.message : String(err),
          });
        }); //MongoDB
    }
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

  React.useEffect(function pollExpressionAiWhilePending() {
    if (!sessionCompleted) return;
    if (!lastCompletedTestId) return;
    var status = expressionAiResult && expressionAiResult.status;
    if (status === "done" || status === "failed") return;

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
  }, [sessionCompleted, lastCompletedTestId, expressionAiResult, refreshExpressionAiStatus]);

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

  function renderExpressionRefreshRecoveryModal() {
    if (!expressionRefreshRecovery) return null;
    if (!isPastMicCheckAndInExpressionPhase()) return null;
    var isForce = expressionRefreshRecovery === "forceHome";
    var title = isForce
      ? (lang === "en" ? "Session data lost" : "נתוני המשחק אבדו")
      : (lang === "en" ? "Expression recording lost" : "הקלטת ההבעה אבדה");
    var body = isForce
      ? (lang === "en"
        ? "After refreshing the page, comprehension progress could not be restored. Please start a new game from the home screen. You will not be able to continue from your last saved point."
        : "לאחר רענון הדף לא ניתן לשחזר את התקדמות הבנה. יש להתחיל משחק חדש ממסך הבית. לא תהיה אפשרות להמשיך מהנקודה האחרונה שנשמרה.")
      : (lang === "en"
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
                onClick: finishExpressionRefreshForceHome,
                style: { width: "100%", maxWidth: 320 },
              },
              lang === "en" ? "Back to home" : "חזרה לדף הבית"
            )
          : React.createElement(
              "div",
              { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" } },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "continue-button",
                  onClick: restartExpressionAfterRefresh,
                  style: { minWidth: 140 },
                },
                lang === "en" ? "Restart expression" : "התחלת הבעה מחדש"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: finishExpressionRefreshChoiceHome,
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
                lang === "en" ? "Home" : "דף הבית"
              )
            )
      )
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

  if (isExpressionMicCheckGateActive()) {
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
                onClick: continueFromExpressionMicCheck
              },
              tr("test.mic.check.continue")
            )
          : null
      )
    );
  }

  if (voiceIdentifierConfirmed && !comprIntroVideoComplete && !sessionCompleted) {
    return React.createElement(
      "section",
      { className: "test-screen test-screen--comp-intro" },
      React.createElement("video", {
        ref: comprIntroVideoRef,
        className:
          "test-comp-intro__video" +
          (comprIntroVideoSources.isFallback ? " test-avatar-intro__video--solid-bg" : ""),
        src: comprIntroVideoSources.src,
        autoPlay: true,
        playsInline: true,
        preload: "auto",
        onEnded: finishComprehensionIntroVideo,
        onError: handleComprIntroVideoError,
      })
    );
  }

  if (
    !sessionCompleted &&
    !expIntroVideoComplete &&
    pendingExpressionIntroIndex >= 0 &&
    (micCheckPassed || microphoneSkipped)
  ) {
    return React.createElement(
      "section",
      { className: "test-screen test-screen--exp-intro" },
      React.createElement("video", {
        ref: expIntroVideoRef,
        className:
          "test-exp-intro__video" +
          (expIntroVideoSources.isFallback ? " test-avatar-intro__video--solid-bg" : ""),
        src: expIntroVideoSources.src,
        autoPlay: true,
        playsInline: true,
        preload: "auto",
        onEnded: finishExpressionIntroVideo,
        onError: handleExpIntroVideoError,
      })
    );
  }

  if (testUploadState === "preparing_recording") {
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
      React.createElement("div", {
        className: "kicker",
        style: { marginBottom: 12, fontSize: 18, fontWeight: 700, color: "#304348" },
      }, lang === "en" ? "Preparing recording…" : "מכין הקלטה…"),
      React.createElement("p", {
        className: "muted",
        style: { maxWidth: 420, lineHeight: 1.5, margin: 0 },
      }, lang === "en"
        ? "Please keep this page open. Longer sessions may take up to " + prepWaitSec + " seconds."
        : "אנא השאירו את הדף פתוח. מבחנים ארוכים עשויים לקחת עד " + prepWaitSec + " שניות.")
    );
  }

  if (sessionCompleted) {
    const totalAnswered = correctAnswers + partialAnswers + wrongAnswers;
    const hasSessionRecording = !!(permission && sessionRecordingStarted);
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
    const testUploadInProgress =
      sessionCompleted &&
      (testUploadState === "uploading" ||
        testUploadState === "uploading_blob" ||
        testUploadState === "saving_metadata" ||
        testUploadState === "preparing_recording");
    const testUploadFailed = sessionCompleted && testUploadState === "failed";
    const expressionFeedbackPending =
      hasExpressionQuestions &&
      !testUploadFailed &&
      (testUploadInProgress ||
        (lastCompletedTestId &&
          (!expressionAiResult ||
            expressionAiStatus === "pending" ||
            expressionAiLoading)));
    const expressionAiFailed =
      hasExpressionQuestions &&
      lastCompletedTestId &&
      expressionAiStatus === "failed";
    const expressionAiProgress = expressionAiResult && expressionAiResult.meta && expressionAiResult.meta.progress
      ? expressionAiResult.meta.progress
      : null;
    const expressionAiProcessed = expressionAiProgress && typeof expressionAiProgress.processed_questions === "number"
      ? expressionAiProgress.processed_questions
      : 0;
    const expressionAiTotal = expressionAiProgress && typeof expressionAiProgress.total_questions === "number"
      ? expressionAiProgress.total_questions
      : exprStats.total;
    const expressionAiPhase = expressionAiProgress && expressionAiProgress.phase
      ? String(expressionAiProgress.phase)
      : "pending";
    function expressionPhaseLabel(phaseKey) {
      if (lang === "en") {
        if (phaseKey === "queued") return "Feedback generation will start shortly";
        if (phaseKey === "processing_started") return "Started";
        if (phaseKey === "preparing_audio") return "Processing audio";
        if (phaseKey === "scoring_questions") return "Scoring questions";
        if (phaseKey === "uploading_audio") return "Uploading recording to cloud";
        if (phaseKey === "saving_metadata") return "Saving test results";
        if (phaseKey === "awaiting_audio") return "Waiting for recording in cloud";
        if (phaseKey === "building_impression") return "Building summary";
        if (phaseKey === "done") return "Done";
        if (phaseKey === "failed") return "Failed";
        return "Pending";
      }
      if (phaseKey === "queued") return "יצירת המשוב תתחיל בקרוב";
      if (phaseKey === "uploading_audio") return "מעלה הקלטה לענן…";
      if (phaseKey === "saving_metadata") return "שומר נתוני מבחן…";
      if (phaseKey === "awaiting_audio") return "ממתין להקלטה בענן…";
      if (phaseKey === "processing_started") return "התחיל עיבוד";
      if (phaseKey === "preparing_audio") return "מעבד שמע";
      if (phaseKey === "scoring_questions") return "מחשב ציונים";
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

    // Download recording function
    const downloadRecording = function () {
      // Use synchronous version since we're in a synchronous context
      const recordingUrl = SessionRecorder.getFinalRecordingUrlSync();
      if (recordingUrl) {
        const a = document.createElement("a");
        a.href = recordingUrl;
        // Get the file extension (.mp3)
        const fileExt = SessionRecorder.getCurrentFileExtension();
        a.download = "session_recording_" + idDigits + "_" + Date.now() + fileExt;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("📥 Downloaded session recording as MP3");
      } else {
        alert("No recording available to download");
      }
    };

    // Download timestamp file function (enhanced with question results and transcription)
    const downloadTimestamps = function () {
      // Get timestamp text from SessionRecorder
      const timestampText = SessionRecorder.getTimestampText();
      
      // Format question results array
      const questionResultsText = formatQuestionResultsArray(questionResults);
      
      // Build the complete text file content
      let fileContent = "";
      
      // Add timestamps section
      fileContent += "=== Question Timestamps ===\n";
      fileContent += timestampText + "\n\n";
      
      // Add question results section
      fileContent += "=== Question Results ===\n";
      fileContent += "Format: [(questionNumber,\"result\"), ...]\n";
      fileContent += "Results: correct, partly, wrong\n";
      fileContent += questionResultsText + "\n\n";
      
      // Add transcription section if available
      if (transcription) {
        fileContent += "=== Transcription ===\n";
        fileContent += transcription + "\n";
      } else {
        fileContent += "=== Transcription ===\n";
        fileContent += "Transcription not available yet.\n";
      }
      
      // Create and download the file
      const blob = new Blob([fileContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = "session_data_" + idDigits + "_" + Date.now() + ".txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("📥 Downloaded session data file with timestamps, results, and transcription");
    };

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
      hasExpressionQuestions && testUploadInProgress
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #d5dbe3",
                background: "#f5f7fa",
                color: "#34495e",
                fontSize: "14px"
              }
            },
            lang === "en"
              ? testUploadState === "preparing_recording"
                ? "Preparing recording…"
                : testUploadState === "uploading_blob"
                  ? "Uploading recording to cloud…"
                  : testUploadState === "saving_metadata"
                    ? "Saving test results…"
                    : "Uploading recording and results…"
              : testUploadState === "preparing_recording"
                ? "מכין הקלטה…"
                : testUploadState === "uploading_blob"
                  ? "מעלה הקלטה לענן…"
                  : testUploadState === "saving_metadata"
                    ? "שומר נתוני מבחן…"
                    : "מעלה את ההקלטה והתוצאות…"
          )
        : null,
      hasExpressionQuestions && testUploadFailed
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e8b4b8",
                background: "#fff5f5",
                color: "#8b3a3a",
                fontSize: "14px",
                lineHeight: 1.4
              }
            },
            lang === "en" ? "Upload failed." : "העלאת הנתונים נכשלה.",
            testUploadError
              ? React.createElement("div", { style: { marginTop: "6px", fontSize: "12px", opacity: 0.9 } }, testUploadError)
              : null,
            hasSessionRecording
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "btn",
                    style: { marginTop: "10px" },
                    onClick: function () {
                      if (retryRecordingUploadRef.current) {
                        retryRecordingUploadRef.current();
                      }
                    },
                  },
                  lang === "en" ? "Retry recording upload" : "נסה שוב להעלות הקלטה"
                )
              : null,
            React.createElement(
              "button",
              {
                type: "button",
                className: "btn",
                style: { marginTop: "10px" },
                onClick: function () {
                  tryRecoverSavedTest();
                },
              },
              lang === "en" ? "Check if test was saved" : "בדוק אם המבחן נשמר"
            )
          )
        : null,
      hasExpressionQuestions && expressionAiFailed
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                textAlign: "center",
                width: "min(100%, 560px)",
                marginLeft: "auto",
                marginRight: "auto",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e8b4b8",
                background: "#fff5f5",
                color: "#8b3a3a",
                fontSize: "14px",
                lineHeight: 1.4
              }
            },
            lang === "en" ? "AI feedback could not be completed." : "לא ניתן היה להשלים את משוב הבעה.",
            expressionAiResult && expressionAiResult.error
              ? React.createElement("div", { style: { marginTop: "6px", fontSize: "12px" } }, String(expressionAiResult.error))
              : null,
            React.createElement(
              "button",
              {
                type: "button",
                disabled: expressionAiLoading,
                onClick: refreshExpressionAiStatus,
                style: {
                  marginTop: "8px",
                  padding: "8px 14px",
                  fontSize: "14px",
                  backgroundColor: expressionAiLoading ? "#9aa3b2" : "#6c8fb0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: expressionAiLoading ? "not-allowed" : "pointer"
                }
              },
              lang === "en" ? "Refresh AI status" : "רענון סטטוס AI"
            )
          )
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
                  ? ("Progress: " + expressionAiProcessed + "/" + expressionAiTotal + " questions")
                  : ("התקדמות: " + expressionAiProcessed + "/" + expressionAiTotal + " שאלות")
              ),
              expressionAiPollError
                ? React.createElement(
                    "div",
                    { style: { marginTop: "6px", fontSize: "13px", color: "#8b3a3a" } },
                    expressionAiPollError
                  )
                : null
            ),
            React.createElement(
              "button",
              {
                type: "button",
                disabled: expressionAiLoading,
                onClick: refreshExpressionAiStatus,
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
      React.Fragment,
      null,
      renderExpressionRefreshRecoveryModal(),
      React.createElement(
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
      )
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
    renderExpressionRefreshRecoveryModal(),

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
    // AFK Warning popup
    showAfkWarning && !isPaused
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
          (usePhoneLikeGrid && currentImageCount === 3 ? " comprehension-container--three-up" : "") +
          (usePhoneLikeGrid && currentImageCount >= 4 ? " comprehension-container--two-col" : "")
      },
      (function () {
        const shouldUseThreeUp = usePhoneLikeGrid && currentImageCount === 3;
        const shouldUseFiveUp = usePhoneLikeGrid && currentImageCount === 5;
        const shouldUseTwoColumnGrid = usePhoneLikeGrid && currentImageCount >= 4;
        const shouldUseSingleColumn = usePhoneLikeGrid && currentImageCount === 2;

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

        if (!usePhoneLikeGrid && isTwoRow) {
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
        const shouldUseSingleColumn = usePhoneLikeGrid && currentImageCount === 2;
        const shouldUseThreeUp = usePhoneLikeGrid && currentImageCount === 3;
        const shouldUseFiveUp = usePhoneLikeGrid && currentImageCount === 5;
        const shouldUseTwoColumnGrid = usePhoneLikeGrid && currentImageCount >= 4;

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