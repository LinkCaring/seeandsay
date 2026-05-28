/**
 * Non-blocking sequential upload queue for expression segments.
 */
(function () {
  function convertBlobToMp3(blob) {
    if (!blob) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        var audioContext = new (window.AudioContext || window.webkitAudioContext)();
        var fileReader = new FileReader();
        fileReader.onload = function () {
          audioContext.decodeAudioData(fileReader.result).then(function (audioBuffer) {
            var samples = audioBuffer.getChannelData(0);
            var int16Samples = new Int16Array(samples.length);
            for (var i = 0; i < samples.length; i++) {
              var s = Math.max(-1, Math.min(1, samples[i]));
              int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            var mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
            var mp3Data = [];
            for (var j = 0; j < int16Samples.length; j += 1152) {
              var mp3buf = mp3encoder.encodeBuffer(int16Samples.subarray(j, j + 1152));
              if (mp3buf.length > 0) mp3Data.push(mp3buf);
            }
            var endBuf = mp3encoder.flush();
            if (endBuf.length > 0) mp3Data.push(endBuf);
            resolve(new Blob(mp3Data, { type: "audio/mpeg" }));
          }).catch(function () { resolve(blob); });
        };
        fileReader.onerror = function () { resolve(blob); };
        fileReader.readAsArrayBuffer(blob);
      } catch (e) {
        resolve(blob);
      }
    });
  }

  function createExpressionSegmentUploadQueue(deps) {
    var queue = [];
    var running = false;
    var completed = 0;
    var failed = 0;
    var idleWaiters = [];
    var currentJob = null;
    var completedQuestions = {};
    var failedQuestions = {};

    function qKey(questionNumber) {
      return String(questionNumber || "").trim();
    }

    function flushIdleWaiters() {
      if (pendingCount() !== 0) return;
      var waiters = idleWaiters.slice();
      idleWaiters = [];
      waiters.forEach(function (resolveFn) {
        try { resolveFn(); } catch (e) {}
      });
    }

    function isUploadInFlight(questionNumber) {
      var key = qKey(questionNumber);
      if (!key || !running || !currentJob) return false;
      return qKey(currentJob.questionNumber) === key;
    }

    function hasCompletedUpload(questionNumber) {
      return !!completedQuestions[qKey(questionNumber)];
    }

    function getQuestionUploadState(questionNumber) {
      var key = qKey(questionNumber);
      if (!key) return "none";
      if (completedQuestions[key]) return "completed";
      if (isUploadInFlight(key)) return "in_flight";
      for (var i = 0; i < queue.length; i++) {
        if (qKey(queue[i].questionNumber) === key) return "pending";
      }
      if (failedQuestions[key]) return "failed";
      return "none";
    }

    function cancelPendingForQuestion(questionNumber) {
      var key = qKey(questionNumber);
      if (!key) return 0;
      var before = queue.length;
      queue = queue.filter(function (job) {
        return qKey(job.questionNumber) !== key;
      });
      return before - queue.length;
    }

    async function runNext() {
      if (running) return;
      running = true;
      while (queue.length) {
        var job = queue.shift();
        currentJob = job;
        try {
          var mp3Blob = await convertBlobToMp3(job.segmentBlob);
          var prep = await deps.prepareSegmentUpload(job.userId, job.testId, job.questionNumber);
          if (!prep || prep.success === false) throw new Error((prep && prep.error) || "prepare failed");
          var put = await deps.putSessionAudioToBlob(prep.uploadUrl, mp3Blob);
          if (!put || put.success === false) throw new Error((put && put.error) || "put failed");
          await deps.registerExpressionSegment(job.userId, {
            testId: job.testId,
            questionNumber: String(job.questionNumber),
            blobPath: prep.blobPath,
            headlightResult: job.headlightResult || null,
            childGender: job.childGender || null,
            ageYears: job.ageYears,
            ageMonths: job.ageMonths,
          });
          completed += 1;
          completedQuestions[qKey(job.questionNumber)] = true;
          delete failedQuestions[qKey(job.questionNumber)];
          console.log("[segmentQueue] uploaded q" + job.questionNumber + " (completed=" + completed + ")");
        } catch (err) {
          failed += 1;
          failedQuestions[qKey(job.questionNumber)] = true;
          console.error("[segmentQueue] upload failed", err);
        }
        currentJob = null;
      }
      running = false;
      flushIdleWaiters();
    }

    function enqueue(job) {
      var key = qKey(job && job.questionNumber);
      if (key) {
        delete failedQuestions[key];
      }
      queue.push(job);
      setTimeout(runNext, 0);
    }

    function pendingCount() {
      return queue.length + (running ? 1 : 0);
    }

    function stats() {
      return {
        pending: pendingCount(),
        completed: completed,
        failed: failed,
      };
    }

    function waitForIdle(timeoutMs) {
      var waitMs = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 25000;
      return new Promise(function (resolve) {
        if (pendingCount() === 0) {
          resolve();
          return;
        }
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          resolve();
        }, waitMs);
        idleWaiters.push(function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        });
      });
    }

    function waitForQuestionIdle(questionNumber, timeoutMs) {
      var waitMs = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 25000;
      return new Promise(function (resolve) {
        var start = Date.now();
        function tick() {
          var state = getQuestionUploadState(questionNumber);
          if (state !== "pending" && state !== "in_flight") {
            resolve(state);
            return;
          }
          if (Date.now() - start >= waitMs) {
            resolve(state);
            return;
          }
          setTimeout(tick, 200);
        }
        tick();
      });
    }

    return {
      enqueue: enqueue,
      pendingCount: pendingCount,
      stats: stats,
      waitForIdle: waitForIdle,
      cancelPendingForQuestion: cancelPendingForQuestion,
      isUploadInFlight: isUploadInFlight,
      hasCompletedUpload: hasCompletedUpload,
      getQuestionUploadState: getQuestionUploadState,
      waitForQuestionIdle: waitForQuestionIdle,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionSegmentUploadQueue = createExpressionSegmentUploadQueue;
})();
