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

  /** Per-expression-question clip (separate from full-session MediaRecorder). */
  let expressionMediaRecorder = null;
  let expressionAudioChunks = [];
  let expressionStream = null;
  let expressionStopResolve = null;
  /** Active recording time cap (pause does not extend the window); see PLAN / server trim. */
  let expressionClipAutoStopTimerId = null;
  let expressionClipSegmentStartedAt = null;
  let expressionClipAutoStopRemainingMs = null;
  /** In-flight stop promise so timer + UI cannot double-stop or orphan waiters. */
  let expressionClipStopPromise = null;
  /**
   * Last encoded clip for the current expression question (set on recorder onstop).
   * When the 30s cap auto-stops before traffic submit, a second stop() would return null
   * without this cache — causing missing_clip_at_finalize on the server.
   */
  let cachedExpressionClipBlob = null;
  /** Question id the cached blob belongs to (same-question reuse after 30s cap only). */
  let cachedExpressionClipQuestion = null;
  let expressionClipActiveQuestion = null;
  
  // Question timestamps tracking
  let recordingStartTime = null;
  let questionTimestamps = []; // Array of {questionNumber, timestamp}
  
  // Pause tracking
  let pauseStartTime = null;
  let totalPausedTime = 0; // Total milliseconds paused
  let finalRecordingBlob = null;
  let finalRecordingMeta = null;

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
  /** Yield so the browser can paint / start <audio> before heavy MP3 work (reduces stutter between questions). */
  function yieldBeforeMp3Encode() {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(
          function () {
            resolve();
          },
          { timeout: 400 }
        );
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /** After traffic advances the UI, let the next question <audio> start before blocking on encode (same thread). */
  function yieldForQuestionAudioHandoff() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
      } else {
        setTimeout(resolve, 0);
      }
    }).then(function () {
      return new Promise(function (resolve) {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(resolve, { timeout: 120 });
        } else {
          setTimeout(resolve, 16);
        }
      });
    });
  }

  /** Lazy singleton; null = not created yet, false = unavailable or hard-failed. */
  let mp3Worker = null;
  let mp3WorkerJobId = 0;
  const mp3WorkerPending = new Map();

  function getMp3WorkerScriptUrl() {
    var v = typeof window !== "undefined" && window._v ? window._v : Date.now();
    return "./mp3-encode-worker.js?v=" + v;
  }

  function terminateMp3WorkerHard(reason) {
    if (mp3Worker && typeof mp3Worker.terminate === "function") {
      try {
        mp3Worker.terminate();
      } catch (e) {
        /* ignore */
      }
    }
    mp3Worker = false;
    if (reason) {
      console.warn("MP3 worker disabled:", reason);
    }
  }

  function initMp3WorkerOnce() {
    if (mp3Worker === false) {
      return null;
    }
    if (mp3Worker != null) {
      return mp3Worker;
    }
    if (typeof Worker === "undefined") {
      mp3Worker = false;
      return null;
    }
    if (typeof window !== "undefined" && window.SEEANDSAY_MP3_WORKER === false) {
      mp3Worker = false;
      return null;
    }
    try {
      var w = new Worker(getMp3WorkerScriptUrl());
      w.onmessage = function (ev) {
        var d = ev.data || {};
        var pending = mp3WorkerPending.get(d.id);
        if (!pending) {
          return;
        }
        mp3WorkerPending.delete(d.id);
        if (d.ok && d.arrayBuffer) {
          var len =
            typeof d.byteLength === "number" ? d.byteLength : d.arrayBuffer.byteLength;
          var b = new Blob([new Uint8Array(d.arrayBuffer, 0, len)], { type: "audio/mpeg" });
          pending.resolve(b);
        } else {
          pending.reject(new Error(d.message || "worker encode failed"));
        }
      };
      w.onerror = function (err) {
        console.warn("mp3-encode-worker:", err);
        mp3WorkerPending.forEach(function (p) {
          p.reject(new Error("mp3 worker load/runtime error"));
        });
        mp3WorkerPending.clear();
        terminateMp3WorkerHard("onerror");
      };
      mp3Worker = w;
      return w;
    } catch (e) {
      console.warn("MP3 worker could not start:", e);
      mp3Worker = false;
      return null;
    }
  }

  function readBlobAsArrayBuffer(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(new Error("FileReader failed"));
      };
      fr.readAsArrayBuffer(blob);
    });
  }

  /** Average all channels to mono (matches worker-era behavior for stereo mics). */
  function mixAudioBufferToMono(audioBuffer) {
    var n = audioBuffer.numberOfChannels;
    var len = audioBuffer.length;
    if (n === 1) {
      return audioBuffer.getChannelData(0);
    }
    var out = new Float32Array(len);
    for (var i = 0; i < len; i++) {
      var sum = 0;
      for (var c = 0; c < n; c++) {
        sum += audioBuffer.getChannelData(c)[i];
      }
      out[i] = sum / n;
    }
    return out;
  }

  /** Decode blob on the main thread (decodeAudioData is not available in many workers). */
  function decodeBlobToMonoFloat32(blob) {
    return readBlobAsArrayBuffer(blob).then(function (ab) {
      var audioContext = new (window.AudioContext || window.webkitAudioContext)();
      var copy = ab.slice(0);
      return audioContext.decodeAudioData(copy).then(function (buf) {
        try {
          if (audioContext.close) {
            audioContext.close();
          }
        } catch (eClose) {
          /* ignore */
        }
        var mono = mixAudioBufferToMono(buf);
        return { sampleRate: buf.sampleRate, mono: mono };
      });
    });
  }

  function encodeMonoFloat32ToMp3OnMain(mono, sampleRate) {
    var int16Samples = new Int16Array(mono.length);
    for (var i = 0; i < mono.length; i++) {
      var s = Math.max(-1, Math.min(1, mono[i]));
      int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    var mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
    var sampleBlockSize = 1152;
    var mp3Data = [];
    for (var j = 0; j < int16Samples.length; j += sampleBlockSize) {
      var sampleChunk = int16Samples.subarray(j, j + sampleBlockSize);
      var mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    var flushOut = mp3encoder.flush();
    if (flushOut.length > 0) {
      mp3Data.push(flushOut);
    }
    return new Blob(mp3Data, { type: "audio/mpeg" });
  }

  function convertToMP3WithWorker(blob) {
    return decodeBlobToMonoFloat32(blob).then(function (decoded) {
      var w = initMp3WorkerOnce();
      if (!w) {
        return Promise.reject(new Error("no worker"));
      }
      var monoCopy = new Float32Array(decoded.mono.length);
      monoCopy.set(decoded.mono);
      return new Promise(function (resolve, reject) {
        var id = ++mp3WorkerJobId;
        var timeoutMs = 180000;
        var timer = setTimeout(function () {
          if (!mp3WorkerPending.has(id)) {
            return;
          }
          mp3WorkerPending.delete(id);
          reject(new Error("mp3 worker timeout"));
          try {
            w.terminate();
          } catch (e2) {
            /* ignore */
          }
          mp3Worker = null;
        }, timeoutMs);
        mp3WorkerPending.set(id, {
          resolve: function (b) {
            clearTimeout(timer);
            resolve(b);
          },
          reject: function (e) {
            clearTimeout(timer);
            reject(e);
          },
        });
        try {
          w.postMessage(
            {
              type: "encodePcm",
              id: id,
              sampleRate: decoded.sampleRate,
              pcm: monoCopy.buffer,
              sampleCount: monoCopy.length,
            },
            [monoCopy.buffer]
          );
        } catch (postErr) {
          clearTimeout(timer);
          mp3WorkerPending.delete(id);
          reject(postErr);
        }
      });
    });
  }

  async function convertToMP3(blob) {
    var allowWorker =
      typeof window === "undefined" || window.SEEANDSAY_MP3_WORKER !== false;
    if (allowWorker && initMp3WorkerOnce()) {
      try {
        var outW = await convertToMP3WithWorker(blob);
        console.log("✅ MP3 conversion complete (worker), size:", outW.size);
        return outW;
      } catch (e) {
        console.warn("Worker MP3 encode failed, using main thread:", e);
      }
    }
    return convertToMP3OnMainThread(blob);
  }

  async function convertToMP3OnMainThread(blob) {
    try {
      var decoded = await decodeBlobToMonoFloat32(blob);
      var mp3Blob = encodeMonoFloat32ToMp3OnMain(decoded.mono, decoded.sampleRate);
      console.log("✅ MP3 conversion complete (main thread), size:", mp3Blob.size);
      return mp3Blob;
    } catch (err) {
      console.error("Error converting to MP3:", err);
      return blob;
    }
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
    return true;
  }

  function getElapsedMs() {
    if (!ensureTimingState()) return null;
    const currentTime = Date.now();
    return Math.max(0, currentTime - recordingStartTime - totalPausedTime);
  }

  /**
   * Session wall clock for question marks without starting full-session MediaRecorder
   * (comprehension timing only; expression uses startExpressionClipRecording).
   */
  function initSessionTimelineClock(options) {
    var preserveTs = options && options.preserveQuestionTimestamps;
    if (!preserveTs) {
      recordingStartTime = Date.now();
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
      recordingStartTime = rst ? parseInt(rst, 10) : Date.now();
      var tpt = localStorage.getItem("totalPausedTime");
      totalPausedTime = tpt ? parseInt(tpt, 10) : 0;
      pauseStartTime = null;
      isPaused = false;
    }
    try {
      localStorage.setItem("recordingStartTime", String(recordingStartTime));
      localStorage.setItem("totalPausedTime", String(totalPausedTime));
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
    } catch (e) {
      console.warn("initSessionTimelineClock localStorage:", e);
    }
    console.log("🕒 Session question timeline clock started (no session MediaRecorder)");
    return true;
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
        await yieldBeforeMp3Encode();
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

  /** Matches expression UI timer + server GEMINI_MAX_SEGMENT_SECONDS trim (stored cap). */
  function getExpressionClipPolicyMaxSec() {
    var capSec = 30;
    try {
      if (typeof window !== "undefined" && window.SEEANDSAY_EXPRESSION_CLIP_MAX_SECONDS != null) {
        var n = Number(window.SEEANDSAY_EXPRESSION_CLIP_MAX_SECONDS);
        if (!isNaN(n) && isFinite(n)) {
          capSec = n;
        }
      }
    } catch (e) {}
    return Math.min(120, Math.max(5, capSec));
  }

  /**
   * Active recording auto-stop budget (policy seconds + grace).
   * Grace compensates MediaRecorder chunking / MP3 encode so DB trim (~30s) still holds ~30s of speech.
   */
  function getExpressionClipRecordingGraceMs() {
    var graceMs = 800;
    try {
      if (
        typeof window !== "undefined" &&
        window.SEEANDSAY_EXPRESSION_CLIP_RECORDING_GRACE_MS != null
      ) {
        var g = Number(window.SEEANDSAY_EXPRESSION_CLIP_RECORDING_GRACE_MS);
        if (!isNaN(g) && isFinite(g)) {
          graceMs = g;
        }
      }
    } catch (e) {}
    return Math.min(3000, Math.max(0, Math.round(graceMs)));
  }

  function getExpressionClipMaxMs() {
    return Math.round(getExpressionClipPolicyMaxSec() * 1000) + getExpressionClipRecordingGraceMs();
  }

  function clearExpressionClipAutoStopTimer() {
    if (expressionClipAutoStopTimerId != null) {
      clearTimeout(expressionClipAutoStopTimerId);
      expressionClipAutoStopTimerId = null;
    }
  }

  function resetExpressionClipAutoStopScheduling() {
    clearExpressionClipAutoStopTimer();
    expressionClipSegmentStartedAt = null;
    expressionClipAutoStopRemainingMs = null;
  }

  function scheduleExpressionClipAutoStopIfRecording() {
    clearExpressionClipAutoStopTimer();
    if (!expressionMediaRecorder || expressionMediaRecorder.state !== "recording") {
      return;
    }
    if (expressionClipAutoStopRemainingMs == null) {
      return;
    }
    if (expressionClipAutoStopRemainingMs <= 0) {
      console.log("⏱️ Expression clip auto-stop (active recording cap reached)");
      stopExpressionClipRecording().catch(function () {});
      return;
    }
    expressionClipSegmentStartedAt = Date.now();
    expressionClipAutoStopTimerId = setTimeout(function () {
      expressionClipAutoStopTimerId = null;
      expressionClipSegmentStartedAt = null;
      if (
        expressionMediaRecorder &&
        expressionMediaRecorder.state === "recording"
      ) {
        var policySec = getExpressionClipPolicyMaxSec();
        var graceSec = (getExpressionClipRecordingGraceMs() / 1000).toFixed(1);
        console.log(
          "⏱️ Expression clip auto-stop at recording cap (" +
            policySec +
            "s policy +" +
            graceSec +
            "s grace for encode/chunk alignment)"
        );
        stopExpressionClipRecording().catch(function () {});
      }
    }, expressionClipAutoStopRemainingMs);
  }

  function onExpressionClipPausedForAutoStop() {
    if (expressionClipSegmentStartedAt == null) {
      return;
    }
    clearExpressionClipAutoStopTimer();
    var elapsed = Date.now() - expressionClipSegmentStartedAt;
    expressionClipSegmentStartedAt = null;
    expressionClipAutoStopRemainingMs = Math.max(
      0,
      (expressionClipAutoStopRemainingMs || 0) - elapsed
    );
  }

  function onExpressionClipResumedForAutoStop() {
    if (expressionClipAutoStopRemainingMs == null) {
      return;
    }
    scheduleExpressionClipAutoStopIfRecording();
  }

  /** Freeze active-time cap (test pause / clapping) — same idea as popup countdown freeze. */
  function freezeExpressionClipActiveCap() {
    clearExpressionClipAutoStopTimer();
    if (expressionMediaRecorder && expressionMediaRecorder.state === "recording") {
      onExpressionClipPausedForAutoStop();
    }
  }

  /**
   * After UI resume, ensure clip cap is not shorter than popup time left (+ encode grace).
   * Prevents "long pause then resume → recorder already dead" when timers diverged.
   */
  function alignExpressionClipActiveCapToUiMs(uiRemainingMs) {
    if (!expressionMediaRecorder) {
      return;
    }
    var state = expressionMediaRecorder.state;
    if (state !== "recording" && state !== "paused") {
      return;
    }
    var uiMs = Math.max(0, Number(uiRemainingMs) || 0);
    var target = uiMs + getExpressionClipRecordingGraceMs();
    if (expressionClipAutoStopRemainingMs == null) {
      expressionClipAutoStopRemainingMs = target;
    } else {
      expressionClipAutoStopRemainingMs = Math.max(expressionClipAutoStopRemainingMs, target);
    }
    if (state === "recording") {
      scheduleExpressionClipAutoStopIfRecording();
    }
  }

  function isExpressionClipActive() {
    return !!(
      expressionMediaRecorder &&
      (expressionMediaRecorder.state === "recording" ||
        expressionMediaRecorder.state === "paused")
    );
  }

  function discardCachedExpressionClipBlob() {
    cachedExpressionClipBlob = null;
    cachedExpressionClipQuestion = null;
  }

  async function startExpressionClipRecording(questionNumber) {
    var qKey =
      questionNumber != null && questionNumber !== ""
        ? String(questionNumber)
        : null;
    expressionClipActiveQuestion = qKey;

    if (expressionMediaRecorder && expressionMediaRecorder.state === "recording") {
      return true;
    }
    // After 30s cap: recorder is idle but blob may still be encoding or cached for traffic submit.
    if (expressionClipStopPromise) {
      try {
        await expressionClipStopPromise;
      } catch (e) {}
    }
    if (cachedExpressionClipBlob && cachedExpressionClipBlob.size > 0) {
      if (qKey && cachedExpressionClipQuestion === qKey) {
        console.log("🎙️ Expression clip: cached blob ready (waiting for traffic submit)");
        return true;
      }
      if (qKey && cachedExpressionClipQuestion && cachedExpressionClipQuestion !== qKey) {
        console.warn(
          "🎙️ Expression clip: discarding cached blob for question",
          cachedExpressionClipQuestion,
          "(now on question",
          qKey + ")"
        );
        discardCachedExpressionClipBlob();
      } else if (!qKey) {
        console.log("🎙️ Expression clip: cached blob ready (waiting for traffic submit)");
        return true;
      } else if (qKey && !cachedExpressionClipQuestion) {
        console.warn("🎙️ Expression clip: discarding untagged cached blob before question", qKey);
        discardCachedExpressionClipBlob();
      }
    }
    discardCachedExpressionClipBlob();
    resetExpressionClipAutoStopScheduling();
    try {
      const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      expressionStream = userStream;
      const preferredMime = getSupportedMimeType();
      currentMimeType = preferredMime;
      const recorderOptions = preferredMime ? { mimeType: preferredMime } : undefined;
      const recorder = new MediaRecorder(userStream, recorderOptions);
      expressionMediaRecorder = recorder;
      expressionAudioChunks = [];
      recorder.ondataavailable = function (event) {
        if (event.data.size > 0) {
          expressionAudioChunks.push(event.data);
        }
      };
      recorder.onstop = async function () {
        const blobType =
          preferredMime ||
          currentMimeType ||
          (expressionAudioChunks[0] && expressionAudioChunks[0].type) ||
          "audio/webm";
        const originalBlob = new Blob(expressionAudioChunks, { type: blobType });
        var mp3Blob = null;
        try {
          await yieldForQuestionAudioHandoff();
          await yieldBeforeMp3Encode();
          mp3Blob = await convertToMP3(originalBlob);
        } catch (e) {
          console.error("Expression clip MP3 convert failed:", e);
          mp3Blob = originalBlob;
        }
        cachedExpressionClipBlob = mp3Blob && mp3Blob.size > 0 ? mp3Blob : null;
        cachedExpressionClipQuestion = expressionClipActiveQuestion;
        if (expressionStopResolve) {
          expressionStopResolve(mp3Blob);
          expressionStopResolve = null;
        }
        expressionMediaRecorder = null;
        expressionAudioChunks = [];
        if (expressionStream) {
          expressionStream.getTracks().forEach(function (track) {
            track.stop();
          });
          expressionStream = null;
        }
      };
      recorder.start(4000);
      expressionClipAutoStopRemainingMs = getExpressionClipMaxMs();
      scheduleExpressionClipAutoStopIfRecording();
      console.log("🎙️ Expression clip recording started");
      return true;
    } catch (error) {
      console.error("❌ Failed to start expression clip recording:", error);
      return false;
    }
  }

  function takeCachedExpressionClipBlob() {
    if (!cachedExpressionClipBlob || cachedExpressionClipBlob.size <= 0) {
      return null;
    }
    var blob = cachedExpressionClipBlob;
    discardCachedExpressionClipBlob();
    return blob;
  }

  function stopExpressionClipRecording() {
    clearExpressionClipAutoStopTimer();
    expressionClipSegmentStartedAt = null;
    if (!expressionMediaRecorder || expressionMediaRecorder.state === "inactive") {
      resetExpressionClipAutoStopScheduling();
      // Auto-stop may still be encoding MP3; traffic submit must await that, not return null.
      if (expressionClipStopPromise) {
        return expressionClipStopPromise;
      }
      var cached = takeCachedExpressionClipBlob();
      if (cached) {
        console.log("🎙️ Expression clip: reusing blob from prior stop (e.g. 30s cap before traffic)");
      }
      return Promise.resolve(cached);
    }
    if (expressionClipStopPromise) {
      return expressionClipStopPromise;
    }
    expressionClipStopPromise = new Promise(function (resolve) {
      var settled = false;
      function finish(blob) {
        if (settled) {
          return;
        }
        settled = true;
        expressionClipStopPromise = null;
        resetExpressionClipAutoStopScheduling();
        resolve(blob);
      }
      if (!expressionMediaRecorder || expressionMediaRecorder.state === "inactive") {
        finish(takeCachedExpressionClipBlob());
        return;
      }
      expressionStopResolve = function (blob) {
        expressionStopResolve = null;
        finish(blob);
      };
      try {
        if (expressionMediaRecorder.state === "paused") {
          expressionMediaRecorder.resume();
        }
        expressionMediaRecorder.stop();
      } catch (e) {
        console.warn("stopExpressionClipRecording:", e);
        expressionStopResolve = null;
        finish(null);
      }
    });
    return expressionClipStopPromise;
  }

  function isExpressionClipRecording() {
    return !!(expressionMediaRecorder && expressionMediaRecorder.state === "recording");
  }

  // Pause recording
  function pauseRecording() {
    if (expressionMediaRecorder && expressionMediaRecorder.state === "recording") {
      expressionMediaRecorder.pause();
      isPaused = true;
      pauseStartTime = Date.now();
      localStorage.setItem("recordingPaused", "true");
      localStorage.setItem("pauseStartTime", pauseStartTime.toString());
      localStorage.setItem("totalPausedTime", totalPausedTime.toString());
      const currentTime = Date.now();
      const elapsedMs = currentTime - recordingStartTime - totalPausedTime;
      questionTimestamps.push({
        questionNumber: "PAUSED",
        timestamp: elapsedMs
      });
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
      onExpressionClipPausedForAutoStop();
      console.log("⏸️ Paused expression clip at", formatTimestamp(elapsedMs));
      return true;
    }
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
    if (isPaused && expressionMediaRecorder && expressionMediaRecorder.state === "paused") {
      if (pauseStartTime) {
        const pauseDuration = Date.now() - pauseStartTime;
        totalPausedTime += pauseDuration;
        localStorage.setItem("totalPausedTime", totalPausedTime.toString());
      }
      isPaused = false;
      pauseStartTime = null;
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
      const currentTime = Date.now();
      const elapsedMs = currentTime - recordingStartTime - totalPausedTime;
      questionTimestamps.push({
        questionNumber: "RESUMED",
        timestamp: elapsedMs
      });
      localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
      try {
        expressionMediaRecorder.resume();
        onExpressionClipResumedForAutoStop();
        console.log("▶️ Resumed expression clip at", formatTimestamp(elapsedMs));
        return true;
      } catch (error) {
        console.error("❌ Failed to resume expression clip:", error);
        return false;
      }
    }
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
    return (
      isRecording ||
      localStorage.getItem("sessionRecordingActive") === "true" ||
      !!(expressionMediaRecorder && expressionMediaRecorder.state === "recording")
    );
  }

  /** True only when a MediaRecorder instance exists and is not stopped (survives only for same page load). */
  function isMediaRecorderLive() {
    return !!(mediaRecorder && mediaRecorder.state !== "inactive");
  }

  // Mark question start with timestamp
  function markQuestionStart(questionNumber) {
    let elapsedMs = getElapsedMs();
    if (elapsedMs == null) return;
    
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
      timestamp: elapsedMs,
      eventType: "start"
    });
    
    // Save to localStorage for persistence
    localStorage.setItem("questionTimestamps", JSON.stringify(questionTimestamps));
    
    console.log("📝 Marked question", questionNumber, "at", formatTimestamp(elapsedMs));
  }

  function markQuestionEnd(questionNumber) {
    const elapsedMs = getElapsedMs();
    if (elapsedMs == null) return;
    const questionNumStr = String(questionNumber || "");
    if (!questionNumStr) return;

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
    clearExpressionClipAutoStopTimer();
    expressionClipSegmentStartedAt = null;
    expressionClipAutoStopRemainingMs = null;
    expressionClipStopPromise = null;
    discardCachedExpressionClipBlob();
    expressionClipActiveQuestion = null;
    if (expressionMediaRecorder && expressionMediaRecorder.state !== "inactive") {
      var pendingResolve = expressionStopResolve;
      expressionStopResolve = null;
      try {
        if (expressionMediaRecorder.state === "paused") {
          expressionMediaRecorder.resume();
        }
        expressionMediaRecorder.stop();
      } catch (e) {}
      expressionMediaRecorder = null;
      expressionAudioChunks = [];
      if (typeof pendingResolve === "function") {
        pendingResolve(null);
      }
    }
    if (expressionStream) {
      expressionStream.getTracks().forEach(function (track) {
        track.stop();
      });
      expressionStream = null;
    }
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
    initSessionTimelineClock: initSessionTimelineClock,
    startExpressionClipRecording: startExpressionClipRecording,
    stopExpressionClipRecording: stopExpressionClipRecording,
    discardCachedExpressionClipBlob: discardCachedExpressionClipBlob,
    isExpressionClipRecording: isExpressionClipRecording,
    isExpressionClipActive: isExpressionClipActive,
    freezeExpressionClipActiveCap: freezeExpressionClipActiveCap,
    alignExpressionClipActiveCapToUiMs: alignExpressionClipActiveCapToUiMs,
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

