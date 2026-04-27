function Test({ allQuestions }) {
  // =============================================================================
  // STATE DECLARATIONS
  // =============================================================================

  const [questions, setQuestions] = React.useState([]);

  // Persistent states
  const [ageYears, setAgeYears] = usePersistentState("ageYears", "");
  const [ageMonths, setAgeMonths] = usePersistentState("ageMonths", "");
  const [ageConfirmed, setAgeConfirmed] = usePersistentState("ageConfirmed", false);
  const [ageInvalid, setAgeInvalid] = usePersistentState("ageInvalid", false);
  const [currentIndex, setCurrentIndex] = usePersistentState("currentIndex", [0, 0, 0, 0, 0]);
  const [trackProgress, setProgress] = usePersistentState("trackProgress", [0, 0, 0]);
  const [currentLevel, setLevel] = usePersistentState("currentLevel", 0);
  const [phase, setPhase] = usePersistentState("phase", "initial");
  const [completeMessege, setCompleteMessege] = usePersistentState("completeMessege", "");
  const [questionType, setQuestionType] = usePersistentState("questionType", "C");
  const [showAdvancedChoice, setShowAdvancedChoice] = usePersistentState("showAdvancedChoice", false); // NOW PERSISTENT

  // Microphone persistent
  const [permission, setPermission] = usePersistentState("permission", false);
  const [microphoneSkipped, setMicrophoneSkipped] = usePersistentState("microphoneSkipped", false);
  const [audioChunks, setAudioChunks] = usePersistentState("audioChunks", []);
  const [audioUrl, setAudioUrl] = usePersistentState("audioUrl", null);
  const [recPaused, setPaused] = usePersistentState("recPaused", false);

  // Session-only states
  const [images, setImages] = React.useState([]);
  const [target, setTarget] = React.useState("");
  const [showContinue, setShowContinue] = React.useState(false);
  const [clickedCorrect, setClickedCorrect] = React.useState(false);
  const [sessionCompleted, setSessionCompleted] = React.useState(false);

  // Multi-answer and ordered answer states
  const [answerType, setAnswerType] = React.useState("single"); // "single", "multi", "ordered", "mask"
  const [multiAnswers, setMultiAnswers] = React.useState([]); // Array of correct answer indices
  const [clickedMultiAnswers, setClickedMultiAnswers] = React.useState([]); // Array of clicked correct answers
  const [orderedAnswers, setOrderedAnswers] = React.useState([]); // Array of answer indices in order
  const [orderedClickSequence, setOrderedClickSequence] = React.useState([]); // Sequence of clicks

  // Mask answer states
  const [maskImage, setMaskImage] = React.useState(null); // HTMLImageElement for the mask
  const [maskCanvas, setMaskCanvas] = React.useState(null); // Canvas for pixel detection

  // Mic session-only
  const [stream, setStream] = React.useState(null);
  const [mediaRecorder, setMediaRecorder] = React.useState(null);
  const [recording, setRecording] = React.useState(false);

  // Countdown + recording control
  const [countdown, setCountdown] = React.useState(0);
  const [recordingStopped, setRecordingStopped] = React.useState(false);

  // Image loading state
  const [currentQuestionImagesLoaded, setCurrentQuestionImagesLoaded] = React.useState(false);

  const isMountedRef = React.useRef(true);

  React.useEffect(function cleanupMount() {
    return function () {
      isMountedRef.current = false;
    };
  }, []);

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  function totalMonths() {
    const y = parseInt(ageYears, 10) || 0;
    const m = parseInt(ageMonths, 10) || 0;
    return y * 12 + m;
  }

  function userAgeGroup(age) {
    const benchmarks = [24, 30.5, 35.5, 47.5, 59.5];
    let i = 0;
    while (i < benchmarks.length - 1 && age >= benchmarks[i + 1]) i++;
    return i;
  }

  function ageGroupLabel() {
    const labels = ["2:00-2:06", "2:07-3:00", "3:00-4:00", "4:00-5:00", "5:00-6:00"];
    return labels[currentLevel];
  }

  function getCurrentQuestionIndex() {
    return currentIndex[currentLevel];
  }

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================
  function confirmAge() {
    const y = parseInt(ageYears, 10);
    const m = parseInt(ageMonths, 10);
    if (isNaN(y) || isNaN(m) || m < 0 || m > 11) {
      alert("Please enter a valid age (months 0–11).");
      return;
    }
    const months = totalMonths();
    if (months < 24 || months >= 72) {
      setAgeInvalid(true);
      return;
    }
    const userAge = userAgeGroup(months);
    const initialLevel = Math.max(0, userAge - 1);

    // SPECIAL CONDITION 1: Age group 0 can't do [age group] - 1
    // Start at level 0 with "standard" phase (skip Initial Evaluation)
    if (userAge === 0) {
      setPhase("standard");
      setLevel(0);
    } else {
      setPhase("initial");
      setLevel(initialLevel);
    }

    setAgeConfirmed(true);


    // 👉 Send data to backend (Server that will save to MongoDB)
    // Change http://localhost:5000/api/saveUser to the url of backend server
    // "https://seeandsay-mongodb-backend.onrender.com/"
    try {
      fetch("https://seeandsay-mongodb-backend.onrender.com/api/saveUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "123321", ageYears: y, ageMonths: m }),
      });
    } catch (err) {
      console.error("Failed to save user:", err);
    }
  }
  /// Finish code for sending to backend

  const getMicrophonePermission = async function () {
    if ("MediaRecorder" in window) {
      try {
        const streamData = await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermission(true);
        setStream(streamData);
      } catch (err) {
        alert(err.message);
      }
    } else alert("The MediaRecorder API is not supported in your browser.");
  };

  const skipMicrophone = function () {
    setMicrophoneSkipped(true);
  };

  const handleClick = function (img, event) {
    if (questionType === "C") {
      // Get the image index (1-based)
      const imgIndex = images.indexOf(img) + 1;

      if (answerType === "single") {
        // Original single-answer behavior
        const correct = img === target;
        if (correct) setClickedCorrect(true);
        setShowContinue(true);
      } else if (answerType === "multi") {
        // Multi-answer: check if this is a correct answer
        // CHANGE B: Always show continue when any image is clicked
        setShowContinue(true);

        if (multiAnswers.includes(imgIndex)) {
          // Add to clicked answers if not already clicked
          if (!clickedMultiAnswers.includes(imgIndex)) {
            const newClicked = [...clickedMultiAnswers, imgIndex];
            setClickedMultiAnswers(newClicked);

            // Check if all correct answers have been clicked
            if (newClicked.length === multiAnswers.length) {
              setClickedCorrect(true);
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
    const progress = updateProgress(result);
    const currentIdx = getCurrentQuestionIndex();
    let shouldTransition = false;
    switch (phase) {
      case "initial":
        if (progress[0] >= 3) {
          transitionToNextPhase("standard", currentLevel + 1);
          shouldTransition = true;
        } else if (progress[1] >= 3) {
          // SPECIAL CONDITION 2: Age group 1, can't go to [age group] - 2 = -1
          if (currentLevel === 0) {
            return completeSession("Try another time");
          }
          transitionToNextPhase("reevaluation", currentLevel - 1);
          shouldTransition = true;
        }
        break;
      case "reevaluation":
        if (progress[0] >= 3) {
          transitionToNextPhase("easy", currentLevel + 1);
          shouldTransition = true;
        } else if (progress[1] >= 3) return completeSession("Try another time");
        break;
    }
    if (shouldTransition) return;
    if (currentIdx < questions.length - 1) updateCurrentQuestionIndex(currentIdx + 1);
    else handleLevelCompletion();
  };

  // Recording controls
  const startRecording = function () {
    if (!stream) return;
    const recorder = new MediaRecorder(stream);
    setMediaRecorder(recorder);
    const chunks = [];
    recorder.ondataavailable = function (e) {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = function () {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioChunks(chunks);
      setRecording(false);
      setRecordingStopped(true);
    };
    recorder.start();
    setRecording(true);
    setRecordingStopped(false);

    setTimeout(function () {
      if (recorder.state === "recording") recorder.stop();
    }, 60000);
  };

  const pauseRecording = function () {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      setPaused(true);
    } else if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      setPaused(false);
    }
  };

  const stopRecording = function () {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  };

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================
  function transitionToNextPhase(newPhase, newLevel) {
    const clampedLevel = Math.max(0, Math.min(4, newLevel));
    setPhase(newPhase);
    setLevel(clampedLevel);
    resetProgressForNewLevel();
  }

  function loadQuestionsForLevel(level) {
    const targetAgeGroup = ageGroupLabel();
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
        };
      })
      .filter(function (q) {
        return q.age_group === targetAgeGroup;
      });
    const sorted = filtered.sort(function (a, b) {
      return a.query_type === "הבנה" && b.query_type !== "הבנה" ? -1 : 1;
    });
    setQuestions(sorted);
  }

  function updateCurrentQuestionIndex(newIndex) {
    const newArr = [].concat(currentIndex);
    newArr[currentLevel] = newIndex;
    setCurrentIndex(newArr);
  }

  function loadQuestion(index) {
    const q = questions[index];
    if (!q) return;

    setShowContinue(false);
    setClickedCorrect(false);
    setClickedMultiAnswers([]);
    setOrderedClickSequence([]);
    setMaskImage(null);
    setMaskCanvas(null);

    const imgCount = parseInt(q.image_count, 10) || 1;
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

    // Start countdown for expression questions
    if (q.query_type !== "הבנה") {
      // If microphone was skipped, show traffic lights immediately
      if (microphoneSkipped) {
        setShowContinue(true);
      } else {
        setCountdown(3);
        setRecordingStopped(false);
      }
    }
  }

  function updateProgress(result) {
    const newP = [].concat(trackProgress);
    if (result === "success") newP[0]++;
    if (result === "partial") {
      newP[2]++;
      if (newP[2] >= 2) {
        newP[1]++;
        newP[2] = 0;
      }
    }
    if (result === "failure") newP[1]++;
    setProgress(newP);
    return newP;
  }

  function handleLevelCompletion() {
    // CHANGE C: Read current values directly to avoid stale state
    const currentProgress = trackProgress;
    const currentPhase = phase;
    const level = currentLevel;

    const successes = currentProgress[0];
    const failures = currentProgress[1];

    switch (currentPhase) {
      case "initial":
        transitionToNextPhase("standard", level + 1);
        break;
      case "reevaluation":
        transitionToNextPhase("easy", level + 1);
        break;
      case "standard":
        if (failures >= 3) {
          transitionToNextPhase("easy", Math.max(0, level - 1));
        } else {
          // SPECIAL CONDITION 3: Age group 4, can't show [age group] + 1 = 5
          // Don't show advanced choice, just complete the session
          if (level >= 4) {
            completeSession("Well done!");
          } else {
            setShowAdvancedChoice(true);
          }
        }
        break;
      case "easy":
        completeSession("Well done!");
        break;
      case "hard":
        completeSession("Well done!");
        break;
    }
  }

  function resetProgressForNewLevel() {
    setProgress([0, 0, 0]);
  }

  function completeSession(msg) {
    setCompleteMessege(msg);
    setSessionCompleted(true);
    setImages([]);
  }

  function handleAdvancedChoice(choice) {
    setShowAdvancedChoice(false);
    if (choice) {
      // Move to next age group (currentLevel + 1) for hard questions
      transitionToNextPhase("hard", currentLevel + 1);
    } else {
      completeSession("Finished without advanced questions");
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

  // Update priority when age is confirmed or level changes
  React.useEffect(function updateLoadingPriority() {
    if (!ageConfirmed || allQuestions.length === 0) return;

    const labels = ["2:00-2:06", "2:07-3:00", "3:00-4:00", "4:00-5:00", "5:00-6:00"];
    const priorityGroups = [labels[currentLevel]];

    // Add adjacent levels to priority
    if (currentLevel > 0) priorityGroups.push(labels[currentLevel - 1]);
    if (currentLevel < 4) priorityGroups.push(labels[currentLevel + 1]);

    ImageLoader.updatePriority(priorityGroups);
  }, [ageConfirmed, currentLevel, allQuestions]);

  // Load questions for current level
  React.useEffect(
    function loadLevelQuestions() {
      if (allQuestions.length > 0 && ageConfirmed) {
        loadQuestionsForLevel(currentLevel);
      }
    },
    [currentLevel, allQuestions, ageConfirmed]
  );

  // Load current question
  React.useEffect(
    function loadCurrentQuestion() {
      if (ageConfirmed && questions.length > 0 && !sessionCompleted && !showAdvancedChoice) {
        const idx = getCurrentQuestionIndex();
        loadQuestion(idx);
        checkCurrentQuestionImages();
      }
    },
    [ageConfirmed, questions, currentIndex, currentLevel, sessionCompleted, showAdvancedChoice]
  );

  // Monitor if current question images are loaded
  React.useEffect(function monitorImageLoading() {
    if (!ageConfirmed || questions.length === 0 || sessionCompleted || showAdvancedChoice) {
      return;
    }

    const interval = setInterval(checkCurrentQuestionImages, 100);
    return function () {
      clearInterval(interval);
    };
  }, [ageConfirmed, questions, currentIndex, currentLevel, sessionCompleted, showAdvancedChoice]);

  // Countdown effect
  React.useEffect(
    function countdownEffect() {
      // Skip countdown if microphone was skipped
      if (microphoneSkipped) return;

      if (countdown > 0) {
        const timer = setTimeout(function () {
          setCountdown(function (c) {
            return c - 1;
          });
        }, 1000);
        return function () {
          clearTimeout(timer);
        };
      }
      if (countdown === 0 && questionType === "E" && !recording && !recordingStopped) {
        startRecording();
      }
    },
    [countdown, questionType, recording, recordingStopped, microphoneSkipped]
  );

  // Continue after recording
  React.useEffect(
    function recordingStoppedEffect() {
      if (recordingStopped) {
        setShowContinue(true);
      }
    },
    [recordingStopped]
  );

  // =============================================================================
  // RENDER
  // =============================================================================

  if (!ageConfirmed && !ageInvalid) {
    return React.createElement(
      "div",
      { className: "age-screen" },
      React.createElement("h2", null, "Please enter your age"),
      React.createElement("input", {
        type: "number",
        placeholder: "Years",
        value: ageYears,
        onChange: function (e) {
          setAgeYears(e.target.value.replace(/\D/g, ""));
        },
      }),
      React.createElement("input", {
        type: "number",
        placeholder: "Months",
        value: ageMonths,
        onChange: function (e) {
          setAgeMonths(e.target.value.replace(/\D/g, ""));
        },
      }),
      React.createElement(
        "button",
        { onClick: confirmAge },
        "Continue"
      )
    );
  }

  if (ageInvalid) {
    return React.createElement("div", { className: "age-invalid" }, "Sorry, this age does not fit.");
  }

  if (!permission && !microphoneSkipped) {
    return React.createElement(
      "div",
      { className: "microphone-permission-screen" },
      React.createElement("h2", null, "Microphone Permission"),
      React.createElement("p", null, "This test includes recording questions. Please allow microphone access."),
      React.createElement(
        "button",
        {
          className: "allowMic",
          onClick: getMicrophonePermission
        },
        "Allow Microphone"
      ),
      React.createElement(
        "button",
        {
          className: "skipMic",
          onClick: skipMicrophone,
        },
        "Skip (No Recording)"
      )
    );
  }

  if (sessionCompleted) {
    return React.createElement(
      "div",
      { className: "session-complete" },
      React.createElement("h2", null, "Session Complete!"),
      React.createElement("p", null, completeMessege)
    );
  }

  if (showAdvancedChoice) {
    return React.createElement(
      "div",
      { className: "advanced-choice" },
      React.createElement("h2", null, 'Choice: "Try advanced questions?"'),
      React.createElement(
        "button",
        { onClick: function () { handleAdvancedChoice(true); } },
        "Yes"
      ),
      React.createElement(
        "button",
        { onClick: function () { handleAdvancedChoice(false); } },
        "No"
      )
    );
  }

  if (questions.length === 0) {
    return React.createElement("div", null, "No questions found for current level");
  }

  // Show loading screen ONLY if current question images aren't ready
  if (!currentQuestionImagesLoaded) {
    return React.createElement(
      "div",
      { className: "question-loading-screen" },
      React.createElement("h2", null, "Loading question..."),
      React.createElement("p", null, "Please wait while images load")
    );
  }

  const currentIdx = getCurrentQuestionIndex();
  const phaseNames = {
    initial: "הערכה ראשונית",
    reevaluation: "הערכה חוזרת",
    standard: "מבחן רגיל",
    easy: "רמה קלה",
    hard: "רמה מאתגרת"
  };

  // Main UI
  return React.createElement(
    "div",
    { className: "app-container" },
    React.createElement(
      "div",
      { className: "test-info" },
      React.createElement(
        "div",
        { className: "test-info__header" },
        React.createElement("span", { className: "kicker" }, "מבחן"),
        React.createElement(
          "div",
          { className: "test-info__titleWrap" },
          React.createElement(
            "h3",
            { className: "test-info__title" },
            (phaseNames[phase] || phase) + " · גיל " + ageGroupLabel()
          ),
          React.createElement(
            "p",
            { className: "test-info__subtitle muted" },
            "שאלה " + (currentIdx + 1) + " מתוך " + questions.length
          )
        )
      ),
      React.createElement(
        "div",
        { className: "test-info__stats" },
        React.createElement("span", { className: "stat-chip", title: "תשובות נכונות" }, "✅ " + trackProgress[0] + " הצלחות"),
        React.createElement("span", { className: "stat-chip", "data-tone": "warning", title: "חלקי / צריך חיזוק" }, "🟧 " + trackProgress[2] + " חלקי"),
        React.createElement("span", { className: "stat-chip", "data-tone": "danger", title: "תשובות שגויות" }, "⛔ " + trackProgress[1] + " טעויות")
      )
    ),

    React.createElement(
      "div",
      { className: "question-row" },
      React.createElement("h2", { className: "query-text" }, (questions[currentIdx] && questions[currentIdx].query) || ""),
      showContinue
        ? React.createElement(
          "div",
          { className: "traffic-light" },
          React.createElement("button", {
            className: "light green",
            onClick: function () { handleContinue("success"); },
          }),
          React.createElement("button", {
            className: "light orange",
            onClick: function () { handleContinue("partial"); },
          }),
          React.createElement("button", {
            className: "light red",
            onClick: function () { handleContinue("failure"); },
          })
        )
        : null
    ),

    questionType === "C"
      ? React.createElement(
        "div",
        { className: "images-container" },
        images.map(function (img, i) {
          const imgIndex = i + 1;
          const isCorrectMulti = answerType === "multi" && clickedMultiAnswers.includes(imgIndex);
          const isTargetSingle = answerType === "single" && img === target && clickedCorrect;
          const showFireworks = (isTargetSingle || (answerType === "multi" && clickedCorrect) || (answerType === "mask" && clickedCorrect)) ||
            (answerType === "ordered" && clickedCorrect && orderedAnswers[orderedAnswers.length - 1] === imgIndex);

          return React.createElement(
            "div",
            {
              key: i,
              style: {
                position: "relative",
                border: isCorrectMulti ? "4px solid #00ff00" : "none",
                borderRadius: isCorrectMulti ? "8px" : "0",
                boxShadow: isCorrectMulti ? "0 0 15px rgba(0,255,0,0.6)" : "none"
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
              onClick: function (e) { handleClick(img, e); },
            })
          );
        })
      )
      : null,

    questionType === "E"
      ? React.createElement(
        "div",
        { className: "expression-container" },
        !microphoneSkipped && countdown > 0
          ? React.createElement("h3", null, "Recording starts in " + countdown + "...")
          : null,
        !microphoneSkipped && recording
          ? React.createElement(
            "div",
            null,
            !recPaused
              ? React.createElement("button", { onClick: pauseRecording }, "Pause")
              : React.createElement("button", { onClick: pauseRecording }, "Resume"),
            React.createElement("button", { onClick: stopRecording }, "Stop")
          )
          : null,
        !microphoneSkipped && recordingStopped
          ? React.createElement(
            "div",
            null,
            React.createElement("audio", { src: audioUrl, controls: true })
          )
          : null,
        microphoneSkipped
          ? React.createElement("p", { class: "skippedText" }, "Recording skipped - please evaluate the response")
          : null,
        React.createElement(
          "div",
          { className: "images-container" },
          images.map(function (img, i) {
            return React.createElement(
              "div",
              { key: i },
              React.createElement("img", { src: img, alt: "option " + (i + 1), className: "image" })
            );
          })
        )
      )
      : null
  );
}