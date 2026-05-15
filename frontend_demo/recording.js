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
  /** question_number the in-flight expressionClipStopPromise belongs to. */
  let expressionClipStopPromiseQuestion = null;
  /**
   * Encoded MP3 per expression question (question_number string → Blob).
   * A single global cache caused Q2/Q3 uploads to reuse Q1 audio when batching encodes.
   */
  var expressionClipMp3ByQuestion = Object.create(null);
  /** Pre-built data URLs from clip worker (avoids main-thread readBlobAsDataURL). */
  var expressionClipDataUrlByQuestion = Object.create(null);
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

  /**
   * Serialize expression-clip MP3 encode so decodeAudioData does not run during question <audio> playback.
   * Max 2 waiting jobs; session end flushes all. Upload concurrency stays separate in apiToMongo.
   */
  var EXPRESSION_CLIP_ENCODE_QUEUE_MAX =
    typeof window !== "undefined" && window.SEEANDSAY_EXPRESSION_CLIP_ENCODE_QUEUE_MAX != null
      ? Math.max(1, parseInt(window.SEEANDSAY_EXPRESSION_CLIP_ENCODE_QUEUE_MAX, 10) || 2)
      : 2;
  var expressionClipEncodeQueue = [];
  var expressionClipEncodeInProgress = false;
  var questionReadingActive = false;

  function setQuestionReadingActive(active) {
    questionReadingActive = !!active;
  }

  /** Safe gap before expression question reading: drain pending clip encodes (not during playback). */
  function drainExpressionClipEncodeBeforeRead() {
    if (questionReadingActive) {
      return Promise.resolve();
    }
    return tryProcessExpressionClipEncodeQueue();
  }

  function normalizeExpressionClipQuestionKey(questionNumber) {
    if (questionNumber == null || questionNumber === "") {
      return expressionClipActiveQuestion != null && expressionClipActiveQuestion !== ""
        ? String(expressionClipActiveQuestion)
        : null;
    }
    return String(questionNumber);
  }

  function getExpressionClipMp3ForQuestion(questionNumber) {
    var qKey = normalizeExpressionClipQuestionKey(questionNumber);
    if (!qKey) {
      return null;
    }
    var blob = expressionClipMp3ByQuestion[qKey];
    return blob && blob.size > 0 ? blob : null;
  }

  function completeExpressionClipEncodeJob(job, mp3Blob) {
    var out = mp3Blob && mp3Blob.size > 0 ? mp3Blob : null;
    var qKey = normalizeExpressionClipQuestionKey(job.questionNumber);
    if (qKey && out) {
      expressionClipMp3ByQuestion[qKey] = out;
    }
    if (qKey && job.dataUrl) {
      expressionClipDataUrlByQuestion[qKey] = job.dataUrl;
    }
    if (qKey) {
      console.log(
        "[See&Say] Expression clip MP3 ready for question",
        qKey,
        "size:",
        out ? out.size : 0
      );
    }
    if (typeof job.stopResolve === "function") {
      try {
        job.stopResolve(out);
      } catch (e) {}
      job.stopResolve = null;
    }
    if (typeof job.promiseResolve === "function") {
      job.promiseResolve(out);
      job.promiseResolve = null;
    }
  }

  function processOneExpressionClipEncodeJob(options) {
    options = options || {};
    var bypassReadingGate = !!options.bypassReadingGate;
    if (expressionClipEncodeInProgress) {
      return Promise.resolve();
    }
    if (!bypassReadingGate && questionReadingActive) {
      return Promise.resolve();
    }
    if (expressionClipEncodeQueue.length === 0) {
      return Promise.resolve();
    }
    var job = expressionClipEncodeQueue.shift();
    expressionClipEncodeInProgress = true;
    return Promise.resolve()
      .then(function () {
        return yieldBeforeMp3Encode();
      })
      .then(function () {
        return convertToMP3(job.webmBlob);
      })
      .then(function (encodeResult) {
        var mp3Blob =
          encodeResult && encodeResult.blob ? encodeResult.blob : encodeResult;
        if (encodeResult && encodeResult.dataUrl) {
          job.dataUrl = encodeResult.dataUrl;
        }
        completeExpressionClipEncodeJob(job, mp3Blob);
      })
      .catch(function (e) {
        console.error("Expression clip MP3 convert failed:", e);
        completeExpressionClipEncodeJob(job, job.webmBlob);
      })
      .finally(function () {
        expressionClipEncodeInProgress = false;
        tryProcessExpressionClipEncodeQueue();
      });
  }

  function tryProcessExpressionClipEncodeQueue(options) {
    return processOneExpressionClipEncodeJob(options).then(function () {
      if (
        !expressionClipEncodeInProgress &&
        expressionClipEncodeQueue.length > 0 &&
        (!questionReadingActive || (options && options.bypassReadingGate))
      ) {
        return tryProcessExpressionClipEncodeQueue(options);
      }
    });
  }

  function waitForExpressionClipEncodeIdle() {
    return new Promise(function (resolve) {
      function tick() {
        if (!expressionClipEncodeInProgress && expressionClipEncodeQueue.length === 0) {
          resolve();
          return;
        }
        if (!expressionClipEncodeInProgress && expressionClipEncodeQueue.length > 0) {
          processOneExpressionClipEncodeJob({ bypassReadingGate: true }).then(tick).catch(tick);
          return;
        }
        setTimeout(tick, 40);
      }
      tick();
    });
  }

  function waitForExpressionClipMp3ForQuestion(questionNumber, maxMs) {
    var qKey = normalizeExpressionClipQuestionKey(questionNumber);
    var limit = maxMs == null ? 120000 : maxMs;
    var started = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        var ready = qKey ? getExpressionClipMp3ForQuestion(qKey) : null;
        if (ready) {
          resolve(ready);
          return;
        }
        if (!expressionClipEncodeInProgress && expressionClipEncodeQueue.length === 0) {
          resolve(null);
          return;
        }
        if (Date.now() - started > limit) {
          console.warn(
            "[See&Say] Timed out waiting for expression clip MP3 encode",
            qKey ? "question " + qKey : ""
          );
          resolve(null);
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });
  }

  function enqueueExpressionClipEncode(webmBlob, questionNumber, stopResolve) {
    return new Promise(function (resolve, reject) {
      function pushJob() {
        var job = {
          webmBlob: webmBlob,
          questionNumber:
            questionNumber != null && questionNumber !== ""
              ? String(questionNumber)
              : expressionClipActiveQuestion,
          stopResolve: stopResolve,
          promiseResolve: resolve,
          promiseReject: reject,
        };
        expressionClipEncodeQueue.push(job);
        tryProcessExpressionClipEncodeQueue({ bypassReadingGate: true });
      }

      pushJob();
    });
  }

  function flushExpressionClipEncodeQueue() {
    questionReadingActive = false;
    return waitForExpressionClipEncodeIdle();
  }

  /** Lazy singleton; null = not created yet, false = unavailable or hard-failed. */
  let clipWorker = null;
  let clipWorkerJobId = 0;
  const clipWorkerPending = new Map();
  var clipWorkerFullPipelineWarned = false;

  function getClipWorkerScriptUrl() {
    var v = typeof window !== "undefined" && window._v ? window._v : Date.now();
    return "./expression-clip-worker.js?v=" + v;
  }

  function terminateClipWorkerHard(reason) {
    if (clipWorker && typeof clipWorker.terminate === "function") {
      try {
        clipWorker.terminate();
      } catch (e) {
        /* ignore */
      }
    }
    clipWorker = false;
    if (reason) {
      console.warn("Expression clip worker disabled:", reason);
    }
  }

  function isClipWorkerAllowed() {
    if (typeof window !== "undefined" && window.SEEANDSAY_CLIP_WORKER === false) {
      return false;
    }
    if (typeof window !== "undefined" && window.SEEANDSAY_MP3_WORKER === false) {
      return false;
    }
    return true;
  }

  function initClipWorkerOnce() {
    if (clipWorker === false) {
      return null;
    }
    if (clipWorker != null) {
      return clipWorker;
    }
    if (typeof Worker === "undefined") {
      clipWorker = false;
      return null;
    }
    if (!isClipWorkerAllowed()) {
      clipWorker = false;
      return null;
    }
    try {
      var w = new Worker(getClipWorkerScriptUrl());
      w.onmessage = function (ev) {
        var d = ev.data || {};
        var pending = clipWorkerPending.get(d.id);
        if (!pending) {
          return;
        }
        clipWorkerPending.delete(d.id);
        if (d.ok && d.arrayBuffer) {
          var len =
            typeof d.byteLength === "number" ? d.byteLength : d.arrayBuffer.byteLength;
          var b = new Blob([new Uint8Array(d.arrayBuffer, 0, len)], { type: "audio/mpeg" });
          pending.resolve({
            blob: b,
            dataUrl: d.dataUrl || null,
          });
        } else {
          pending.reject(new Error(d.message || "clip worker encode failed"));
        }
      };
      w.onerror = function (err) {
        console.warn("expression-clip-worker:", err);
        clipWorkerPending.forEach(function (p) {
          p.reject(new Error("clip worker load/runtime error"));
        });
        clipWorkerPending.clear();
        terminateClipWorkerHard("onerror");
      };
      clipWorker = w;
      return w;
    } catch (e) {
      console.warn("Expression clip worker could not start:", e);
      clipWorker = false;
      return null;
    }
  }

  function postClipWorkerJob(payload, transferList) {
    var w = initClipWorkerOnce();
    if (!w) {
      return Promise.reject(new Error("no clip worker"));
    }
    return new Promise(function (resolve, reject) {
      var id = ++clipWorkerJobId;
      var timeoutMs = 180000;
      var timer = setTimeout(function () {
        if (!clipWorkerPending.has(id)) {
          return;
        }
        clipWorkerPending.delete(id);
        reject(new Error("clip worker timeout"));
        try {
          w.terminate();
        } catch (e2) {
          /* ignore */
        }
        clipWorker = null;
      }, timeoutMs);
      clipWorkerPending.set(id, {
        resolve: function (result) {
          clearTimeout(timer);
          resolve(result);
        },
        reject: function (e) {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        payload.id = id;
        w.postMessage(payload, transferList || []);
      } catch (postErr) {
        clearTimeout(timer);
        clipWorkerPending.delete(id);
        reject(postErr);
      }
    });
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

  function convertToMP3ViaClipWorker(blob) {
    return readBlobAsArrayBuffer(blob).then(function (ab) {
      var copy = ab.slice(0);
      return postClipWorkerJob(
        {
          type: "encodeWebm",
          webm: copy,
          byteLength: copy.byteLength,
        },
        [copy]
      );
    });
  }

  function convertToMP3WithPcmWorker(blob) {
    return decodeBlobToMonoFloat32(blob).then(function (decoded) {
      var monoCopy = new Float32Array(decoded.mono.length);
      monoCopy.set(decoded.mono);
      return postClipWorkerJob(
        {
          type: "encodePcm",
          sampleRate: decoded.sampleRate,
          pcm: monoCopy.buffer,
          sampleCount: monoCopy.length,
        },
        [monoCopy.buffer]
      ).then(function (result) {
        return { blob: result.blob, dataUrl: result.dataUrl || null };
      });
    });
  }

  async function convertToMP3(blob) {
    if (isClipWorkerAllowed() && initClipWorkerOnce()) {
      try {
        var full = await convertToMP3ViaClipWorker(blob);
        console.log(
          "✅ MP3 conversion complete (clip worker), size:",
          full.blob.size
        );
        return full;
      } catch (e) {
        if (!clipWorkerFullPipelineWarned) {
          clipWorkerFullPipelineWarned = true;
          console.warn(
            "Clip worker full pipeline failed, trying PCM worker + main decode:",
            e
          );
        }
        try {
          var pcmOnly = await convertToMP3WithPcmWorker(blob);
          console.log(
            "✅ MP3 conversion complete (PCM worker + main decode), size:",
            pcmOnly.blob.size
          );
          return pcmOnly;
        } catch (e2) {
          console.warn("PCM worker encode failed, using main thread:", e2);
        }
      }
    }
    var legacy = await convertToMP3OnMainThread(blob);
    return { blob: legacy, dataUrl: null };
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

  function getExpressionClipDataUrlForQuestion(questionNumber) {
    var qKey = normalizeExpressionClipQuestionKey(questionNumber);
    if (!qKey) {
      return null;
    }
    return expressionClipDataUrlByQuestion[qKey] || null;
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
      stopExpressionClipRecording({
        questionNumber: expressionClipActiveQuestion,
      }).catch(function () {});
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
        stopExpressionClipRecording({
          questionNumber: expressionClipActiveQuestion,
        }).catch(function () {});
      }
    }, expressionClipAutoStopRemainingMs);
  }

  function clearExpressionClipStopPromise() {
    expressionClipStopPromise = null;
    expressionClipStopPromiseQuestion = null;
  }

  function expressionClipStopPromiseMatches(qKey) {
    if (!expressionClipStopPromise) {
      return false;
    }
    if (!qKey || !expressionClipStopPromiseQuestion) {
      return true;
    }
    return expressionClipStopPromiseQuestion === qKey;
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

  function discardCachedExpressionClipBlob(questionNumber) {
    if (questionNumber == null || questionNumber === "") {
      expressionClipMp3ByQuestion = Object.create(null);
      expressionClipDataUrlByQuestion = Object.create(null);
      return;
    }
    var qKey = String(questionNumber);
    delete expressionClipMp3ByQuestion[qKey];
    delete expressionClipDataUrlByQuestion[qKey];
  }

  /**
   * Drop cached MP3/data URLs for other questions. Keeps keepQuestionNumber so
   * 30s cap on the same expression question can still reuse via takeCached/stop.
   */
  function discardExpressionClipCacheExcept(keepQuestionNumber) {
    if (keepQuestionNumber == null || keepQuestionNumber === "") {
      discardCachedExpressionClipBlob();
      return;
    }
    var keep = String(keepQuestionNumber);
    Object.keys(expressionClipMp3ByQuestion).forEach(function (k) {
      if (k !== keep) {
        delete expressionClipMp3ByQuestion[k];
      }
    });
    Object.keys(expressionClipDataUrlByQuestion).forEach(function (k) {
      if (k !== keep) {
        delete expressionClipDataUrlByQuestion[k];
      }
    });
  }

  async function startExpressionClipRecording(questionNumber) {
    var qKey =
      questionNumber != null && questionNumber !== ""
        ? String(questionNumber)
        : null;
    expressionClipActiveQuestion = qKey;

    if (qKey) {
      discardExpressionClipCacheExcept(qKey);
    } else {
      discardCachedExpressionClipBlob();
    }

    if (expressionMediaRecorder && expressionMediaRecorder.state === "recording") {
      return true;
    }
    // After 30s cap: recorder is idle but blob may still be encoding or cached for traffic submit.
    if (expressionClipStopPromise) {
      try {
        await expressionClipStopPromise;
      } catch (e) {}
    }
    if (qKey && getExpressionClipMp3ForQuestion(qKey)) {
      console.log("🎙️ Expression clip: cached MP3 ready for question", qKey);
      return true;
    }
    resetExpressionClipAutoStopScheduling();
    var recordingQuestionKey = qKey;
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
        var stopResolve = expressionStopResolve;
        var encodeQuestionKey = recordingQuestionKey;
        expressionStopResolve = null;
        expressionMediaRecorder = null;
        expressionAudioChunks = [];
        if (expressionStream) {
          expressionStream.getTracks().forEach(function (track) {
            track.stop();
          });
          expressionStream = null;
        }
        try {
          await enqueueExpressionClipEncode(
            originalBlob,
            encodeQuestionKey,
            stopResolve
          );
        } catch (e) {
          console.error("Expression clip encode enqueue failed:", e);
          if (typeof stopResolve === "function") {
            stopResolve(null);
          }
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

  function takeCachedExpressionClipBlob(questionNumber) {
    var qKey = normalizeExpressionClipQuestionKey(questionNumber);
    if (!qKey) {
      return null;
    }
    var blob = getExpressionClipMp3ForQuestion(qKey);
    if (!blob) {
      return null;
    }
    delete expressionClipMp3ByQuestion[qKey];
    return blob;
  }

  function stopExpressionClipRecording(options) {
    options = options || {};
    var qKey = normalizeExpressionClipQuestionKey(options.questionNumber);
    clearExpressionClipAutoStopTimer();
    expressionClipSegmentStartedAt = null;
    if (!expressionMediaRecorder || expressionMediaRecorder.state === "inactive") {
      resetExpressionClipAutoStopScheduling();
      // Await in-flight stop, queued encode, or cached MP3 (30s cap before traffic).
      if (expressionClipStopPromise && !expressionClipStopPromiseMatches(qKey)) {
        console.warn(
          "[See&Say] Expression clip stop for question",
          qKey,
          "waiting for prior stop on question",
          expressionClipStopPromiseQuestion
        );
        return expressionClipStopPromise.then(function () {
          return stopExpressionClipRecording(options);
        });
      }
      if (expressionClipStopPromise && expressionClipStopPromiseMatches(qKey)) {
        return expressionClipStopPromise;
      }
      var cachedEarly = qKey ? takeCachedExpressionClipBlob(qKey) : null;
      if (cachedEarly) {
        console.log(
          "🎙️ Expression clip: reusing MP3 for question",
          qKey,
          "(e.g. 30s cap before traffic)"
        );
        return Promise.resolve(cachedEarly);
      }
      if (
        expressionClipEncodeInProgress ||
        expressionClipEncodeQueue.length > 0
      ) {
        return waitForExpressionClipMp3ForQuestion(qKey).then(function (blob) {
          if (blob) {
            return blob;
          }
          return qKey ? takeCachedExpressionClipBlob(qKey) : null;
        });
      }
      return Promise.resolve(null);
    }
    if (expressionClipStopPromise && !expressionClipStopPromiseMatches(qKey)) {
      console.warn(
        "[See&Say] Expression clip stop for question",
        qKey,
        "waiting for active recorder stop on question",
        expressionClipStopPromiseQuestion
      );
      return expressionClipStopPromise.then(function () {
        return stopExpressionClipRecording(options);
      });
    }
    if (expressionClipStopPromise && expressionClipStopPromiseMatches(qKey)) {
      return expressionClipStopPromise;
    }
    expressionClipStopPromiseQuestion = qKey;
    expressionClipStopPromise = new Promise(function (resolve) {
      var settled = false;
      function finish(blob) {
        if (settled) {
          return;
        }
        settled = true;
        clearExpressionClipStopPromise();
        resetExpressionClipAutoStopScheduling();
        resolve(blob);
      }
      if (!expressionMediaRecorder || expressionMediaRecorder.state === "inactive") {
        finish(qKey ? takeCachedExpressionClipBlob(qKey) : null);
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
    clearExpressionClipStopPromise();
    discardCachedExpressionClipBlob();
    expressionClipMp3ByQuestion = Object.create(null);
    expressionClipDataUrlByQuestion = Object.create(null);
    expressionClipActiveQuestion = null;
    expressionClipEncodeQueue = [];
    expressionClipEncodeInProgress = false;
    questionReadingActive = false;
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
    discardExpressionClipCacheExcept: discardExpressionClipCacheExcept,
    getExpressionClipDataUrlForQuestion: getExpressionClipDataUrlForQuestion,
    setQuestionReadingActive: setQuestionReadingActive,
    drainExpressionClipEncodeBeforeRead: drainExpressionClipEncodeBeforeRead,
    flushExpressionClipEncodeQueue: flushExpressionClipEncodeQueue,
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

