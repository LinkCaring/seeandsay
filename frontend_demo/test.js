function Test({ allQuestions, lang, t }) {
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
  const [idDigits, setId] = usePersistentState("idDigits", "")
  const [ageConfirmed, setAgeConfirmed] = usePersistentState("ageConfirmed", false);
  const [ageInvalid, setAgeInvalid] = usePersistentState("ageInvalid", false);
  const [currentIndex, setCurrentIndex] = usePersistentState("currentIndex", 0);
  const [correctAnswers, setCorrectAnswers] = usePersistentState("correctAnswers", 0);
  const [partialAnswers, setPartialAnswers] = usePersistentState("partialAnswers", 0);
  const [wrongAnswers, setWrongAnswers] = usePersistentState("wrongAnswers", 0);
  const [devMode, setDevMode] = usePersistentState("devMode", false)

  // Track full array of question results: [{questionNumber, result}, ...]
  const [questionResults, setQuestionResults] = usePersistentState("questionResults", []);

  // Transcription state
  const [transcription, setTranscription] = React.useState(null);
  const [waitingForTranscription, setWaitingForTranscription] = React.useState(false);

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



  // Session-only states
  const [images, setImages] = React.useState([]);
  const [target, setTarget] = React.useState("");
  const [showContinue, setShowContinue] = React.useState(false);
  const [clickedCorrect, setClickedCorrect] = React.useState(false);
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
  const [orderedAnswers, setOrderedAnswers] = React.useState([]); // Array of answer indices in order
  const [orderedClickSequence, setOrderedClickSequence] = React.useState([]); // Sequence of clicks

  // Mask answer states
  const [maskImage, setMaskImage] = React.useState(null); // HTMLImageElement for the mask
  const [maskCanvas, setMaskCanvas] = React.useState(null); // Canvas for pixel detection



  // Continuous recording state (persistent so it survives refresh)
  const [sessionRecordingStarted, setSessionRecordingStarted] = usePersistentState("sessionRecordingStarted", false);

  // Pause state (persistent)
  const [isPaused, setIsPaused] = usePersistentState("testPaused", false);

  // AFK timer states
  const [afkTimerActive, setAfkTimerActive] = React.useState(false);
  const [showAfkWarning, setShowAfkWarning] = React.useState(false);
  const afkTimerRef = React.useRef(null);
  const afkWarningTimerRef = React.useRef(null);

  // Image loading state
  const [currentQuestionImagesLoaded, setCurrentQuestionImagesLoaded] = React.useState(false);

  const isMountedRef = React.useRef(true);

  // Adjust counts helpers
  function adjustCountsForResult(resultString, delta) {
    if (resultString === "correct") setCorrectAnswers(prev => Math.max(0, prev + delta));
    else if (resultString === "partly") setPartialAnswers(prev => Math.max(0, prev + delta));
    else if (resultString === "wrong") setWrongAnswers(prev => Math.max(0, prev + delta));
  }

  function removeResultForQuestion(questionNumber) {
    const idx = questionResults.map(function (r) { return r.questionNumber; }).lastIndexOf(questionNumber);
    if (idx === -1) return;
    const removed = questionResults[idx];
    adjustCountsForResult(removed.result, -1);
    const nextResults = questionResults.slice(0, idx).concat(questionResults.slice(idx + 1));
    setQuestionResults(nextResults);
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
  // For local testing you can bypass the "Please read the following sentence..." step:
  // Open: http://localhost:5173/?skipReading=1
  const skipReading = React.useMemo(function () {
    try {
      return new URLSearchParams(window.location.search).get("skipReading") === "1";
    } catch (e) {
      return false;
    }
  }, []);

  const skipReadingAppliedRef = React.useRef(false);




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
          const inputElement = document.querySelector('.dev-mode-input');
          if (inputElement) {
            const value = Number(inputElement.value) - 1;
            if (value >= 0 && value < questions.length) {
              updateCurrentQuestionIndex(value);
            }
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [devMode]);



  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  function totalMonths() {
    const y = parseInt(ageYears, 10) || 0;
    const m = parseInt(ageMonths, 10) || 0;
    return y * 12 + m;
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
  function confirmAge() {
    const y = parseInt(ageYears, 10);
    const m = parseInt(ageMonths, 10);
    const id = idDigits
    if (isNaN(y) || isNaN(m) || m < 0 || m > 11) {
      alert(tr("test.age.invalidInput"));
      return;
    }
    const months = totalMonths();
    if (months < 24 || months >= 72) {
      setAgeInvalid(true);
      return;
    }
 
    // Simply confirm age and start with all questions
    setAgeConfirmed(true);
    createUser(idDigits, 'SomeUserName') //MongoDB
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
    // sessionRecordingStarted will be set by the useEffect when voice identifier screen appears
  };

  const confirmVoiceIdentifier = async function () {
    // Stop the reading recording
    if (permission && sessionRecordingStarted) {
      SessionRecorder.stopContinuousRecording();
      console.log("🛑 Stopped reading recording, preparing for validation...");


      // Wait for recording to be processed and converted to MP3
      // Poll until recording is ready (similar to completeSession)
      var pollAttempts = 0;
      var maxAttempts = 50; // Max 5 seconds (50 * 100ms)

      var checkRecordingReady = async function () {
        pollAttempts++;


        try {
          const recordingData = await SessionRecorder.getRecordingAndText();
          if (recordingData && recordingData.recordingBlob) {
            console.log("✅ Reading recording ready after " + pollAttempts + " attempts");
            // Convert blob to base64
            const reader = new FileReader();
            reader.onloadend = async function () {
              const audioBase64 = reader.result;
              setReadingRecordingBlob(audioBase64);

              // Store the verification blob for later combining with test audio
              setVerificationAudioBlob(recordingData.recordingBlob);

              // Show loading screen while waiting for backend
              setReadingValidationInProgress(true);


              // Send to backend for validation
              const validationResult = await verifySpeaker(idDigits, audioBase64);

              // Hide loading screen
              setReadingValidationInProgress(false);


              // verifySpeaker can return:
              // - null: no backend connection (for testing)
              // - {success: true, parentSpeaker: ...}: valid
              // - {success: false, error: ...}: invalid
              // Convert to boolean/null format expected by the UI
              if (validationResult === null) {
                // No connection - show options
                setReadingValidationResult(null);
                setReadingValidated(false);
              } else if (validationResult && validationResult.success === true) {
                setReadingValidationResult(true);
                setReadingValidated(true);
              } else if (validationResult && validationResult.success === false) {
                setReadingValidationResult(false);
                setReadingValidated(false);
              } else {
                // Fallback: treat as no connection
                setReadingValidationResult(null);
                setReadingValidated(false);
              }
            };
            reader.readAsDataURL(recordingData.recordingBlob);
          } else if (pollAttempts < maxAttempts) {
            // Not ready yet, check again in 100ms
            setTimeout(checkRecordingReady, 100);
          } else {
            // Timeout - treat as no connection
            console.warn("⚠️ Reading recording conversion timeout");
            setReadingValidationResult(null);
            setReadingValidated(false);
          }
        } catch (err) {
          console.error("Error getting reading recording:", err);
          if (pollAttempts < maxAttempts) {
            setTimeout(checkRecordingReady, 100);
          } else {
            setReadingValidationResult(null);
            setReadingValidated(false);
          }
        }
      };


      // Start polling after a small initial delay
      setTimeout(checkRecordingReady, 200);
    } else {
      // No recording, skip validation
      setReadingValidationResult(null);
      setReadingValidated(true);
    }
  };

  const handleReadingValidationContinue = async function () {
    // Restart recording for the actual test
    if (permission) {
      // Clean up old recording data
      SessionRecorder.cleanup();

      // Reset timestamps so they count from question 1
      SessionRecorder.resetTimestamps();

      // Start new recording for the test
      const started = await SessionRecorder.startContinuousRecording();
      if (started) {
        setSessionRecordingStarted(true);
        console.log("✅ Started test recording");

        // Mark question 1 start timestamp after a brief delay to ensure recording is active
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
    } else {
      // Even without recording, mark question 1 if microphone was skipped
      if (questions.length > 0 && microphoneSkipped) {
        const firstQuestion = questions[0];
        if (firstQuestion) {
          SessionRecorder.markQuestionStart(firstQuestion.query_number);
          console.log("📝 Marked question 1 start at test start (no recording)");
        }
      }
    }

    setVoiceIdentifierConfirmed(true);
    setReadingValidated(true);
    playQuestionOne();
  };

  const handleReadingValidationRetry = async function () {
    // Reset states and restart recording
    setReadingValidated(false);
    setReadingValidationResult(null);
    setReadingRecordingBlob(null);
    setVerificationAudioBlob(null); // Clear verification blob on retry

    // Restart recording
    if (permission) {
      SessionRecorder.cleanup();
      SessionRecorder.resetTimestamps();
      const started = await SessionRecorder.startContinuousRecording();
      if (started) {
        setSessionRecordingStarted(true);
        console.log("🔄 Restarted reading recording");
      }
    }
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

  // Auto-bypass voice identifier (reading) step for local testing
  // Important: do NOT call handleReadingValidationContinue() here, because it can start
  // SessionRecorder and throw (no try/catch there), which would leave you stuck on this screen.
  React.useEffect(function () {
    if (!skipReading) return;
    if (skipReadingAppliedRef.current) return;

    if ((permission || microphoneSkipped) && !voiceIdentifierConfirmed) {
      skipReadingAppliedRef.current = true;
      console.warn("⚡ skipReading=1 enabled: bypassing voice identifier step (no validation/recording)");

      // Force "no recording" mode for tests
      setMicrophoneSkipped(true);

      // Mark reading as done so UI can proceed immediately
      setReadingValidated(true);
      setReadingValidationResult(true);

      // Jump straight into the test
      setVoiceIdentifierConfirmed(true);
    }
  }, [skipReading, permission, microphoneSkipped, voiceIdentifierConfirmed]);

  // Open a friendly traffic-light popup when it's time to evaluate (after answering)
  React.useEffect(function () {
    if (sessionCompleted || isPaused) {
      setTrafficPopupOpen(false);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = false;
      return;
    }

    if (showContinue) {
      setTrafficPopupOpen(true);
      setTrafficPopupChoice(null);
      trafficPopupJustOpenedRef.current = true;
      return;
    }

    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    trafficPopupJustOpenedRef.current = false;
  }, [showContinue, sessionCompleted, isPaused, currentIndex]);

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
    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);
  }

  function goToPreviousQuestion() {
    const currentIdx = getCurrentQuestionIndex();
    if (currentIdx <= 0) return;

    const currentQuestion = questions[currentIdx];
    if (currentQuestion) {
      removeResultForQuestion(currentQuestion.query_number);
    }

    setShowContinue(false);
    setTrafficPopupOpen(false);
    setTrafficPopupChoice(null);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);

    updateCurrentQuestionIndex(currentIdx - 1);
  }

  function handleTrafficPopupChoice(result) {
    if (trafficPopupChoice) return;
    setTrafficPopupChoice(result);
    playTrafficFeedback(result);
    setTimeout(function () {
      // Prevent the popup from immediately re-opening during the next-question transition.
      // The popup is driven by `showContinue`, which may still be true when `currentIndex` changes.
      setShowContinue(false);
      setTrafficPopupOpen(false);
      setTrafficPopupChoice(null);
      handleContinue(result);
    }, 650);
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



  const playQuestionOne = function () {
    // Load and play question audio
    const audioUrl = "resources/questions_audio/audio_1.mp3";
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
        // Original single-answer behavior
        const correct = img === target;
        if (correct) setClickedCorrect(true);
        setShowContinue(true);
      } else if (answerType === "multi") {
        // Multi-answer: check if this is a correct answer
        if (multiAnswers.includes(imgIndex)) {
          // Add to clicked answers if not already clicked
          if (!clickedMultiAnswers.includes(imgIndex)) {
            const newClicked = [...clickedMultiAnswers, imgIndex];
            setClickedMultiAnswers(newClicked);

            // Check if all correct answers have been clicked
            if (newClicked.length === multiAnswers.length) {
              setClickedCorrect(true);
              setShowContinue(true);
            }
          }
        }
      } else if (answerType === "ordered") {
        // Ordered answer: check if this matches the next expected answer

        if (orderedClickSequence.length > 0 && orderedClickSequence.at(-1) != imgIndex) {
          const newSequence = [orderedClickSequence.at(-1), imgIndex]
          setOrderedClickSequence(newSequence)
          setShowContinue(true);
          if (newSequence[0] === 2 && newSequence[1] === 1) {
            setClickedCorrect(true);
          }
        }
        else {
          const newSequence = [imgIndex]
          setOrderedClickSequence(newSequence)
        }
      } else if (answerType === "mask") {
        // CHANGE A: Fixed mask detection
        // Mask-based answer: check if click is on green pixel
        if (maskCanvas) {
          const isGreen = checkMaskClick(event);
          if (isGreen) {
            setClickedCorrect(true);
          }
        }
        setShowContinue(true);
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

    // Track traffic light responses
    if (result === "success") {
      setCorrectAnswers(correctAnswers + 1);
    } else if (result === "partial") {
      setPartialAnswers(partialAnswers + 1);
    } else if (result === "failure") {
      setWrongAnswers(wrongAnswers + 1);
    }

    // Track question result in full array
    let updatedQuestionResults = questionResults;
    if (currentQuestion) {
      const questionNumber = currentQuestion.query_number;
      const questionTypeLabel = getQuestionTypeLabel(currentQuestion);
      // Map result to string format
      let resultString = "";
      if (result === "success") {
        resultString = "correct";
      } else if (result === "partial") {
        resultString = "partly";
      } else if (result === "failure") {
        resultString = "wrong";
      }

      // Create updated array locally to avoid sync issues
      updatedQuestionResults = [...questionResults, {
        questionNumber: questionNumber,
        result: resultString,
        questionType: questionTypeLabel
      }];

      // Add to question results array
      setQuestionResults(updatedQuestionResults);
      console.log("Recorded result for question", questionNumber, ":", resultString);
    }

    // Simply move to next question or complete session
    if (currentIdx < questions.length - 1) {
      updateCurrentQuestionIndex(currentIdx + 1);
    } else {
      // Pass updated results to avoid sync issues with state
      completeSession(updatedQuestionResults);
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

    setShowContinue(false);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);

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
      // Mask answer type: load A.webp as mask
      setAnswerType("mask");
      const maskUrl = "resources/test_assets/" + q.query_number + "/A.webp";

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
      // Multi-answer type: "1,2,3,4,10"
      setAnswerType("multi");
      const answers = answerStr.split(",").map(function (a) {
        return parseInt(a.trim(), 10);
      });
      setMultiAnswers(answers);
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
    if (permission || microphoneSkipped) { //check if the microphone permission stage is over
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

  function completeSession(updatedQuestionResults) {
    setSessionCompleted(true);
    setImages([]);

    // If test is paused, unpause it first
    if (isPaused) {
      setIsPaused(false);
    }

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
            if (verificationAudioBlob) {
              console.log("🔗 Combining verification audio with test audio...");
              finalBlob = await combineAudioBlobs(verificationAudioBlob, data.recordingBlob);
              console.log("✅ Audio combined successfully");
            }

            // Store final audio (combined or test-only) for download
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
            };
            reader2.readAsDataURL(finalBlob);

            const reader = new FileReader();
            reader.onloadend = async function () {
              const fullArray = formatQuestionResultsArray(updatedQuestionResults);
              setWaitingForTranscription(true);
              const result = await updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
                reader.result, data.timestampText); //MongoDB
              if (result && result.transcription) {
                setTranscription(result.transcription);
              }
              setWaitingForTranscription(false);
            };
            reader.readAsDataURL(finalBlob);
          } else if (pollAttempts < maxAttempts) {
            // Not ready yet, check again in 100ms
            setTimeout(checkRecordingReady, 100);
          } else {
            // Timeout - send without recording
            console.warn("⚠️ Recording conversion timeout after " + maxAttempts + " attempts= " + (maxAttempts * 100) + "ms");
            const fullArray = formatQuestionResultsArray(updatedQuestionResults);
            setWaitingForTranscription(true);
            updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
              null, null).then(function(result) {
                if (result && result.transcription) {
                  setTranscription(result.transcription);
                }
                setWaitingForTranscription(false);
              }).catch(function(err) {
                console.error("Error getting transcription:", err);
                setWaitingForTranscription(false);
              }); //MongoDB
          }
        }).catch(function (err) {
          console.error("❌ Error checking recording:", err);
          const fullArray = formatQuestionResultsArray(updatedQuestionResults);
          setWaitingForTranscription(true);
          updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
            null, null).then(function(result) {
              if (result && result.transcription) {
                setTranscription(result.transcription);
              }
              setWaitingForTranscription(false);
            }).catch(function(err) {
              console.error("Error getting transcription:", err);
              setWaitingForTranscription(false);
            }); //MongoDB
        });
      };

      // Start polling after a small initial delay
      setTimeout(checkRecordingReady, 200);
    } else {
      // No recording, send immediately
      const fullArray = formatQuestionResultsArray(updatedQuestionResults);
      setWaitingForTranscription(true);
      updateUserTests(idDigits, ageYears, ageMonths, fullArray, correctAnswers, partialAnswers, wrongAnswers,
        null, null).then(function(result) {
          if (result && result.transcription) {
            setTranscription(result.transcription);
          }
          setWaitingForTranscription(false);
        }).catch(function(err) {
          console.error("Error getting transcription:", err);
          setWaitingForTranscription(false);
        }); //MongoDB
    }
  }


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
    [ageConfirmed, questions, currentIndex, sessionCompleted]
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

  function ProgressBar() {
    const currentIdx = getCurrentQuestionIndex();
    const totalQuestions = questions.length;
    const progressPercentage = totalQuestions > 0 ? (currentIdx / totalQuestions) * 100 : 0;

    return React.createElement(
      "div",
      { className: "progress-bar-container" },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "10px", width: "100%" } },
        // Pause/Resume button on the left (only show during active test)
        voiceIdentifierConfirmed && !sessionCompleted
          ? React.createElement(
            "button",
            {
              className: "pause-button",
              onClick: isPaused ? resumeTest : pauseTest,
              style: {
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: isPaused ? "#4CAF50" : "#FF9800",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold",
                flexShrink: 0,
                minWidth: "100px"
              }
            },
            isPaused ? tr("test.resume") : tr("test.pause")
          )
          : null,
        currentIdx > 0 && voiceIdentifierConfirmed && !sessionCompleted
          ? React.createElement(
            "button",
            {
              type: "button",
              onClick: goToPreviousQuestion,
              "aria-label": tr("test.nav.back.aria"),
              style: {
                padding: "8px 12px",
                fontSize: "13px",
                backgroundColor: "#e9f9fe",
                color: "#304348",
                border: "1px solid rgba(66,171,199,0.35)",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                flexShrink: 0
              }
            },
            tr("test.nav.back")
          )
          : null,
        // Progress bar and text in the remaining space
        React.createElement(
          "div",
          { style: { flex: 1 } },
          React.createElement(
            "div",
            { className: "progress-bar" },
            React.createElement(
              "div",
              {
                className: "progress-fill",
                style: { width: progressPercentage + "%" }
              }
            )
          ),
          React.createElement(
            "div",
            { className: "progress-text" },
            tr("test.progress", { current: currentIdx, total: totalQuestions })
          )
        )
      )
    );
  }


  if (!ageConfirmed && !ageInvalid) {
    return React.createElement(
      "div",
      { className: "age-screen" },
      React.createElement("h2", null, tr("test.age.title")),
      React.createElement("input", {
        type: "number",
        placeholder: tr("test.age.years"),
        value: ageYears,
        onChange: function (e) {
          setAgeYears(e.target.value.replace(/\D/g, ""));
        },
      }),
      React.createElement("input", {
        type: "number",
        placeholder: tr("test.age.months"),
        value: ageMonths,
        onChange: function (e) {
          setAgeMonths(e.target.value.replace(/\D/g, ""));
        },
      }),
      React.createElement("input", {
        type: "number",
        placeholder: tr("test.age.id"),
        value: idDigits,
        onChange: function (e) {
          setId(e.target.value.replace(/\D/g, ""));
        },
      }),
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
          onClick: skipMicrophone,
        },
        tr("test.mic.skip")
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

    // Show validation result screen if validation has been attempted
    if (readingValidationResult !== null || readingRecordingBlob !== null) {
      if (readingValidationResult === true) {
        // Valid - show continue button
        return React.createElement(
          "div",
          { className: "voice-identifier-screen" },
          React.createElement("h2", null, tr("test.reading.valid")),
          React.createElement("p", { style: { fontSize: "18px", color: "#4CAF50", margin: "20px 0" } },
            tr("test.reading.validMsg")
          ),
          React.createElement(
            "button",
            {
              className: "continue-button",
              onClick: handleReadingValidationContinue,
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
            tr("test.reading.toTest")
          )
        );
      } else if (readingValidationResult === false) {
        // Invalid - show retry message
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
            // Show skip button in developer mode only
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
      } else {
        // No connection - show options
        return React.createElement(
          "div",
          { className: "voice-identifier-screen" },
          React.createElement("h2", null, tr("test.reading.noBackend")),
          React.createElement("p", { style: { fontSize: "16px", color: "#666", margin: "20px 0" } },
            tr("test.reading.noBackendMsg")
          ),
          React.createElement(
            "div",
            { style: { display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px" } },
            React.createElement(
              "button",
              {
                className: "continue-button",
                onClick: handleReadingValidationContinue,
                style: {
                  padding: "12px 24px",
                  fontSize: "18px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }
              },
              tr("test.reading.continueNoBackend")
            ),
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
              tr("test.reading.tryReadingAgain")
            )
          )
        );
      }
    }

    // Show reading instruction screen
    return React.createElement(
      "div",
      { className: "voice-identifier-screen" },
      React.createElement("h2", null, tr("test.reading.title")),
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
    // Show waiting screen while transcription is being processed
    if (waitingForTranscription) {
      return React.createElement(
        "div",
        {
          className: "session-complete",
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            padding: "48px 32px"
          }
        },
        React.createElement("h2", null, tr("test.done.title")),
        React.createElement("p", { style: { fontSize: "18px", color: "#666" } },
          lang === "en" ? "Processing transcription, please wait..." : "מעבד תמלול, אנא המתן..."
        ),
        React.createElement("div", {
          style: {
            width: "50px",
            height: "50px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #4CAF50",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }
        }),
        React.createElement("style", null, `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `)
      );
    }

    const totalAnswered = correctAnswers + partialAnswers + wrongAnswers;

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

    // Download both files function
    const downloadBoth = function () {
      // Download recording first
      const recordingUrl = SessionRecorder.getFinalRecordingUrlSync();
      if (recordingUrl) {
        const a = document.createElement("a");
        a.href = recordingUrl;
        const fileExt = SessionRecorder.getCurrentFileExtension();
        a.download = "session_recording_" + idDigits + "_" + Date.now() + fileExt;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("📥 Downloaded session recording as MP3");
      }

      // Download enhanced text file after a short delay to avoid browser blocking
      setTimeout(function () {
        downloadTimestamps();
      }, 500);
    };

    return React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement("h2", null, tr("test.done.title")),
      React.createElement("p", null,
        tr("test.done.body", { correct: correctAnswers, partial: partialAnswers, wrong: wrongAnswers })
      ),
      React.createElement("p", null,
        tr("test.done.total", { answered: totalAnswered, total: questions.length })
      ),
      React.createElement(
        "div",
        { style: { display: "grid", gap: "6px", marginTop: "6px", textAlign: "center" } },
        React.createElement("strong", null, lang === "en" ? "By category:" : "לפי קטגוריה:"),
        React.createElement("span", null, statsLine("הבנה", "Comprehension", compStats)),
        React.createElement("span", null, statsLine("הבעה", "Expression", exprStats)),
        React.createElement("span", { style: { marginTop: "4px", fontWeight: 600 } }, strongerLabel)
      ),
      // Download buttons container
      React.createElement(
        "div",
        { style: { marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" } },
        // Download both button (main action) - show if recording exists
        sessionRecordingStarted
          ? React.createElement(
            "button",
            {
              style: {
                padding: "12px 24px",
                fontSize: "18px",
                backgroundColor: "#FF6B35",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold"
              },
              onClick: downloadBoth
            },
            tr("test.done.downloadBoth")
          )
          : null,
        // Download button for recording only - show if recording exists
        sessionRecordingStarted
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
        // Download button for timestamps only - always show on completion screen
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
              cursor: "pointer"
            },
            onClick: downloadTimestamps
          },
          tr("test.done.downloadTimestamps")
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
  const isMobile = React.useMemo(function () {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 640px)").matches;
  }, []);
  const maxRows = 2;
  const gridColumns = Math.max(1, Math.ceil(currentImageCount / maxRows));
  const compactImages = currentImageCount > 6;
  const minImgWidth = compactImages ? (isMobile ? 140 : 120) : (isMobile ? 160 : 140);
  const imagesGridStyle = { gridTemplateColumns: "repeat(" + gridColumns + ", minmax(" + minImgWidth + "px, 1fr))", gap: isMobile ? "12px" : "16px" };
  const imagesContainerClassName =
    "images-container" +
    (currentImageCount === 1 ? " images-container--single" : "") +
    (questionType === "C" ? " images-container--comprehension" : " images-container--expression");

  // Main UI
  return React.createElement(
    "div",
    {
      className: "app-container",
      style: devMode ? { backgroundColor: "#808080" } : {}
    },
    devMode
      ? React.createElement(
        "div",
        { className: "dev-mode-indicator", style: { padding: "10px", textAlign: "center" } },
        React.createElement("button", {
          style: {
            backgroundColor: "#ff6b6b",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold"
          },
          onClick: function () {
            setDevMode(false)
          }
        }, tr("dev.off")),  // <-- Added comma here
        React.createElement("input", {
          type: "number",
          className: "dev-mode-input"

        })
      )

      : null,
    // DevMode entry button (shown when devMode is off)
    !devMode
      ? React.createElement(
        "button",
        {
          onClick: function () {
            setDevMode(true);
          },
          style: {
            position: "fixed",
            top: "10px",
            right: "10px",
            zIndex: 10000,
            backgroundColor: "#4CAF50",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "14px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
          }
        },
        "Dev Mode"
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
    React.createElement(ProgressBar),
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
                onClick: cancelTrafficPopup,
                style: {
                  position: "absolute",
                  top: "6px",
                  left: lang === "en" ? "6px" : "auto",
                  right: lang === "en" ? "auto" : "6px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700
                },
                "aria-label": backAria
              },
              backLabel
            );
          })(),
          React.createElement("div", { className: "traffic-popup__kicker" }, "🚦"),
          React.createElement("h3", { className: "traffic-popup__title" }, tr("test.trafficPopup.title")),
          React.createElement(
            "div",
            { className: "traffic-popup__grid" },
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--red",
                onClick: function () { handleTrafficPopupChoice("failure"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("span", { className: "traffic-option__icon traffic-option__icon--red", "aria-hidden": "true" }, "✖"),
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.red.title")),

            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--orange",
                onClick: function () { handleTrafficPopupChoice("partial"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("span", { className: "traffic-option__icon traffic-option__icon--orange", "aria-hidden": "true" }, "≈"),
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.orange.title")),
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "traffic-option traffic-option--green",
                onClick: function () { handleTrafficPopupChoice("success"); },
                disabled: !!trafficPopupChoice,
              },
              React.createElement("span", { className: "traffic-option__icon traffic-option__icon--green", "aria-hidden": "true" }, "✓"),
              React.createElement("div", { className: "traffic-option__title" }, tr("test.trafficPopup.green.title")),

            )
          ),
          trafficPopupChoice
            ? React.createElement(
              "div",
              { className: "traffic-popup__feedback" },
              trafficPopupChoice === "success"
                ? (lang === "en" ? "✓ Great!" : "✓ כל הכבוד!")
                : trafficPopupChoice === "partial"
                  ? (lang === "en" ? "≈ Noted." : "≈ רשמנו.")
                  : (lang === "en" ? "✖ We'll practice." : "✖ נתרגל שוב.")
            )
            : null
        )
      )
      : null,
    React.createElement(
      "div",
      { className: "question-row" },
      questionAudio
        ? React.createElement(
          "button",
          {
            type: "button",
            className: "replay-audio-btn replay-audio-btn--inline",
            onClick: replayQuestionAudio,
            disabled: isAudioPlaying,
            "aria-label": tr("test.audio.playQuestion"),
          },
          isAudioPlaying ? tr("test.audio.playingQuestion") : tr("test.audio.playQuestion")
        )
        : null,
      React.createElement("h2", { className: "query-text" }, (questions[currentIdx] && questions[currentIdx].query) || ""),
      null
    ),

    questionType === "C"
      ? React.createElement(
        "div",
        {
          className: imagesContainerClassName,
          style: isTwoRow ? { display: "flex", flexDirection: "column", gap: isMobile ? "10px" : "12px" } : imagesGridStyle,
          "data-count": currentImageCount,
          "data-question-type": "C",
        },
        (function () {
          const useTwoRows = isTwoRow;
          const topCountDynamic = isTwoRow ? topRowCount : Math.ceil(currentImageCount / 2);
          const bottomImages = images.slice(topCountDynamic);
          if (useTwoRows) {
            return React.createElement(
              "div",
              { className: "two-row-layout" },
              React.createElement(
                "div",
                { className: "image-row top-row" },
                images.slice(0, topCountDynamic).map(function (img, i) {
                  const imgIndex = i + 1;
                  const isCorrectMulti = answerType === "multi" && clickedMultiAnswers.includes(imgIndex);
                  const isTargetSingle = answerType === "single" && img === target && clickedCorrect;
                  const showFireworks = (isTargetSingle || (answerType === "multi" && clickedCorrect) || (answerType === "mask" && clickedCorrect)) ||
                    (answerType === "ordered" && clickedCorrect && orderedAnswers[orderedAnswers.length - 1] === imgIndex);
                  const isNonClickable = nonClickableImage && imgIndex === nonClickableImage;

                  return React.createElement(
                    "div",
                    {
                      key: i,
                      className: "image-wrapper",
                      style: {
                        position: "relative",
                        border: isCorrectMulti ? "4px solid #00ff00" : "none",
                        borderRadius: isCorrectMulti ? "8px" : "0",
                        boxShadow: isCorrectMulti ? "0 0 15px rgba(0,255,0,0.6)" : "none",
                        opacity: isNonClickable ? 0.5 : 1,
                        cursor: isNonClickable ? "not-allowed" : "pointer"
                      }
                    },
                    showFireworks
                      ? React.createElement("img", {
                        src: "resources/test_assets/general/fireworks.webp",
                        className: "fireworks",
                        alt: "celebration",
                      })
                      : null,
                    React.createElement("img", {
                      src: img,
                      alt: "option " + (i + 1),
                      className: topRowBigger ? "image top-row-big" : "image",
                      style: compactImages
                        ? { maxWidth: isMobile ? "42vw" : "120px" }
                        : (isMobile ? { maxWidth: "48vw" } : undefined),
                      onClick: function (e) { handleClick(img, e); },
                    })
                  );
                })
              ),
              bottomImages.length > 0
                ? React.createElement(
                  "div",
                  { className: "image-row bottom-row" },
                  bottomImages.map(function (img, i) {
                    const imgIndex = topCountDynamic + i + 1;
                    const isCorrectMulti = answerType === "multi" && clickedMultiAnswers.includes(imgIndex);
                    const isTargetSingle = answerType === "single" && img === target && clickedCorrect;
                    const showFireworks = (isTargetSingle || (answerType === "multi" && clickedCorrect) || (answerType === "mask" && clickedCorrect)) ||
                      (answerType === "ordered" && clickedCorrect && orderedAnswers[orderedAnswers.length - 1] === imgIndex);
                    const isNonClickable = nonClickableImage && imgIndex === nonClickableImage;

                    return React.createElement(
                      "div",
                      {
                        key: topCountDynamic + i,
                        className: "image-wrapper",
                        style: {
                          position: "relative",
                          border: isCorrectMulti ? "4px solid #00ff00" : "none",
                          borderRadius: isCorrectMulti ? "8px" : "0",
                          boxShadow: isCorrectMulti ? "0 0 15px rgba(0,255,0,0.6)" : "none",
                          opacity: isNonClickable ? 0.5 : 1,
                          cursor: isNonClickable ? "not-allowed" : "pointer"
                        }
                      },
                      showFireworks
                        ? React.createElement("img", {
                          src: "resources/test_assets/general/fireworks.webp",
                          className: "fireworks",
                          alt: "celebration",
                        })
                        : null,
                      React.createElement("img", {
                        src: img,
                        alt: "option " + (topCountDynamic + i + 1),
                        className: "image",
                        style: compactImages
                          ? { maxWidth: isMobile ? "42vw" : "120px" }
                          : (isMobile ? { maxWidth: "48vw" } : undefined),
                        onClick: function (e) { handleClick(img, e); },
                      })
                    );
                  })
                )
                : null
            );
          }

          // Single row fallback for 1–2 images
          return images.map(function (img, i) {
            const imgIndex = i + 1;
            const isCorrectMulti = answerType === "multi" && clickedMultiAnswers.includes(imgIndex);
            const isTargetSingle = answerType === "single" && img === target && clickedCorrect;
            const showFireworks = (isTargetSingle || (answerType === "multi" && clickedCorrect) || (answerType === "mask" && clickedCorrect)) ||
              (answerType === "ordered" && clickedCorrect && orderedAnswers[orderedAnswers.length - 1] === imgIndex);
            const isNonClickable = nonClickableImage && imgIndex === nonClickableImage;

            return React.createElement(
              "div",
              {
                key: i,
                className: "image-wrapper",
                style: {
                  position: "relative",
                  border: isCorrectMulti ? "4px solid #00ff00" : "none",
                  borderRadius: isCorrectMulti ? "8px" : "0",
                  boxShadow: isCorrectMulti ? "0 0 15px rgba(0,255,0,0.6)" : "none",
                  opacity: isNonClickable ? 0.5 : 1,
                  cursor: isNonClickable ? "not-allowed" : "pointer"
                }
              },
              showFireworks
                ? React.createElement("img", {
                  src: "resources/test_assets/general/fireworks.webp",
                  className: "fireworks",
                  alt: "celebration",
                })
                : null,
              React.createElement("img", {
                src: img,
                alt: "option " + (i + 1),
                className: "image",
                style: compactImages
                  ? { maxWidth: isMobile ? "42vw" : "120px" }
                  : (isMobile ? { maxWidth: "48vw" } : undefined),
                onClick: function (e) { handleClick(img, e); },
              })
            );
          });
        })(),
        // Hint chest (if hint text exists)
        hintText && hintText.trim() !== ""
          ? React.createElement(
            "div",
            { className: "hint-container", "data-open": showHint ? "true" : "false" },
            React.createElement("img", {
              src: "resources/test_assets/general/chest.webp",
              className: "hint-chest" + (showHint ? " hint-chest--open" : ""),
              alt: "hint",
              onClick: function () { setShowHint(!showHint); },
            }),
            showHint
              ? React.createElement(
                "div",
                { className: "hint-text" },
                hintText
              )
              : null
          )
          : null,
      )
      : null,

    questionType === "E"
      ? React.createElement(
        "div",
        { className: "expression-container" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "replay-audio-btn replay-audio-btn--inline",
            onClick: function () { setShowContinue(true); },
            disabled: trafficPopupOpen || showContinue,
            "aria-label": tr("test.trafficLight.aria"),
            style: { marginBottom: "10px" }
          },
          lang === "en" ? "Evaluate (traffic light)" : "הערכה (רמזור)"
        ),
        // !microphoneSkipped && countdown > 0
        //   ? React.createElement("h3", null, "Recording starts in " + countdown + "...")
        //   : null,
        // !microphoneSkipped && recording
        //   ? React.createElement(
        //       "div",
        //       { className: "rec-controls" },
        //       !recPaused
        //         ? React.createElement("button", { className: "rec-btn pause", onClick: pauseRecording }, "Pause")
        //         : React.createElement("button", { className: "rec-btn resume", onClick: pauseRecording }, "Resume"),
        //       React.createElement("button", { className: "rec-btn stop", onClick: stopRecording }, "Stop")
        //     )
        //   : null,
        // !microphoneSkipped && recordingStopped
        //   ? React.createElement(
        //       "div",
        //       { className: "audio-replay" },
        //       React.createElement("audio", { src: audioUrl, controls: true }),
        //       React.createElement("div", { className: "rec-controls" },
        //         React.createElement("button", { className: "rec-btn redo", onClick: redoRecording }, "Redo recording")
        //       )
        //     )
        //   : null,
        // microphoneSkipped
        //   ? React.createElement("p", { className : "skippedText" }, "Recording skipped - please evaluate the response")
        //   : null,
        (function () {
          const useTwoRows = currentImageCount > 2;
          const topCountDynamic = Math.ceil(currentImageCount / 2);
          const bottomImages = images.slice(topCountDynamic);

          return React.createElement(
            "div",
            {
              className: imagesContainerClassName,
              style: useTwoRows ? { display: "flex", flexDirection: "column", gap: isMobile ? "10px" : "12px" } : imagesGridStyle,
              "data-count": currentImageCount,
              "data-question-type": "E",
            },
            useTwoRows
              ? React.createElement(
                "div",
                { className: "two-row-layout" },
                React.createElement(
                  "div",
                  { className: "image-row top-row" },
                  images.slice(0, topCountDynamic).map(function (img, i) {
                    return React.createElement(
                      "div",
                      { key: i, className: "image-wrapper" },
                      React.createElement("img", {
                        src: img,
                        alt: "option " + (i + 1),
                        className: "image",
                        style: compactImages
                          ? { maxWidth: isMobile ? "42vw" : "120px" }
                          : (isMobile ? { maxWidth: "48vw" } : undefined)
                      })
                    );
                  })
                ),
                bottomImages.length > 0
                  ? React.createElement(
                    "div",
                    { className: "image-row bottom-row" },
                    bottomImages.map(function (img, i) {
                      return React.createElement(
                        "div",
                        { key: topCountDynamic + i, className: "image-wrapper" },
                        React.createElement("img", {
                          src: img,
                          alt: "option " + (topCountDynamic + i + 1),
                          className: "image",
                          style: compactImages
                            ? { maxWidth: isMobile ? "42vw" : "120px" }
                            : (isMobile ? { maxWidth: "48vw" } : undefined)
                        })
                      );
                    })
                  )
                  : null
              )
              : images.map(function (img, i) {
                return React.createElement(
                  "div",
                  { key: i, className: "image-wrapper" },
                  React.createElement("img", {
                    src: img,
                    alt: "option " + (i + 1),
                    className: "image",
                    style: compactImages
                      ? { maxWidth: isMobile ? "42vw" : "120px" }
                      : (isMobile ? { maxWidth: "48vw" } : undefined)
                  })
                );
              })
          );
        })()
      )
      : null,
    // Comments display (if comment text exists) - shown for both comprehension and expression questions
    commentText && commentText.trim() !== ""
      ? React.createElement(
        "div",
        {
          style: {
            padding: "8px 12px",
            backgroundColor: "#f0f8ff",
            border: "1px solid #b0d4ff",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#333",
            maxWidth: "90%",
            margin: "10px auto 0",
            textAlign: "center",
            lineHeight: "1.4"
          }
        },
        commentText
      )
      : null
  );
}