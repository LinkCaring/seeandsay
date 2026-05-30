/**
 * Non-blocking sequential upload queue for expression segments.
 * Retains blobs per question until register succeeds; retries failed uploads.
 */
(function () {
  var MAX_ATTEMPTS = 3;
  var RETRY_DELAYS_MS = [1000, 2000];
  var FINISH_RETRY_BURST_MS = 30000;

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
    var exhaustedCount = 0;
    var idleWaiters = [];
    var currentJob = null;
    var completedQuestions = {};
    var failedQuestions = {};
    var pendingUploads = {};
    var retryTimerCount = 0;
    var trackedQuestionKeys = {};

    function qKey(questionNumber) {
      return String(questionNumber || "").trim();
    }

    function trackQuestionKey(key) {
      if (key) trackedQuestionKeys[key] = true;
    }

    function isQuestionInQueue(key) {
      for (var i = 0; i < queue.length; i++) {
        if (qKey(queue[i].questionNumber) === key) return true;
      }
      return false;
    }

    function pendingCount() {
      var retrying = 0;
      Object.keys(pendingUploads).forEach(function (key) {
        var entry = pendingUploads[key];
        if (entry && entry.status === "retrying") retrying += 1;
      });
      return queue.length + (running ? 1 : 0) + retryTimerCount + retrying;
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
      var entry = pendingUploads[key];
      if (entry && entry.status === "retrying") return "retrying";
      if (isQuestionInQueue(key)) return "pending";
      if (entry && entry.status === "exhausted") return "exhausted";
      if (failedQuestions[key]) return "exhausted";
      if (entry && entry.segmentBlob) return "pending";
      return "none";
    }

    function buildByQuestionMap() {
      var byQuestion = {};
      Object.keys(trackedQuestionKeys).forEach(function (key) {
        byQuestion[key] = getQuestionUploadState(key);
      });
      Object.keys(pendingUploads).forEach(function (key) {
        if (!byQuestion[key]) byQuestion[key] = getQuestionUploadState(key);
      });
      Object.keys(completedQuestions).forEach(function (key) {
        byQuestion[key] = "completed";
      });
      return byQuestion;
    }

    function cancelPendingForQuestion(questionNumber) {
      var key = qKey(questionNumber);
      if (!key) return 0;
      var before = queue.length;
      queue = queue.filter(function (job) {
        return qKey(job.questionNumber) !== key;
      });
      delete pendingUploads[key];
      delete failedQuestions[key];
      delete completedQuestions[key];
      delete trackedQuestionKeys[key];
      return before - queue.length;
    }

    function pushQueueEntry(questionNumber) {
      var key = qKey(questionNumber);
      if (!key || isQuestionInQueue(key)) return;
      queue.push({ questionNumber: key });
      setTimeout(runNext, 0);
    }

    function scheduleRetry(questionNumber) {
      var key = qKey(questionNumber);
      var entry = pendingUploads[key];
      if (!entry || entry.attemptCount >= MAX_ATTEMPTS) return;
      if (isQuestionInQueue(key) || isUploadInFlight(key)) return;
      var delayIdx = Math.min(Math.max(entry.attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1);
      var delayMs = RETRY_DELAYS_MS[delayIdx] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      entry.status = "retrying";
      retryTimerCount += 1;
      setTimeout(function () {
        retryTimerCount = Math.max(0, retryTimerCount - 1);
        var current = pendingUploads[key];
        if (!current || completedQuestions[key]) {
          flushIdleWaiters();
          return;
        }
        if (current.attemptCount >= MAX_ATTEMPTS) {
          flushIdleWaiters();
          return;
        }
        current.status = "pending";
        pushQueueEntry(key);
        flushIdleWaiters();
      }, delayMs);
    }

    function markExhausted(key, err) {
      var entry = pendingUploads[key];
      if (entry && entry.status === "exhausted") return;
      if (entry) {
        entry.status = "exhausted";
        entry.lastError = err && err.message ? err.message : String(err || "upload failed");
      }
      failedQuestions[key] = true;
      exhaustedCount += 1;
      console.error("[segmentQueue] upload exhausted q" + key, err);
    }

    async function runNext() {
      if (running) return;
      running = true;
      while (queue.length) {
        var job = queue.shift();
        var key = qKey(job && job.questionNumber);
        if (!key) {
          currentJob = null;
          continue;
        }
        var entry = pendingUploads[key];
        if (!entry || !entry.segmentBlob) {
          currentJob = null;
          continue;
        }
        currentJob = { questionNumber: key };
        entry.status = "in_flight";
        try {
          var mp3Blob = await convertBlobToMp3(entry.segmentBlob);
          var prep = await deps.prepareSegmentUpload(entry.userId, entry.testId, key);
          if (!prep || prep.success === false) throw new Error((prep && prep.error) || "prepare failed");
          var put = await deps.putSessionAudioToBlob(prep.uploadUrl, mp3Blob);
          if (!put || put.success === false) throw new Error((put && put.error) || "put failed");
          await deps.registerExpressionSegment(entry.userId, {
            testId: entry.testId,
            questionNumber: key,
            blobPath: prep.blobPath,
            headlightResult: entry.headlightResult || null,
            childGender: entry.childGender || null,
            ageYears: entry.ageYears,
            ageMonths: entry.ageMonths,
          });
          completed += 1;
          completedQuestions[key] = true;
          delete failedQuestions[key];
          delete pendingUploads[key];
          console.log("[segmentQueue] uploaded q" + key + " (completed=" + completed + ")");
        } catch (err) {
          entry.attemptCount = (entry.attemptCount || 0) + 1;
          entry.lastError = err && err.message ? err.message : String(err || "upload failed");
          if (entry.attemptCount < MAX_ATTEMPTS) {
            entry.status = "pending";
            console.warn(
              "[segmentQueue] upload failed q" + key + " attempt " + entry.attemptCount + "/" + MAX_ATTEMPTS,
              err
            );
            scheduleRetry(key);
          } else {
            markExhausted(key, err);
          }
        }
        currentJob = null;
      }
      running = false;
      flushIdleWaiters();
    }

    function storePendingFromJob(job) {
      var key = qKey(job && job.questionNumber);
      if (!key || !job || !job.segmentBlob) return null;
      trackQuestionKey(key);
      pendingUploads[key] = {
        segmentBlob: job.segmentBlob,
        userId: job.userId,
        testId: job.testId,
        headlightResult: job.headlightResult,
        childGender: job.childGender,
        ageYears: job.ageYears,
        ageMonths: job.ageMonths,
        attemptCount: 0,
        lastError: null,
        status: "pending",
      };
      delete failedQuestions[key];
      return key;
    }

    function enqueue(job) {
      var key = storePendingFromJob(job);
      if (!key) return;
      pushQueueEntry(key);
    }

    function stats() {
      return {
        pending: pendingCount(),
        completed: completed,
        failed: exhaustedCount,
        exhausted: exhaustedCount,
        byQuestion: buildByQuestionMap(),
      };
    }

    function getSegmentUploadClientInfo() {
      var s = stats();
      return {
        completed: s.completed,
        exhausted: s.exhausted,
        pending: s.pending,
        byQuestion: s.byQuestion,
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

    function runFinishRetryBurst(timeoutMs) {
      var burstMs =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : FINISH_RETRY_BURST_MS;
      Object.keys(pendingUploads).forEach(function (key) {
        if (completedQuestions[key]) return;
        var entry = pendingUploads[key];
        if (!entry || !entry.segmentBlob) return;
        if (entry.attemptCount >= MAX_ATTEMPTS) return;
        if (entry.status === "in_flight" || entry.status === "retrying") return;
        entry.status = "pending";
        delete failedQuestions[key];
        pushQueueEntry(key);
      });
      return waitForIdle(burstMs);
    }

    function waitForQuestionIdle(questionNumber, timeoutMs) {
      var waitMs = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 25000;
      return new Promise(function (resolve) {
        var start = Date.now();
        function tick() {
          var state = getQuestionUploadState(questionNumber);
          if (state !== "pending" && state !== "in_flight" && state !== "retrying") {
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
      getSegmentUploadClientInfo: getSegmentUploadClientInfo,
      waitForIdle: waitForIdle,
      runFinishRetryBurst: runFinishRetryBurst,
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
