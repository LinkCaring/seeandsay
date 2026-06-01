/**
 * Per-question expression segment recorder.
 * Records only bounded answer windows (no full-session chunk growth).
 */
(function () {
  var SEGMENT_TIMESLICE_MS = 2000;

  function createExpressionSegmentRecorder() {
    var stream = null;
    var recorder = null;
    var chunks = [];
    var lastBlob = null;
    var lastBlobQuestionNumber = null;
    var activeQuestionNumber = null;
    var stopResolve = null;
    var onInterruptedCallback = null;
    var segmentInterrupted = false;
    var expectActiveCapture = false;
    var mimeType = "audio/webm";

    function buildBlobFromChunks() {
      if (!chunks.length) return null;
      return new Blob(chunks, { type: mimeType });
    }

    function notifyInterrupted(reason) {
      if (segmentInterrupted) return;
      if (!expectActiveCapture) return;
      segmentInterrupted = true;
      console.warn("[incremental] segment capture interrupted:", reason || "unknown");
      if (typeof onInterruptedCallback === "function") {
        try {
          onInterruptedCallback({
            questionNumber: activeQuestionNumber,
            reason: reason || "unknown",
          });
        } catch (e) {}
      }
    }

    function attachStreamHealthMonitor(mediaStream) {
      if (!mediaStream || !mediaStream.getAudioTracks) return;
      var tracks = mediaStream.getAudioTracks();
      if (!tracks.length) return;
      var track = tracks[0];
      track.onended = function () {
        notifyInterrupted("track_ended");
      };
    }

    function discardStream() {
      if (stream) {
        try {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
        } catch (e) {}
      }
      stream = null;
      recorder = null;
    }

    async function ensureStream() {
      if (stream) {
        var existing = stream.getAudioTracks && stream.getAudioTracks()[0];
        if (existing && existing.readyState === "live") {
          return stream;
        }
        discardStream();
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      segmentInterrupted = false;
      attachStreamHealthMonitor(stream);
      return stream;
    }

    async function startSegment(questionNumber) {
      await ensureStream();
      if (recorder && recorder.state === "recording") return true;
      chunks = [];
      activeQuestionNumber = String(questionNumber || "");
      expectActiveCapture = true;
      segmentInterrupted = false;
      recorder = new MediaRecorder(stream);
      mimeType = recorder.mimeType || "audio/webm";
      recorder.ondataavailable = function (e) {
        if (e && e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = function () {
        lastBlob = buildBlobFromChunks();
        lastBlobQuestionNumber = activeQuestionNumber;
        chunks = [];
        if (stopResolve) {
          stopResolve(lastBlob);
          stopResolve = null;
        }
      };
      recorder.start(SEGMENT_TIMESLICE_MS);
      return true;
    }

    function stopSegment(questionNumber) {
      var qn = String(questionNumber || "");
      if (qn && activeQuestionNumber && qn !== activeQuestionNumber) {
        return Promise.resolve(null);
      }
      expectActiveCapture = false;
      if (!recorder || recorder.state !== "recording") {
        if (!qn) return Promise.resolve(lastBlob);
        return Promise.resolve(lastBlobQuestionNumber === qn ? lastBlob : null);
      }
      return new Promise(function (resolve) {
        stopResolve = resolve;
        try {
          recorder.stop();
        } catch (e) {
          resolve(lastBlob || buildBlobFromChunks());
        }
      });
    }

    function clearLastBlob() {
      lastBlob = null;
      lastBlobQuestionNumber = null;
    }

    /**
     * Materialize partial audio before cleanup (e.g. phone call). Does not call cleanup().
     */
    async function emergencySnapshot(questionNumber) {
      var qn = String(questionNumber || activeQuestionNumber || "");
      if (!qn) return null;

      if (recorder && recorder.state === "recording") {
        try {
          var blob = await stopSegment(qn);
          if (blob) {
            return { blob: blob, questionNumber: qn };
          }
        } catch (e) {}
      }

      var partial = buildBlobFromChunks();
      if (partial) {
        lastBlob = partial;
        lastBlobQuestionNumber = qn;
        return { blob: partial, questionNumber: qn };
      }

      if (lastBlob && lastBlobQuestionNumber === qn) {
        return { blob: lastBlob, questionNumber: qn };
      }

      return null;
    }

    function setOnInterrupted(callback) {
      onInterruptedCallback = typeof callback === "function" ? callback : null;
    }

    function isExpectingActiveCapture() {
      return expectActiveCapture;
    }

    function checkHealth() {
      if (segmentInterrupted) {
        return { ok: false, interrupted: true, reason: "interrupted" };
      }
      if (!expectActiveCapture && !(recorder && recorder.state === "recording")) {
        return { ok: true, interrupted: false };
      }
      var track = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
      if (track && track.readyState === "ended") {
        notifyInterrupted("track_ended");
        return { ok: false, interrupted: true, reason: "track_ended" };
      }
      if (recorder && recorder.state === "inactive" && expectActiveCapture) {
        notifyInterrupted("recorder_inactive");
        return { ok: false, interrupted: true, reason: "recorder_inactive" };
      }
      return { ok: true, interrupted: false };
    }

    function cleanup() {
      expectActiveCapture = false;
      onInterruptedCallback = null;
      segmentInterrupted = false;
      try {
        if (recorder && recorder.state === "recording") recorder.stop();
      } catch (e) {}
      recorder = null;
      chunks = [];
      lastBlob = null;
      lastBlobQuestionNumber = null;
      activeQuestionNumber = null;
      discardStream();
    }

    return {
      startSegment: startSegment,
      stopSegment: stopSegment,
      clearLastBlob: clearLastBlob,
      emergencySnapshot: emergencySnapshot,
      setOnInterrupted: setOnInterrupted,
      checkHealth: checkHealth,
      isExpectingActiveCapture: isExpectingActiveCapture,
      cleanup: cleanup,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionSegmentRecorder = createExpressionSegmentRecorder;
})();
