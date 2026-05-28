/**
 * Per-question expression segment recorder.
 * Records only bounded answer windows (no full-session chunk growth).
 */
(function () {
  function createExpressionSegmentRecorder() {
    var stream = null;
    var recorder = null;
    var chunks = [];
    var lastBlob = null;
    var lastBlobQuestionNumber = null;
    var activeQuestionNumber = null;
    var stopResolve = null;

    async function ensureStream() {
      if (stream) return stream;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return stream;
    }

    async function startSegment(questionNumber) {
      await ensureStream();
      if (recorder && recorder.state === "recording") return true;
      chunks = [];
      activeQuestionNumber = String(questionNumber || "");
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function (e) {
        if (e && e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = function () {
        lastBlob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null;
        lastBlobQuestionNumber = activeQuestionNumber;
        chunks = [];
        if (stopResolve) {
          stopResolve(lastBlob);
          stopResolve = null;
        }
      };
      recorder.start();
      return true;
    }

    function stopSegment(questionNumber) {
      var qn = String(questionNumber || "");
      if (qn && activeQuestionNumber && qn !== activeQuestionNumber) {
        return Promise.resolve(null);
      }
      if (!recorder || recorder.state !== "recording") {
        if (!qn) return Promise.resolve(lastBlob);
        return Promise.resolve(lastBlobQuestionNumber === qn ? lastBlob : null);
      }
      return new Promise(function (resolve) {
        stopResolve = resolve;
        try {
          recorder.stop();
        } catch (e) {
          resolve(lastBlob);
        }
      });
    }

    function clearLastBlob() {
      lastBlob = null;
      lastBlobQuestionNumber = null;
    }

    function cleanup() {
      try {
        if (recorder && recorder.state === "recording") recorder.stop();
      } catch (e) {}
      recorder = null;
      chunks = [];
      lastBlob = null;
      lastBlobQuestionNumber = null;
      activeQuestionNumber = null;
      if (stream) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      }
      stream = null;
    }

    return {
      startSegment: startSegment,
      stopSegment: stopSegment,
      clearLastBlob: clearLastBlob,
      cleanup: cleanup,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionSegmentRecorder = createExpressionSegmentRecorder;
})();
