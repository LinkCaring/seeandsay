// =============================================================================
// CONTINUOUS SESSION RECORDING MODULE
// Records from session start until completion
// =============================================================================

const SessionRecorder = (function() {
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  let isRecording = false;
  let isPaused = false;
  
  // Question timestamps tracking
  let recordingStartTime = null;
  let questionTimestamps = []; // Array of {questionNumber, timestamp}
  
  // Pause tracking
  let pauseStartTime = null;
  let totalPausedTime = 0; // Total milliseconds paused
  let finalRecordingBlob = null;
  let finalRecordingMeta = null;

  // Max answer window after question start mark (matches expression UI timer).
  const EXPRESSION_ANSWER_MAX_MS = 20000;

  // Get browser-supported audio mime type (prioritize MP4/AAC for MP3-compatible output)
  function getSupportedMimeType() {
    // Prioritize MP4/AAC format for better compatibility (closer to MP3)
    const candidates = [
      "audio/mp4;codecs=mp4a.40.2",  // AAC in MP4 container (MP3-compatible)
      "audio/mp4",                   // MP4 container
      "audio/webm;codecs=opus",      // Fallback: webm with opus
      "audio/webm",                  // Fallback: webm
      "audio/ogg;codecs=opus",       // Fallback: ogg with opus
      "audio/ogg"                    // Fallback: ogg
    ];
    
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return "audio/webm"; // Default fallback
  }

  // Get file extension based on mime type
  function getFileExtension(mimeType) {
    // Always return .mp3 since we'll convert everything to MP3
    return ".mp3";
  }

  // Convert audio blob to MP3
  async function convertToMP3(blob) {
    return new Promise(function(resolve, reject) {
      try {
        // Create audio context to decode the audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const fileReader = new FileReader();
        
        fileReader.onload = function() {
          audioContext.decodeAudioData(fileReader.result)
            .then(function(audioBuffer) {
              // Convert AudioBuffer to PCM data
              const samples = audioBuffer.getChannelData(0); // Mono
              const sampleRate = audioBuffer.sampleRate;
              
              // Convert Float32 samples to Int16 for lamejs
              const int16Samples = new Int16Array(samples.length);
              for (let i = 0; i < samples.length; i++) {
                // Convert from -1.0 to 1.0 range to -32768 to 32767 range
                const s = Math.max(-1, Math.min(1, samples[i]));
                int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              // Use lamejs to encode to MP3
              const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // Mono, sampleRate, bitrate
              const sampleBlockSize = 1152;
              const mp3Data = [];
              
              for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
                const sampleChunk = int16Samples.subarray(i, i + sampleBlockSize);
                const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                if (mp3buf.length > 0) {
                  mp3Data.push(mp3buf);
                }
              }
              
              // Finalize
              const mp3buf = mp3encoder.flush();
              if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
              }
              
              // Create MP3 blob
              const mp3Blob = new Blob(mp3Data, { type: "audio/mpeg" });
              console.log("✅ MP3 conversion complete, size:", mp3Blob.size);
              resolve(mp3Blob);
            })
            .catch(function(err) {
              console.error("Failed to decode audio:", err);
              resolve(blob); // Fallback to original blob
            });
        };
        
        fileReader.onerror = function() {
          console.error("Failed to read audio file");
          resolve(blob); // Fallback to original blob
        };
        
        fileReader.readAsArrayBuffer(blob);
      } catch (err) {
        console.error("Error converting to MP3:", err);
        resolve(blob); // Fallback to original blob
      }
    });
  }

  // Store the mime type globally
  let currentMimeType = "";

  // Get current mime type
  function getCurrentMimeType() {
    return currentMimeType;
  }

  // Get current file extension
  function getCurrentFileExtension() {
    return getFileExtension(currentMimeType);
  }

  function ensureTimingState() {
    if (!recordingStartTime) {
      const stored = localStorage.getItem("recordingStartTime");
      if (stored) {
        recordingStartTime = parseInt(stored, 10);
      } else {
        console.warn("Recording start time not found");
        return false;
      }
    }
    if (totalPausedTime === 0) {
      const storedPausedTime = localStorage.getItem("totalPausedTime");
      if (storedPausedTime) {
        totalPausedTime = parseInt(storedPausedTime, 10);
      }
    }
    if (!isPaused && localStorage.getItem("recordingPaused") === "true") {
      isPaused = true;
    }
    if (!pauseStartTime) {
      const storedPauseStart = localStorage.getItem("pauseStartTime");
      if (storedPauseStart) {
        pauseStartTime = parseInt(storedPauseStart, 10);
      }
    }
    return true;
  }

  function getElapsedMs() {
    if (!ensureTimingState()) return null;
    const currentTime = Date.now();
    let elapsed = currentTime - recordingStartTime - totalPausedTime;
    if (isPaused && pauseStartTime) {
      elapsed -= currentTime - pauseStartTime;
    }
    return Math.max(0, elapsed);
  }

  // Start continuous session recording
  // options.preserveQuestionTimestamps — keep questionTimestamps / session clock (voice re-verify mid-test)
  async function startContinuousRecording(options) {
    try {
      // Remove legacy large payload key to free quota from older versions.
      localStorage.removeItem("sessionRecordingFinal");
      var preserveTs = options && options.preserveQuestionTimestamps;
      // Request microphone access
      const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = userStream;

      // Get preferred mime type (prioritize MP4/AAC for MP3 compatibility)
      const preferredMime = getSupportedMimeType();
      currentMimeType = preferredMime; // Store for later use
      const recorderOptions = preferredMime ? { mimeType: preferredMime } : undefined;

      // Create MediaRecorder
      const recorder = new MediaRecorder(userStream, recorderOptions);
      mediaRecorder = recorder;
      audioChunks = [];

      // Handle data available
      recorder.ondataavailable = function(event) {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
          // Note: We save to localStorage only on stop to avoid performance issues
        }
      };

      // Handle recording stop
      recorder.onstop = async function() {
        const blobType = preferredMime || currentMimeType || (audioChunks[0] && audioChunks[0].type) || "audio/webm";
        const originalBlob = new Blob(audioChunks, { type: blobType });
        
        // Convert to MP3
        console.log("🎵 Converting recording to MP3...");
        const mp3Blob = await convertToMP3(originalBlob);
        const url = URL.createObjectURL(mp3Blob);
        
        finalRecordingBlob = mp3Blob;
        finalRecordingMeta = {
          mimeType: "audio/mpeg",
          timestamp: Date.now()
        };
        // Keep only lightweight metadata in localStorage to avoid quota overflows.
        localStorage.setItem("sessionRecordingFinalMeta", JSON.stringify(finalRecordingMeta));
        localStorage.setItem("sessionRecordingUrl", url);
        console.log("✅ Session recording completed and converted to MP3, length:", audioChunks.length, "size:", mp3Blob.size);
      };

      // Start recording
      recorder.start(10000); // Collect data every 10 seconds
      isRecording = true;
      
      if (preserveTs) {
        try {
          var qts = localStorage.getItem("questionTimestamps");
          questionTimestamps = qts ? JSON.parse(qts) : [];
        } catch (e) {
          questionTimestamps = [];
        }
        var rst = localStorage.getItem("recordingStartTime");
        recordingStartTime = rst ? parseInt(rst, 10) : Date.now();
        var tpt = localStorage.getItem("totalPausedTime");
        totalPausedTime = tpt ? parseInt(tpt, 10) : 0;
        console.log("🎙️ Resuming session recording (preserved marks:", questionTimestamps.length + ")");
      } else {
        recordingStartTime = Date.now();
        questionTimestamps = [];
      }
      
      // Store in localStorage
      localStorage.setItem("sessionRecordingActive", "true");
      localStorage.setItem("recordingStartTime", recordingStartTime.toString());
      localStorage.setItem("totalPausedTime", String(totalPausedTime));
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));

      console.log("🎙️ Started continuous session recording");
      return true;
    } catch (error) {
      console.error("❌ Failed to start recording:", error);
      return false;
    }
  }

  // Stop continuous recording
  function stopContinuousRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      // If paused, resume before stopping to ensure proper onstop handling
      if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
      }
      mediaRecorder.stop();
      isRecording = false;
      isPaused = false;
      localStorage.removeItem("sessionRecordingActive");
      localStorage.removeItem("recordingPaused");
      
      // Stop all tracks
      if (stream) {
        stream.getTracks().forEach(function(track) {
          track.stop();
        });
        stream = null;
      }
      
      console.log("🛑 Stopped continuous session recording");
      return true;
    }
    return false;
  }

  // Pause recording
  function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      isPaused = true;
      pauseStartTime = Date.now();
      
      // Save pause state
      localStorage.setItem("recordingPaused", "true");
      localStorage.setItem("pauseStartTime", pauseStartTime.toString());
      localStorage.setItem("totalPausedTime", totalPausedTime.toString());
      
      // Log pause event in timestamps
      const currentTime = Date.now();
      const elapsedMs = currentTime - recordingStartTime - totalPausedTime;
      questionTimestamps.push({
        questionNumber: "PAUSED",
        timestamp: elapsedMs
      });
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
      
      console.log("⏸️ Paused recording at", formatTimestamp(elapsedMs));
      return true;
    }
    return false;
  }

  // Resume recording
  async function resumeRecording() {
    if (isPaused && mediaRecorder && mediaRecorder.state === "paused") {
      // Calculate paused duration
      if (pauseStartTime) {
        const pauseDuration = Date.now() - pauseStartTime;
        totalPausedTime += pauseDuration;
        localStorage.setItem("totalPausedTime", totalPausedTime.toString());
        console.log("⏸️ Was paused for", formatTimestamp(pauseDuration), "and overall", formatTimestamp(totalPausedTime));
      }
      
      isPaused = false;
      pauseStartTime = null;
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
      
      // Log resume event in timestamps
      const currentTime = Date.now();
      const elapsedMs = currentTime - recordingStartTime - totalPausedTime;
      questionTimestamps.push({
        questionNumber: "RESUMED",
        timestamp: elapsedMs
      });
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
      
      // Resume the paused recording
      try {
        mediaRecorder.resume();
        console.log("▶️ Resumed recording at", formatTimestamp(elapsedMs));
        return true;
      } catch (error) {
        console.error("❌ Failed to resume recording:", error);
        return false;
      }
    }
    return false;
  }

  // Check if recording is paused
  function isRecordingPaused() {
    return isPaused;
  }

  // Get final recording URL
  async function getFinalRecordingUrl() {
    if (finalRecordingBlob) {
      return URL.createObjectURL(finalRecordingBlob);
    }
    const stored = localStorage.getItem("sessionRecordingUrl");
    if (stored) {
      return stored;
    }
    return null;
  }

  // Helper to convert data URL to Blob
  function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // Get final recording data for upload
  async function getFinalRecordingData() {
    if (!finalRecordingBlob) {
      return null;
    }
    return {
      recordingBlob: finalRecordingBlob,
      mimeType: (finalRecordingMeta && finalRecordingMeta.mimeType) || "audio/mpeg",
      timestamp: (finalRecordingMeta && finalRecordingMeta.timestamp) || Date.now()
    };
  }

  function setFinalRecordingBlob(blob, meta) {
    if (!blob) return;
    finalRecordingBlob = blob;
    finalRecordingMeta = {
      mimeType: (meta && meta.mimeType) || blob.type || "audio/mpeg",
      timestamp: (meta && meta.timestamp) || Date.now()
    };
    try {
      localStorage.setItem("sessionRecordingFinalMeta", JSON.stringify(finalRecordingMeta));
    } catch (e) {
      console.warn("Failed to persist recording metadata:", e);
    }
  }

  // Check if recording is active
  function isRecordingActive() {
    return isRecording || localStorage.getItem("sessionRecordingActive") === "true";
  }

  /** True only when a MediaRecorder instance exists and is not stopped (survives only for same page load). */
  function isMediaRecorderLive() {
    return !!(mediaRecorder && mediaRecorder.state !== "inactive");
  }

  // Mark question start with timestamp
  function markQuestionStart(questionNumber) {
    let elapsedMs = getElapsedMs();
    if (elapsedMs == null) return;

    questionTimestamps.push({
      questionNumber: questionNumber,
      timestamp: elapsedMs,
      eventType: "start"
    });
    
    // Save to localStorage for persistence
    localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
    
    console.log("📝 Marked question", questionNumber, "at", formatTimestamp(elapsedMs));
  }

  function getQuestionStartMs(questionNumber) {
    const qKey = String(questionNumber || "");
    if (!qKey) return null;
    for (let i = questionTimestamps.length - 1; i >= 0; i--) {
      const item = questionTimestamps[i];
      if (String(item.questionNumber) === qKey && item.eventType === "start") {
        return item.timestamp;
      }
    }
    return null;
  }

  function hasQuestionEnd(questionNumber) {
    const qKey = String(questionNumber || "");
    return questionTimestamps.some(function (item) {
      return String(item.questionNumber) === qKey && item.eventType === "end";
    });
  }

  function markQuestionEnd(questionNumber) {
    if (hasQuestionEnd(questionNumber)) return;

    let elapsedMs = getElapsedMs();
    if (elapsedMs == null) return;
    const questionNumStr = String(questionNumber || "");
    if (!questionNumStr) return;

    const startMs = getQuestionStartMs(questionNumStr);
    if (startMs != null) {
      const maxEndMs = startMs + EXPRESSION_ANSWER_MAX_MS;
      if (elapsedMs > maxEndMs) {
        elapsedMs = maxEndMs;
      }
      if (elapsedMs <= startMs) {
        return;
      }
    }

    const last = questionTimestamps.length > 0 ? questionTimestamps[questionTimestamps.length - 1] : null;
    if (
      last &&
      String(last.questionNumber) === questionNumStr &&
      last.eventType === "end" &&
      Math.abs((last.timestamp || 0) - elapsedMs) <= 250
    ) {
      return;
    }

    questionTimestamps.push({
      questionNumber: questionNumber,
      timestamp: elapsedMs,
      eventType: "end"
    });
    localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
    console.log("🏁 Marked question end", questionNumber, "at", formatTimestamp(elapsedMs));
  }

  // Format milliseconds to MM:SS
  function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
  }

  // Generate timestamp text file content
  // Returns format: [(1,0),(2,65),(3,127)] - Python tuple style
  function generateTimestampText() {
    // Try to load from localStorage if not in memory
    if (questionTimestamps.length === 0) {
      const stored = localStorage.getItem("questionTimestamps");
      if (stored) {
        try {
          questionTimestamps = JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse stored timestamps:", e);
        }
      }
    }
    
    if (questionTimestamps.length === 0) {
      return "[]";
    }
    
    // Filter out PAUSED and RESUMED entries, only keep actual questions.
    const questionEntries = questionTimestamps.filter(function(item) {
      return item.questionNumber !== "PAUSED" && item.questionNumber !== "RESUMED";
    });

    // Keep legacy tuple format from start markers for backward-compatible inspection.
    const startEntries = questionEntries.filter(function (item) {
      return !item.eventType || item.eventType === "start";
    });
    const timestampTuples = startEntries.map(function(item) {
      const timeInSeconds = Math.floor(item.timestamp / 1000); // Convert ms to seconds, round down
      const questionNum = parseInt(item.questionNumber, 10);
      return "(" + questionNum + "," + timeInSeconds + ")";
    });

    const events = questionEntries.map(function (item) {
      return {
        q: parseInt(item.questionNumber, 10),
        t: Math.floor((item.timestamp || 0) / 1000),
        type: item.eventType === "end" ? "end" : "start",
      };
    });

    return JSON.stringify({
      version: 2,
      format: "question_events",
      events: events,
      legacyStarts: "[" + timestampTuples.join(",") + "]",
    });
  }

  // Download timestamp text file
  function downloadTimestampFile(userId) {
    const textContent = generateTimestampText();
    const blob = new Blob([textContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "question_timestamps_" + (userId || "user") + "_" + Date.now() + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log("📥 Downloaded timestamp file");
  }

  // Get timestamp text (for backend upload)
  function getTimestampText() {
    return generateTimestampText();
  }

  // Get recording and text data for backend upload
  async function getRecordingAndText() {
    const timestampText = getTimestampText();

    if (!finalRecordingBlob) {
      console.warn("No recording data found");
      return null;
    }

    return {
      recordingBlob: finalRecordingBlob,                                         // Audio blob (MP3 format)
      mimeType: (finalRecordingMeta && finalRecordingMeta.mimeType) || "audio/mpeg",
      timestampText: timestampText,                                              // Timestamp text for questions
      recordingDate: (finalRecordingMeta && finalRecordingMeta.timestamp) || Date.now()
    };
  }

  // Reset timestamps (for restarting recording)
  function resetTimestamps() {
    questionTimestamps = [];
    localStorage.removeItem("questionTimestamps");
    console.log("🔄 Reset timestamps");
  }

  // Clean up on session end
  // options.preserveQuestionTimestamps — keep timeline data when re-starting recording after mid-test voice re-verify
  function cleanup(options) {
    var preserveTs = options && options.preserveQuestionTimestamps;
    stopContinuousRecording();
    localStorage.removeItem("sessionRecordingActive");
    localStorage.removeItem("sessionRecordingUrl");
    localStorage.removeItem("sessionRecordingFinal");
    localStorage.removeItem("sessionRecordingFinalMeta");
    localStorage.removeItem("sessionRecordingChunks");
    finalRecordingBlob = null;
    finalRecordingMeta = null;
    if (!preserveTs) {
      localStorage.removeItem("recordingStartTime");
      localStorage.removeItem("questionTimestamps");
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
      localStorage.removeItem("totalPausedTime");
      recordingStartTime = null;
      questionTimestamps = [];
      totalPausedTime = 0;
      pauseStartTime = null;
      isPaused = false;
    } else {
      try {
        var qts = localStorage.getItem("questionTimestamps");
        questionTimestamps = qts ? JSON.parse(qts) : [];
      } catch (e) {
        questionTimestamps = [];
      }
      var rst = localStorage.getItem("recordingStartTime");
      recordingStartTime = rst ? parseInt(rst, 10) : null;
      var tpt = localStorage.getItem("totalPausedTime");
      totalPausedTime = tpt ? parseInt(tpt, 10) : 0;
      pauseStartTime = null;
      isPaused = false;
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
    }
    console.log("🧹 Cleaned up session recording" + (preserveTs ? " (preserved question timestamps)" : ""));
  }

  // Get final recording URL (synchronous version for immediate use)
  function getFinalRecordingUrlSync() {
    if (finalRecordingBlob) {
      const url = URL.createObjectURL(finalRecordingBlob);
      localStorage.setItem("sessionRecordingUrl", url);
      return url;
    }
    return null;
  }

  // Public API
  return {
    startContinuousRecording: startContinuousRecording,
    stopContinuousRecording: stopContinuousRecording,
    pauseRecording: pauseRecording,
    resumeRecording: resumeRecording,
    isRecordingPaused: isRecordingPaused,
    getFinalRecordingUrl: getFinalRecordingUrl,
    getFinalRecordingUrlSync: getFinalRecordingUrlSync,
    getFinalRecordingData: getFinalRecordingData,
    setFinalRecordingBlob: setFinalRecordingBlob,
    getCurrentMimeType: getCurrentMimeType,
    getCurrentFileExtension: getCurrentFileExtension,
    isRecordingActive: isRecordingActive,
    isMediaRecorderLive: isMediaRecorderLive,
    markQuestionStart: markQuestionStart,
    markQuestionEnd: markQuestionEnd,
    downloadTimestampFile: downloadTimestampFile,
    getTimestampText: getTimestampText,
    getRecordingAndText: getRecordingAndText,
    resetTimestamps: resetTimestamps,
    cleanup: cleanup
  };
})();

