function Test({ allQuestions, lang, t, onHome, onReset, setLang, onTestPhase }) {
  const PRIVACY_POLICY_URL = "https://www.heb.linkcaring.com/privacy-policy";
  const TERMS_OF_USE_URL = "https://www.heb.linkcaring.com/terms-of-use";
  const tr = function (key, vars) {
    return t ? t(key, vars) : key;
  };

  const [trafficPopupOpen, setTrafficPopupOpen] = React.useState(false);
  const [trafficPopupChoice, setTrafficPopupChoice] = React.useState(null); // "success" | "partial" | "failure" | null
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
  // Track full array of question results: [{questionNumber, result}, ...]
  const [questionResults, setQuestionResults] = usePersistentState("questionResults", []);

  // Transcription state
  const [transcription, setTranscription] = React.useState(null);

  // Microphone persistent
  const [permission, setPermission] = usePersistentState("permission", false);
  const [microphoneSkipped, setMicrophoneSkipped] = usePersistentState("microphoneSkipped", false);
  const [voiceIdentifierConfirmed, setVoiceIdentifierConfirmed] = usePersistentState("voiceIdentifierConfirmed", false);

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

  // Session-only states
  const [images, setImages] = React.useState([]);
  const [target, setTarget] = React.useState("");
  const [showContinue, setShowContinue] = React.useState(false);
  const [clickedCorrect, setClickedCorrect] = React.useState(false);
  const [fireworksVisible, setFireworksVisible] = React.useState(false);
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
  /** Ordered (2-step): one rescue tap on correct second image after wrong path or duplicate correct-first. */
  const orderedRescueActiveRef = React.useRef(false);
  const orderedRescueTargetRef = React.useRef(null); // 1-based image index
  const [incompleteSummaryConfirmOpen, setIncompleteSummaryConfirmOpen] = React.useState(false);

  function registerHintOpened() {
    hintEverOpenedRef.current = true;
    setHintWasUsedThisQuestion(true);
  }

  function openHintProgrammatic() {
    registerHintOpened();
    setShowHint(true);
  }

  // Continuous recording state (persistent so it survives refresh)
  const [sessionRecordingStarted, setSessionRecordingStarted] = usePersistentState("sessionRecordingStarted", false);

  // Pause state (persistent)
  const [isPaused, setIsPaused] = usePersistentState("testPaused", false);

  // AFK timer states
  const [afkTimerActive, setAfkTimerActive] = React.useState(false);
  const [showAfkWarning, setShowAfkWarning] = React.useState(false);
  const afkTimerRef = React.useRef(null);
  const afkWarningTimerRef = React.useRef(null);
  const dobInputRef = React.useRef(null);

  // Image loading state
  const [currentQuestionImagesLoaded, setCurrentQuestionImagesLoaded] = React.useState(false);

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

  function getImageFallbackUrls(url) {
    if (!url) return [];
    if (/\.png$/i.test(url)) {
      return [url, url.replace(/\.png$/i, ".webp")];
    }
    if (/\.webp$/i.test(url)) {
      return [url.replace(/\.webp$/i, ".png"), url];
    }
    return [url];
  }

  function handleImageFallbackError(event) {
    const imgEl = event && event.currentTarget;
    if (!imgEl) return;
    const baseSrc = imgEl.getAttribute("data-base-src") || imgEl.getAttribute("src") || "";
    const candidates = getImageFallbackUrls(baseSrc);
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
    };
  }, []);

  //question audio states
  const [questionAudio, setQuestionAudio] = React.useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = React.useState(false);

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


  // evaulation enabling effect - enables the traffic light popup after 15 seconds 
  React.useEffect(function () {
  if (sessionCompleted || questionType !== "E") {
    setEvaluationEnabled(false);
    return;
  }

  setEvaluationEnabled(false);

  const timer = setTimeout(function () {
    setEvaluationEnabled(true);
  }, 15000);

  return function () {
    clearTimeout(timer);
  };
}, [currentIndex, questionType, sessionCompleted]);

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
          updateCurrentQuestionIndex(prevIdx => {
            if (prevIdx < questions.length - 1) {
              return prevIdx + 1;
            }
            return prevIdx;
          });
        } else if (event.key === "ArrowLeft") {
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
  }, [devMode, devJumpValue, questions.length]);



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

  function getQuestionTypeLabel(q) {
    if (!q) return "comprehension";
    return q.query_type === "הבנה" ? "comprehension" : "expression";
  }

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================
  async function confirmAge() {
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

    var skipMicUrl = false;
    try {
      skipMicUrl = new URLSearchParams(window.location.search).get("skipMic") === "1";
    } catch (e) {
      skipMicUrl = false;
    }

    if (skipReading || skipMicUrl) {
      setMicrophoneSkipped(true);
      setPermission(false);
      prepareDirectTestFlowNoSeparateReading();
      setAgeConfirmed(true);
      createUser(internalUserId, String(childName).trim() || "SomeUserName");
      return;
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
      setPermission(true);
      setMicrophoneSkipped(false);
    } catch (err) {
      alert(err && err.message ? err.message : String(err));
      return;
    }

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
        console.log("✅ Microphone permission granted");
      } catch (err) {
        alert(err.message);
      }
    } else alert(tr("test.mic.unsupported"));
  };

  const skipMicrophone = function () {
    // Even if skipping recording, mark that user interacted with microphone prompt
    setMicrophoneSkipped(true);
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
            var preserveQuestionTimestamps = (function () {
              try {
                var qt = localStorage.getItem("questionTimestamps");
                if (!qt || qt === "[]") return false;
                var arr = JSON.parse(qt);
                return Array.isArray(arr) && arr.length > 0;
              } catch (e) {
                return false;
              }
            })();

            SessionRecorder.cleanup({ preserveQuestionTimestamps: preserveQuestionTimestamps });
            if (!preserveQuestionTimestamps) {
              SessionRecorder.resetTimestamps();
            }

            const started = await SessionRecorder.startContinuousRecording({
              preserveQuestionTimestamps: preserveQuestionTimestamps
            });
            if (started) {
              setSessionRecordingStarted(true);
              console.log("✅ Started test recording after voice step");

              if (!preserveQuestionTimestamps) {
                setTimeout(function () {
                  if (questions.length > 0) {
                    const firstQuestion = questions[0];
                    if (firstQuestion) {
                      SessionRecorder.markQuestionStart(firstQuestion.query_number);
                      console.log("📝 Marked question 1 start at test start");
                    }
                  }
                }, 100);
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
    if (!voiceIdentifierConfirmed) return;
    if (questions.length === 0) return;

    var SR = window.SessionRecorder;
    if (!SR || typeof SR.startContinuousRecording !== "function") return;

    var recordingLive = SR.isRecordingActive && SR.isRecordingActive();
    if (!sessionRecordingStarted && recordingLive) {
      setSessionRecordingStarted(true);
      return;
    }
    if (sessionRecordingStarted && !recordingLive) {
      setSessionRecordingStarted(false);
      return;
    }
    if (sessionRecordingStarted && recordingLive) return;

    var cancelled = false;
    (async function () {
      try {
        var started = await SR.startContinuousRecording();
        if (cancelled) return;
        if (started) {
          setSessionRecordingStarted(true);
          console.log("✅ Session recording started (direct flow after age)");
          setTimeout(function () {
            if (cancelled) return;
            var first = questions[0];
            if (first && SR.markQuestionStart) {
              SR.markQuestionStart(first.query_number);
            }
          }, 100);
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
  }, [ageConfirmed, sessionCompleted, permission, microphoneSkipped, voiceIdentifierConfirmed, sessionRecordingStarted, questions]);

  // Expression only: auto-open traffic popup after showContinue (comprehension scores without popup)
  React.useEffect(function () {
    if (sessionCompleted || isPaused) {
      setTrafficPopupOpen(false);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = false;
      return;
    }

    if (showContinue && questionType === "E") {
      setTrafficPopupOpen(true);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = true;
      return;
    }

    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    trafficPopupJustOpenedRef.current = false;
  }, [showContinue, questionType, sessionCompleted, isPaused, currentIndex]);

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
    if (fireworksTimerRef.current) { clearTimeout(fireworksTimerRef.current); fireworksTimerRef.current = null; }
    setFireworksVisible(false);
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

    if (fireworksTimerRef.current) { clearTimeout(fireworksTimerRef.current); fireworksTimerRef.current = null; }
    setFireworksVisible(false);
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
  const fireworksTimerRef = React.useRef(null);

  function handleTrafficPopupChoice(result) {
    // Prevent double-invocation (double-click)
    if (trafficChoiceInProgressRef.current) return;
    trafficChoiceInProgressRef.current = true;

    playTrafficFeedback(result);
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);

    // All three buttons (green/orange/red) advance to next question
    handleContinue(result);
    trafficChoiceInProgressRef.current = false;
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


  const playQuestionAudio = function () {
    if (questionAudio) {
      questionAudio.currentTime = 0;
      questionAudio.play();
      setIsAudioPlaying(true);
    }
  };

  const replayQuestionAudio = function () {
    playQuestionAudio();
  };

  // =============================================================================
  // PAUSE/RESUME AND AFK TIMER FUNCTIONS
  // =============================================================================

  // Pause test
  const pauseTest = function () {
    if (isPaused) return;

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

  function finalizeComprehensionResult(result) {
    if (comprehensionAdvanceLockRef.current) return;
    comprehensionAdvanceLockRef.current = true;
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
    var n = questions.length;
    if (n === 0) {
      completeSession(questionResults);
      return;
    }
    if (countUniqueQuestionsAnswered(questionResults) < n) {
      setIncompleteSummaryConfirmOpen(true);
    } else {
      completeSession(questionResults);
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
            if (!hintUsedSingle) {
              openHintProgrammatic();
            }
          } else {
            singleComprehensionRetryRef.current = false;
            finalizeComprehensionResult("failure");
          }
        }
      } else if (answerType === "multi") {
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

        /* Stop after x+1 attempts without a full pass (x = min correct picks). Still allow scoring when all correct on that same click. */
        const attemptLimit = correctTargetCount + 1;
        if (isNowCorrect || nextAttempts >= attemptLimit) {
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
      if (result === "success") {
        resultString = "correct";
      } else if (result === "partial") {
        resultString = "partly";
      } else if (result === "failure") {
        resultString = "wrong";
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
          questionType: questionTypeLabel
        }]);

        setQuestionResults(updatedQuestionResults);
        console.log("Recorded result for question", questionNumber, ":", resultString);
      }
    }

    // All results (success, partial, failure) advance to the next question
    if (currentIdx < questions.length - 1) {
      updateCurrentQuestionIndex(currentIdx + 1);
    } else {
      var answeredCount = dedupeQuestionResultsKeepLastAttempt(updatedQuestionResults).length;
      if (answeredCount >= questions.length) {
        completeSession(updatedQuestionResults);
      } else {
        setIncompleteSummaryConfirmOpen(true);
      }
    }
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
    const ageGroupOrder = ["2:00-2:06", "2:07-3:00", "3:00-4:00", "4:00-5:00", "5:00-6:00"];

    const filtered = allQuestions
      .filter(function (q) {
        return q && q.query && q.query_type && q.age_group;
      })
      .map(function (q) {
        return {
          ...q,
          query_type: q.query_type.trim().normalize("NFC"),
          age_group: q.age_group.trim().normalize("NFC"),
          query: (q.query || "").trim(),
          comments: (q.comments || "").trim(), // Preserve comments field
        };
      });

    // Sort by age group first (using predefined order), then by question number
    const sorted = filtered.sort(function (a, b) {
      const ageGroupA = ageGroupOrder.indexOf(a.age_group);
      const ageGroupB = ageGroupOrder.indexOf(b.age_group);

      if (ageGroupA !== ageGroupB) {
        return ageGroupA - ageGroupB;
      }

      // Within same age group, sort by query_number
      const numA = parseInt(a.query_number, 10) || 0;
      const numB = parseInt(b.query_number, 10) || 0;
      return numA - numB;
    });

    setQuestions(sorted);
  }

  function updateCurrentQuestionIndex(newIndex) {
    setCurrentIndex(newIndex);
  }

  function loadQuestion(index) {
    const q = questions[index];
    if (!q) return;

    // Mark question start timestamp for recording
    // Skip question 1 here as it will be marked when test starts
    if ((permission || microphoneSkipped) && voiceIdentifierConfirmed && index > 0) {
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

    const imgs = [];
    for (let i = 1; i <= imgCount; i++) {
      imgs.push(ImageLoader.getImageUrl(q.query_number, i));
    }

    // Parse answer field to determine answer type
    const answerStr = (q.answer || "").trim();

    if (answerStr === "A") {
      // Mask answer type: load A.png as mask (falls back to A.webp via getImageFallbackUrls)
      setAnswerType("mask");
      const maskUrl = "resources/test_assets/" + q.query_number + "/A.png";
      const maskUrlCandidates = getImageFallbackUrls(maskUrl);
      let maskUrlIdx = 0;

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
        maskUrlIdx += 1;
        if (maskUrlIdx < maskUrlCandidates.length) {
          mask.src = maskUrlCandidates[maskUrlIdx];
          return;
        }
        console.error('Failed to load mask image:', maskUrlCandidates[0]);
      };
      mask.src = maskUrlCandidates[0];

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
    if ((permission || microphoneSkipped) && voiceIdentifierConfirmed) { //check if the microphone permission stage is over
      //play the audio

      // Load and play question audio
      const audioUrl = "resources/questions_audio/audio_" + q.query_number + ".mp3";
      const audio = new Audio(audioUrl);
      audio.onended = function () {
        setIsAudioPlaying(false);
      };
      audio.onerror = function () {
        console.warn('Audio file not found for question:', q.query_number);
      };
      setQuestionAudio(audio);
      // Play audio automatically when question loads
      setTimeout(function () {
        audio.play().catch(function (err) {
          console.warn('Audio autoplay failed:', err);
        });
        setIsAudioPlaying(true);
      }, 100);
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

    if (!ensureSpeakerVerifiedBeforeFinish(resultsArg)) {
      return;
    }

    pendingCompleteAfterVerifyRef.current = null;
    setBlockFinishUntilVerifyOverlay(false);

    setImages([]);

    // Stop continuous session recording and send data to backend
    if (sessionRecordingStarted && permission) {
      SessionRecorder.stopContinuousRecording();
      console.log("🛑 Stopped session recording, waiting for MP3 conversion...");

      // Poll until recording is ready, then send to backend
      var pollAttempts = 0;
      var maxAttempts = 50; // Max 5 seconds (50 * 100ms)

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

            // Store final audio (combined or test-only) for download, then show completion screen
            const reader2 = new FileReader();
            reader2.onloadend = function () {
              const base64data = reader2.result;
              localStorage.setItem("sessionRecordingFinal", JSON.stringify({
                audio: base64data,
                mimeType: "audio/mpeg",
                timestamp: Date.now()
              }));
              const url = URL.createObjectURL(finalBlob);
              localStorage.setItem("sessionRecordingUrl", url);
              setSessionCompleted(true);
            };
            reader2.readAsDataURL(finalBlob);

            const reader = new FileReader();
            reader.onloadend = async function () {
              const fullArray = formatQuestionResultsArray(updatedQuestionResults);
              try {
                const result = await updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
                  reader.result, data.timestampText); //MongoDB
                if (result && result.transcription) {
                  setTranscription(result.transcription);
                }
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
            updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
              null, null).then(function(result) {
                if (result && result.transcription) {
                  setTranscription(result.transcription);
                }
              }).catch(function(err) {
                console.error("updateUserTests (no recording blob):", err);
              }); //MongoDB
          }
        }).catch(function (err) {
          console.error("❌ Error checking recording:", err);
          setSessionCompleted(true);
          const fullArray = formatQuestionResultsArray(updatedQuestionResults);
          updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
            null, null).then(function(result) {
              if (result && result.transcription) {
                setTranscription(result.transcription);
              }
            }).catch(function(err) {
              console.error("updateUserTests after recording error:", err);
            }); //MongoDB
        });
      };

      // Start polling after a small initial delay
      setTimeout(checkRecordingReady, 200);
    } else {
      // No recording, show completion and send immediately
      setSessionCompleted(true);
      const fullArray = formatQuestionResultsArray(updatedQuestionResults);
      updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
        null, null).then(function(result) {
          if (result && result.transcription) {
            setTranscription(result.transcription);
          }
        }).catch(function(err) {
          console.error("updateUserTests (no recording):", err);
        }); //MongoDB
    }
  }

  completeSessionRef.current = completeSession;

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
    const q = questions[getCurrentQuestionIndex()];
    if (!q) {
      setCurrentQuestionImagesLoaded(false);
      return;
    }

    const loaded = ImageLoader.areImagesLoaded(q.query_number, q.image_count);
    setCurrentQuestionImagesLoaded(loaded);
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
    [allQuestions, ageConfirmed]
  );

  // Load current question
  React.useEffect(
    function loadCurrentQuestion() {
      if (ageConfirmed && questions.length > 0 && !sessionCompleted) {
        const idx = getCurrentQuestionIndex();
        loadQuestion(idx);
        checkCurrentQuestionImages();
      }
    },
    [ageConfirmed, questions, currentIndex, sessionCompleted, voiceIdentifierConfirmed]
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


  // =============================================================================
  // RENDER
  // =============================================================================

  function TestNavbar() {
    const isRecording = permission && sessionRecordingStarted;
    const showControls = voiceIdentifierConfirmed && !sessionCompleted;
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
        showDev: true,
        showPause: showControls,
        isPaused: isPaused,
        pauseTest: pauseTest,
        resumeTest: resumeTest,
        devMode: devMode,
        setDevMode: setDevMode,
        isRecording: !!isRecording,
        currentQuestionIndex: getCurrentQuestionIndex(),
        totalQuestions: questions.length,
        onPrevQuestion: goToPreviousQuestion,
        onNextQuestion: function () {
        var currentIdx = getCurrentQuestionIndex();
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
            updateCurrentQuestionIndex(currentIdx + 1);
          },
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
    var hasExpressionHint = !!(hintText && hintText.trim() !== "");
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
           className: "question-bottom-actions__eval-btn question-bottom-actions__btn--plain" +     
           (evaluationEnabled ? " question-bottom-actions__eval-btn--signaled" : ""),
            onClick: function () { setTrafficPopupOpen(true); },
            disabled: trafficPopupOpen || showContinue,

            title: tr("test.evaluate.label"),
            "aria-label": tr("test.evaluate.label"),
          },
          React.createElement("span", { className: "question-bottom-actions__emoji" }, "🚦"),
          React.createElement("span", null, tr("test.evaluate.label"))
        )
      )
    );
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

  if (!ageConfirmed && !ageInvalid) {
    return React.createElement(
      "div",
      { className: "age-screen" },
      React.createElement("input", {
        type: "text",
        placeholder: tr("test.start.childName"),
        value: childName,
        onChange: function (e) {
          setChildName(e.target.value);
        },
      }),
      React.createElement(
        "select",
        {
          value: childGender,
          onChange: function (e) {
            setChildGender(e.target.value);
          }
        },
        React.createElement("option", { value: "", disabled: true }, tr("test.start.gender.placeholder")),
        React.createElement("option", { value: "female" }, tr("test.start.gender.female")),
        React.createElement("option", { value: "male" }, tr("test.start.gender.male"))
      ),
      React.createElement(
        "label",
        {
          className: "start-date-field",
          onClick: function () {
            if (!dobInputRef.current) return;
            try {
              if (typeof dobInputRef.current.showPicker === "function") {
                dobInputRef.current.showPicker();
              } else {
                dobInputRef.current.focus();
                dobInputRef.current.click();
              }
            } catch (err) {
              dobInputRef.current.focus();
              dobInputRef.current.click();
            }
          }
        },
        React.createElement("span", { className: "start-date-icon", "aria-hidden": true }, "📅"),
        React.createElement("span", { className: "start-date-value" }, formatDobDisplay(childDob)),
        React.createElement("input", {
          ref: dobInputRef,
          type: "date",
          value: childDob,
          "aria-label": tr("test.start.dob"),
          onChange: function (e) {
            setChildDob(e.target.value);
          },
        })
      ),
      React.createElement(
        "label",
        { className: "start-consent-row" },
        React.createElement("input", {
          type: "checkbox",
          checked: recordingConsent,
          onChange: function (e) {
            setRecordingConsent(!!e.target.checked);
          }
        }),
        React.createElement("span", null, tr("test.start.recordingConsent"))
      ),
      React.createElement(
        "label",
        { className: "start-consent-row start-consent-row--legal" },
        React.createElement("input", {
          type: "checkbox",
          checked: legalConfirmation,
          onChange: function (e) {
            setLegalConfirmation(!!e.target.checked);
          }
        }),
        React.createElement(
          "span",
          null,
          tr("test.start.legalConfirmation"),
          lang === "en" ? " " : "",
          React.createElement(
            "a",
            {
              href: TERMS_OF_USE_URL,
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: function (e) { e.stopPropagation(); }
            },
            tr("test.start.termsOfUseLink")
          ),
          " ",
          tr("test.start.and"),
          lang === "en" ? " " : "",
          React.createElement(
            "a",
            {
              href: PRIVACY_POLICY_URL,
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: function (e) { e.stopPropagation(); }
            },
            tr("test.start.privacyPolicyLink")
          ),
          "."
        )
      ),
      React.createElement(
        "button",
        { onClick: confirmAge },
        tr("test.cta.continue")
      )
    );
  }

  if (ageInvalid) {
    return React.createElement("div", { className: "age-invalid" }, tr("test.age.invalid"));
  }

  if (!permission && !microphoneSkipped) {
    return React.createElement(
      "div",
      { className: "microphone-permission-screen" },
      React.createElement("h2", null, tr("test.mic.title")),
      React.createElement("p", null, tr("test.mic.body")),
      React.createElement(
        "button",
        {
          className: "allowMic",
          onClick: getMicrophonePermission
        },
        tr("test.mic.allow")
      ),
      React.createElement(
  "button",
  {
    className: "skipMic",
    onClick: skipMicrophone
  },
  lang === "en" ? "Skip microphone for local testing" : "דלג על מיקרופון לבדיקה מקומית"
),
      React.createElement(
        "p",
        {
          style: {
            marginTop: "24px",
            fontSize: "14px",
            color: "rgba(0, 7, 8, 0.55)",
            maxWidth: "340px",
            lineHeight: "1.6",
            textAlign: "center"
          }
        },
        lang === "en"
          ? "Note: The system records the assessment for future development and improvement purposes. Currently, the recording is not used for the language assessment of the child."
          : "שים לב! המערכת מקליטה את ההערכה לשם פיתוח וטיוב עתידי. בתוצאות הערכה כרגע אין שימוש בהקלטה לצורכי הערכה השפתית של הילד."
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
    const strengtheningGoals = [];
    const strengtheningGoalSet = {};
    questionResults.forEach(function (item) {
      const qNum = parseInt(item.questionNumber, 10);
      const q = questionByNumber[qNum];
      if (!q || q.age_group !== expectedAgeGroup) return;
      ageMatchedStats.total += 1;
      if (item.result === "correct") ageMatchedStats.correct += 1;
      else if (item.result === "partly") ageMatchedStats.partial += 1;
      else if (item.result === "wrong") {
        ageMatchedStats.wrong += 1;
        const goal =
          (q.test_goal || q.testGoal || q["TEST GOAL"] || q.test_goal_he || q.test_goal_en || "").toString().trim();
        if (goal && !strengtheningGoalSet[goal]) {
          strengtheningGoalSet[goal] = true;
          strengtheningGoals.push(goal);
        }
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

    const strongerLabel = (function () {
      if (compStats.correct > exprStats.correct) {
        return lang === "en" ? "Stronger in comprehension" : "חזק יותר בהבנה";
      }
      if (exprStats.correct > compStats.correct) {
        return lang === "en" ? "Stronger in expression" : "חזק יותר בהבעה";
      }
      return lang === "en" ? "Balanced between comprehension and expression" : "מאוזן בין הבנה להבעה";
    })();

    const statsLine = function (titleHe, titleEn, stats) {
      const title = lang === "en" ? titleEn : titleHe;
      return title + ": " + stats.correct + " ✔ / " + stats.partial + " ~ / " + stats.wrong + " ✖ מתוך " + stats.total;
    };

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
      { style: { width: "100%", padding: "8px 0 2px", textAlign: "center" } },
      React.createElement(
        "div",
        {
          style: {
            fontSize: "28px",
            fontWeight: 800,
            marginBottom: "6px",
            color: "#20364a"
          }
        },
        lang === "en" ? "Great job! 🏁" : "כל הכבוד! 🏁"
      )
    ),

      // Age-matched summary (parent-facing)
      React.createElement(
        "div",
        { style: { width: "min(100%, 720px)", margin: "8px auto 0", textAlign: "center" } },
        React.createElement(
          "p",
          { style: { margin: "0 0 6px", fontWeight: 700 } },
          lang === "en"
            ? "Age-matched results"
            : "סיכום לפי גיל הילד"
        ),
        React.createElement(
          "p",
          { style: { margin: 0 } },
          lang === "en"
            ? ("Your child answered " + ageMatchedStats.correct + " correct, " + ageMatchedStats.partial + " with help, and " + ageMatchedStats.wrong + " incorrect out of " + ageMatchedStats.total + " questions matching their age group (" + expectedAgeGroup + ").")
            : (" ענה נכון על " + ageMatchedStats.correct + " תשובות מהשאלות המתאימות לגילו הכרונולוגי (" + expectedAgeGroup + "). " +
               ageMatchedStats.partial + " תשובות עם עזרה ו-" + ageMatchedStats.wrong + " תשובות שגויות (מתוך " + ageMatchedStats.total + ").")
        )
      ),
      strengtheningGoals.length > 0
        ? React.createElement(
            "div",
            { style: { width: "min(100%, 720px)", margin: "10px auto 0", textAlign: "center" } },
            React.createElement(
              "p",
              { style: { margin: "0 0 6px", fontWeight: 800 } },
              lang === "en"
                ? "It looks like these areas could use strengthening:"
                : "נראה כי ישנו צורך בחיזוק התחומים הבאים:"
            ),
            React.createElement(
              "div",
              { style: { display: "grid", gap: "6px" } },
              strengtheningGoals.map(function (g) {
                return React.createElement(
                  "div",
                  { key: g, style: { padding: "10px 12px", borderRadius: "14px", background: "rgba(66, 171, 199, 0.08)", border: "1px solid rgba(66, 171, 199, 0.18)" } },
                  g
                );
              })
            )
          )
        : null,
      // Keep detailed breakdown (useful for internal use)
      React.createElement(
        "div",
        { style: { display: "grid", gap: "6px", marginTop: "14px", textAlign: "center" } },
        React.createElement("strong", null, lang === "en" ? "By category:" : "לפי קטגוריה:"),
        React.createElement("span", null, statsLine("הבנה", "Comprehension", compStats)),
        React.createElement("span", null, statsLine("הבעה", "Expression", exprStats)),
        React.createElement("span", { style: { marginTop: "4px", fontWeight: 600 } }, strongerLabel)
      ),
      // Download buttons container (recording MP3 + detailed results text only; no combined download)
      React.createElement(
        "div",
        { style: { marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" } },
        // Download button for recording only - show if recording exists
        hasSessionRecording
      ? React.createElement(
        "button",
        {
          style: {
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: "#42ABC7",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          },
          onClick: downloadRecording
        },
        tr("test.done.downloadRecording")
      )
  : null,
        // Detailed results (timestamps + per-question outcomes + transcript when available)
        React.createElement(
        "button",
        {
          style: {
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            opacity: 1
          },
          onClick: downloadTimestamps
        },
        tr("test.done.downloadTimestamps")
      )
      )
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
      React.createElement("p", null, tr("test.loadingQuestion.body"))
    );
  }

  const currentIdx = getCurrentQuestionIndex();
  const currentQuestion = questions[currentIdx];
  const currentQuestionAgeGroup = currentQuestion ? currentQuestion.age_group : "";
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
  // Main UI
  return React.createElement(
    "div",
    {
      className: "app-container",
      style: devMode ? { backgroundColor: "#808080" } : {}
    },
    renderConfettiOverlay(),

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
        React.createElement("h1", { style: { color: "white", fontSize: "48px", marginBottom: "20px" } }, tr("test.paused.title")),
        React.createElement("p", { style: { color: "white", fontSize: "20px", marginBottom: "30px" } },
          tr("test.paused.body")
        ),
        React.createElement(
          "button",
          {
            onClick: resumeTest,
            style: {
              padding: "15px 40px",
              fontSize: "20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold"
            }
          },
          tr("test.paused.cta")
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
    devMode
  ? React.createElement(
      "div",
      { className: "dev-mode-indicator" },

      React.createElement(
        "button",
        {
          type: "button",
          className: "dev-mode-btn",
          onClick: goToPreviousQuestion,
          disabled: currentIdx <= 0
        },
        lang === "en" ? "◀ Prev" : "▶ קודם"
      ),

      React.createElement("input", {
        type: "number",
        min: 1,
        max: questions.length,
        value: devJumpValue,
        onChange: function (e) {
          setDevJumpValue(e.target.value.replace(/\D/g, ""));
        },
        className: "dev-mode-input",
        placeholder: lang === "en" ? "Question #" : "מספר שאלה"
      }),

      React.createElement(
        "button",
        {
          type: "button",
          className: "dev-mode-btn",
          onClick: function () {
            goToQuestionByNumber(devJumpValue);
          }
        },
        lang === "en" ? "Go" : "עבור"
      ),

      React.createElement(
        "button",
        {
          type: "button",
          className: "dev-mode-btn",
          onClick: function () {
            updateCurrentQuestionIndex(function (prevIdx) {
              if (prevIdx < questions.length - 1) {
                return prevIdx + 1;
              }
              return prevIdx;
            });
          },
          disabled: currentIdx >= questions.length - 1
        },
        lang === "en" ? "Next ▶" : "הבא ◀"
      )
    )
  : null,


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
            questionType === "E" && hintWasUsedThisQuestion
              ? null
              : React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "traffic-option traffic-option--green",
                    onClick: function () { handleTrafficPopupChoice("success"); },
                    disabled: !!trafficPopupChoice,
                  },
                  React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.green.title"))
                ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--orange",
                onClick: function () { handleTrafficPopupChoice("partial"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.orange.title"))
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--red",
                onClick: function () { handleTrafficPopupChoice("failure"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.red.title"))
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
  { className: "question-section" },
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
    )
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
        const shouldUseTwoColumnGrid = isPortraitMobile && currentImageCount >= 4;
        const shouldUseSingleColumn = isPortraitMobile && currentImageCount === 2;

        const comprehensionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          :shouldUseThreeUp? { display: "flex", flexDirection: "column", gap: "12px" }
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
        const shouldUseTwoColumnGrid = isPortraitMobile && currentImageCount >= 4;

        const expressionGridStyle = shouldUseSingleColumn?
         { display: "grid", gridTemplateColumns: "1fr", gap: "12px" }
          : shouldUseThreeUp? { display: "flex", flexDirection: "column", gap: "12px" }
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
  );
}