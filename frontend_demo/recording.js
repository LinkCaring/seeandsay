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

  // Start continuous session recording
  // options.preserveQuestionTimestamps — keep questionTimestamps / session clock (voice re-verify mid-test)
  async function startContinuousRecording(options) {
    try {
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
        
        // Save final MP3 recording to localStorage for persistence through page refresh
        const reader = new FileReader();
        reader.onloadend = function() {
          try {
            const base64data = reader.result;
            localStorage.setItem("sessionRecordingFinal", JSON.stringify({
              audio: base64data,
              mimeType: "audio/mpeg", // MP3 mime type
              timestamp: Date.now()
            }));
            console.log("✅ Saved MP3 recording to localStorage");
          } catch (e) {
            console.warn("Failed to save final recording:", e);
          }
        };
        
        reader.onerror = function() {
          console.warn("Error reading recording blob");
        };
        
        reader.readAsDataURL(mp3Blob);
        
        localStorage.setItem("sessionRecordingUrl", url);
        console.log("✅ Session recording completed and converted to MP3, length:", audioChunks.length);
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
    const stored = localStorage.getItem("sessionRecordingUrl");
    if (stored) {
      return stored;
    }
    
    // Try to reconstruct from localStorage data
    const finalData = localStorage.getItem("sessionRecordingFinal");
    if (finalData) {
      try {
        const data = JSON.parse(finalData);
        currentMimeType = data.mimeType || currentMimeType; // Update mime type
        const blob = dataURLtoBlob(data.audio);
        return URL.createObjectURL(blob);
      } catch (e) {
        console.error("Failed to reconstruct recording:", e);
      }
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
    const finalData = localStorage.getItem("sessionRecordingFinal");
    if (finalData) {
      try {
        return JSON.parse(finalData);
      } catch (e) {
        console.error("Failed to parse final recording data:", e);
      }
    }
    return null;
  }

  // Check if recording is active
  function isRecordingActive() {
    return isRecording || localStorage.getItem("sessionRecordingActive") === "true";
  }

  // Mark question start with timestamp
  function markQuestionStart(questionNumber) {
    if (!recordingStartTime) {
      // Try to recover from localStorage if page was refreshed
      const stored = localStorage.getItem("recordingStartTime");
      if (stored) {
        recordingStartTime = parseInt(stored, 10);
      } else {
        console.warn("Recording start time not found");
        return;
      }
    }
    
    // Recover totalPausedTime if not in memory
    if (totalPausedTime === 0) {
      const storedPausedTime = localStorage.getItem("totalPausedTime");
      if (storedPausedTime) {
        totalPausedTime = parseInt(storedPausedTime, 10);
      }
      console.log(totalPausedTime, "total")

    }
    
    const currentTime = Date.now();
    let elapsedMs = currentTime - recordingStartTime - totalPausedTime; // Exclude paused time
    
    // Check if this is the first question 1 marking - ensure it's always at 0 seconds
    // Check if there are any existing question 1 timestamps (handle both string and number)
    const hasQuestion1 = questionTimestamps.some(function(item) {
      const itemNum = String(item.questionNumber);
      const currentNum = String(questionNumber);
      return itemNum === "1" || itemNum === currentNum;
    });
    
    // If this is question 1 and it's the first time marking it, set to 0
    const questionNumStr = String(questionNumber);
    if (questionNumStr === "1" && !hasQuestion1) {
      elapsedMs = 0;
    }
    
    questionTimestamps.push({
      questionNumber: questionNumber,
      timestamp: elapsedMs
    });
    
    // Save to localStorage for persistence
    localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
    
    console.log("📝 Marked question", questionNumber, "at", formatTimestamp(elapsedMs));
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
    
    // Filter out PAUSED and RESUMED entries, only keep actual questions
    const questionEntries = questionTimestamps.filter(function(item) {
      return item.questionNumber !== "PAUSED" && item.questionNumber !== "RESUMED";
    });
    
    // Convert to Python tuple format: [(1,0),(2,65),(3,127)]
    const timestampTuples = questionEntries.map(function(item) {
      const timeInSeconds = Math.floor(item.timestamp / 1000); // Convert ms to seconds, round down
      const questionNum = parseInt(item.questionNumber, 10);
      return "(" + questionNum + "," + timeInSeconds + ")";
    });
    
    return "[" + timestampTuples.join(",") + "]";
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
    const finalData = localStorage.getItem("sessionRecordingFinal");
    const timestampText = getTimestampText();
    
    if (!finalData) {
      console.warn("No recording data found");
      return null;
    }
    
    try {
      const data = JSON.parse(finalData);
      const blob = dataURLtoBlob(data.audio);
      
      return {
        recordingBlob: blob,           // Audio blob (MP3 format)
        mimeType: data.mimeType,       // MIME type (should be "audio/mpeg")
        timestampText: timestampText,  // Timestamp text for questions
        recordingDate: data.timestamp  // When the recording was created
      };
    } catch (e) {
      console.error("Failed to prepare recording data:", e);
      return null;
    }
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
    localStorage.removeItem("sessionRecordingChunks");
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
    // Don't use the stored URL as it becomes invalid after page refresh
    // Always reconstruct from localStorage data
    const finalData = localStorage.getItem("sessionRecordingFinal");
    if (finalData) {
      try {
        const data = JSON.parse(finalData);
        currentMimeType = data.mimeType || "audio/mpeg";
        const blob = dataURLtoBlob(data.audio);
        const url = URL.createObjectURL(blob);
        // Update the stored URL for this session
        localStorage.setItem("sessionRecordingUrl", url);
        return url;
      } catch (e) {
        console.error("Failed to reconstruct recording:", e);
      }
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
    getCurrentMimeType: getCurrentMimeType,
    getCurrentFileExtension: getCurrentFileExtension,
    isRecordingActive: isRecordingActive,
    markQuestionStart: markQuestionStart,
    downloadTimestampFile: downloadTimestampFile,
    getTimestampText: getTimestampText,
    getRecordingAndText: getRecordingAndText,
    resetTimestamps: resetTimestamps,
    cleanup: cleanup
  };
})();

