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

    function flushIdleWaiters() {
      if (pendingCount() !== 0) return;
      var waiters = idleWaiters.slice();
      idleWaiters = [];
      waiters.forEach(function (resolveFn) {
        try { resolveFn(); } catch (e) {}
      });
    }

    async function runNext() {
      if (running) return;
      running = true;
      while (queue.length) {
        var job = queue.shift();
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
          console.log("[segmentQueue] uploaded q" + job.questionNumber + " (completed=" + completed + ")");
        } catch (err) {
          failed += 1;
          console.error("[segmentQueue] upload failed", err);
        }
      }
      running = false;
      flushIdleWaiters();
    }

    function enqueue(job) {
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

    return {
      enqueue: enqueue,
      pendingCount: pendingCount,
      stats: stats,
      waitForIdle: waitForIdle,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionSegmentUploadQueue = createExpressionSegmentUploadQueue;
})();
