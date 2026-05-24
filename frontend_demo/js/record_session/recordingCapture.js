/**
 * Session recording: MediaRecorder capture, pause/resume, 12:30 active-time cap.
 */
(function () {
  function createRecordingCapture(state, timestamps, encodeRef) {
    function persistActiveRecordingMs() {
      try {
        localStorage.setItem("sessionActiveRecordingMs", String(state.activeRecordingAccumulatedMs));
      } catch (e) {}
    }

    function loadActiveRecordingMs() {
      try {
        var stored = localStorage.getItem("sessionActiveRecordingMs");
        var n = stored != null ? parseInt(stored, 10) : 0;
        state.activeRecordingAccumulatedMs = Number.isFinite(n) && n > 0 ? n : 0;
      } catch (e) {
        state.activeRecordingAccumulatedMs = 0;
      }
    }

    function resetActiveRecordingMeter() {
      state.activeRecordingAccumulatedMs = 0;
      state.activeRecordingSegmentStart = null;
      try {
        localStorage.removeItem("sessionActiveRecordingMs");
      } catch (e) {}
    }

    function accrueActiveRecordingTime() {
      if (state.activeRecordingSegmentStart == null) {
        return;
      }
      state.activeRecordingAccumulatedMs += Date.now() - state.activeRecordingSegmentStart;
      state.activeRecordingSegmentStart = null;
      persistActiveRecordingMs();
    }

    function beginActiveRecordingSegment() {
      if (state.activeRecordingSegmentStart != null) {
        return;
      }
      if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
        state.activeRecordingSegmentStart = Date.now();
      }
    }

    function getActiveRecordingMs() {
      var total = state.activeRecordingAccumulatedMs;
      if (state.activeRecordingSegmentStart != null) {
        total += Date.now() - state.activeRecordingSegmentStart;
      }
      return total;
    }

    state.getActiveRecordingMs = getActiveRecordingMs;

    function clearMaxDurationCheckTimer() {
      if (state.maxDurationCheckTimer) {
        clearInterval(state.maxDurationCheckTimer);
        state.maxDurationCheckTimer = null;
      }
    }

    function startMaxDurationCheck() {
      clearMaxDurationCheckTimer();
      state.maxDurationCheckTimer = setInterval(function () {
        if (!state.isRecording && !state.isPaused) {
          return;
        }
        var activeMs = getActiveRecordingMs();
        if (activeMs >= state.MAX_SESSION_RECORDING_MS) {
          console.warn("⏱️ Session recording reached max duration (12:30), stopping capture.");
          clearMaxDurationCheckTimer();
          stopContinuousRecording();
          if (typeof state.onMaxDurationReached === "function") {
            try {
              state.onMaxDurationReached(activeMs);
            } catch (cbErr) {
              console.error("onMaxDurationReached callback error:", cbErr);
            }
          }
        }
      }, 1000);
    }

    function setOnMaxDurationReached(callback) {
      state.onMaxDurationReached = typeof callback === "function" ? callback : null;
    }

    function getMaxSessionRecordingMs() {
      return state.MAX_SESSION_RECORDING_MS;
    }

    function isAtMaxSessionDuration() {
      return getActiveRecordingMs() >= state.MAX_SESSION_RECORDING_MS;
    }

    function attachStreamHealthMonitor(stream) {
      if (!stream || !stream.getAudioTracks) {
        return;
      }
      var tracks = stream.getAudioTracks();
      if (!tracks.length) {
        return;
      }
      var track = tracks[0];
      track.onended = function () {
        markRecordingInterrupted("track_ended");
      };
    }

    function markRecordingInterrupted(reason) {
      if (state.recordingInterrupted) {
        return;
      }
      state.recordingInterrupted = true;
      accrueActiveRecordingTime();
      console.warn("⚠️ Session recording interrupted:", reason || "unknown");
      if (typeof state.onRecordingInterrupted === "function") {
        try {
          state.onRecordingInterrupted(reason || "unknown");
        } catch (cbErr) {
          console.error("onRecordingInterrupted callback error:", cbErr);
        }
      }
    }

    function clearRecordingInterrupted() {
      state.recordingInterrupted = false;
    }

    function isRecordingInterrupted() {
      return !!state.recordingInterrupted;
    }

    function setOnRecordingInterrupted(callback) {
      state.onRecordingInterrupted = typeof callback === "function" ? callback : null;
    }

    function checkRecordingHealth() {
      if (!state.isRecording && !state.isPaused) {
        return { ok: true, interrupted: false };
      }
      if (state.recordingInterrupted) {
        return { ok: false, interrupted: true, reason: "interrupted" };
      }
      var track =
        state.stream && state.stream.getAudioTracks ? state.stream.getAudioTracks()[0] : null;
      if (track && track.readyState === "ended") {
        markRecordingInterrupted("track_ended");
        return { ok: false, interrupted: true, reason: "track_ended" };
      }
      if (
        state.mediaRecorder &&
        state.mediaRecorder.state === "inactive" &&
        (state.isRecording || state.isPaused)
      ) {
        markRecordingInterrupted("recorder_inactive");
        return { ok: false, interrupted: true, reason: "recorder_inactive" };
      }
      return { ok: true, interrupted: false };
    }

    function getSupportedMimeType() {
      const candidates = [
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];

      for (let i = 0; i < candidates.length; i++) {
        if (
          MediaRecorder &&
          MediaRecorder.isTypeSupported &&
          MediaRecorder.isTypeSupported(candidates[i])
        ) {
          return candidates[i];
        }
      }
      return "audio/webm";
    }

    async function startContinuousRecording(options) {
      try {
        localStorage.removeItem("sessionRecordingFinal");
        var preserveTs = options && options.preserveQuestionTimestamps;
        const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.stream = userStream;
        clearRecordingInterrupted();
        attachStreamHealthMonitor(userStream);

        const preferredMime = getSupportedMimeType();
        state.currentMimeType = preferredMime;
        const recorderOptions = preferredMime ? { mimeType: preferredMime } : undefined;

        const recorder = new MediaRecorder(userStream, recorderOptions);
        state.mediaRecorder = recorder;
        state.audioChunks = [];

        recorder.ondataavailable = function (event) {
          if (event.data.size > 0) {
            state.audioChunks.push(event.data);
          }
        };

        recorder.onstop = async function () {
          try {
            const blobType =
              preferredMime ||
              state.currentMimeType ||
              (state.audioChunks[0] && state.audioChunks[0].type) ||
              "audio/webm";
            const originalBlob = new Blob(state.audioChunks, { type: blobType });

            console.log("🎵 Converting recording to MP3...");
            const mp3Blob = await encodeRef.convertToMP3(originalBlob);
            const url = URL.createObjectURL(mp3Blob);

            state.finalRecordingBlob = mp3Blob;
            state.finalRecordingMeta = {
              mimeType: "audio/mpeg",
              timestamp: Date.now(),
            };
            localStorage.setItem("sessionRecordingFinalMeta", JSON.stringify(state.finalRecordingMeta));
            localStorage.setItem("sessionRecordingUrl", url);
            console.log(
              "✅ Session recording completed and converted to MP3, length:",
              state.audioChunks.length,
              "size:",
              mp3Blob.size
            );
            encodeRef.settleFinalBlobReadySuccess(
              encodeRef.buildRecordingPayload(mp3Blob, "audio/mpeg")
            );
          } catch (err) {
            console.error("❌ Session recording onstop failed:", err);
            encodeRef.settleFinalBlobReadyFailure(err);
          }
        };

        recorder.start(10000);
        state.isRecording = true;
        beginActiveRecordingSegment();

        if (preserveTs) {
          try {
            var qts = localStorage.getItem("questionTimestamps");
            state.questionTimestamps = qts ? JSON.parse(qts) : [];
          } catch (e) {
            state.questionTimestamps = [];
          }
          var rst = localStorage.getItem("recordingStartTime");
          state.recordingStartTime = rst ? parseInt(rst, 10) : Date.now();
          var tpt = localStorage.getItem("totalPausedTime");
          state.totalPausedTime = tpt ? parseInt(tpt, 10) : 0;
          loadActiveRecordingMs();
          console.log(
            "🎙️ Resuming session recording (preserved marks:",
            state.questionTimestamps.length + ")"
          );
        } else {
          state.recordingStartTime = Date.now();
          state.questionTimestamps = [];
          resetActiveRecordingMeter();
          encodeRef.resetFinalBlobReadyWait();
        }

        localStorage.setItem("sessionRecordingActive", "true");
        localStorage.setItem("recordingStartTime", state.recordingStartTime.toString());
        localStorage.setItem("totalPausedTime", String(state.totalPausedTime));
        localStorage.setItem("questionTimestamps", JSON.stringify(state.questionTimestamps));

        startMaxDurationCheck();
        console.log(
          "🎙️ Started continuous session recording (max",
          state.MAX_SESSION_RECORDING_MS / 1000,
          "s)"
        );
        return true;
      } catch (error) {
        console.error("❌ Failed to start recording:", error);
        return false;
      }
    }

    function stopContinuousRecording() {
      clearMaxDurationCheckTimer();
      accrueActiveRecordingTime();
      if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
        encodeRef.beginFinalBlobReadyWait();
        if (state.mediaRecorder.state === "paused") {
          state.mediaRecorder.resume();
        }
        state.mediaRecorder.stop();
        state.isRecording = false;
        state.isPaused = false;
        localStorage.removeItem("sessionRecordingActive");
        localStorage.removeItem("recordingPaused");

        if (state.stream) {
          state.stream.getTracks().forEach(function (track) {
            track.stop();
          });
          state.stream = null;
        }

        console.log("🛑 Stopped continuous session recording");
        return true;
      }
      return false;
    }

    function pauseRecording() {
      if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
        accrueActiveRecordingTime();
        state.mediaRecorder.pause();
        state.isPaused = true;
        state.pauseStartTime = Date.now();

        localStorage.setItem("recordingPaused", "true");
        localStorage.setItem("pauseStartTime", state.pauseStartTime.toString());
        localStorage.setItem("totalPausedTime", state.totalPausedTime.toString());

        const currentTime = Date.now();
        const elapsedMs = currentTime - state.recordingStartTime - state.totalPausedTime;
        state.questionTimestamps.push({
          questionNumber: "PAUSED",
          timestamp: elapsedMs,
        });
        localStorage.setItem("questionTimestamps", JSON.stringify(state.questionTimestamps));

        console.log("⏸️ Paused recording at", timestamps.formatTimestamp(elapsedMs));
        return true;
      }
      return false;
    }

    async function resumeRecording() {
      if (isAtMaxSessionDuration()) {
        console.warn("⏱️ Cannot resume recording: max session duration (12:30) already reached.");
        return false;
      }
      if (state.isPaused && state.mediaRecorder && state.mediaRecorder.state === "paused") {
        if (state.pauseStartTime) {
          const pauseDuration = Date.now() - state.pauseStartTime;
          state.totalPausedTime += pauseDuration;
          localStorage.setItem("totalPausedTime", state.totalPausedTime.toString());
          console.log(
            "⏸️ Was paused for",
            timestamps.formatTimestamp(pauseDuration),
            "and overall",
            timestamps.formatTimestamp(state.totalPausedTime)
          );
        }

        state.isPaused = false;
        state.pauseStartTime = null;
        localStorage.removeItem("recordingPaused");
        localStorage.removeItem("pauseStartTime");

        const currentTime = Date.now();
        const elapsedMs = currentTime - state.recordingStartTime - state.totalPausedTime;
        state.questionTimestamps.push({
          questionNumber: "RESUMED",
          timestamp: elapsedMs,
        });
        localStorage.setItem("questionTimestamps", JSON.stringify(state.questionTimestamps));

        try {
          state.mediaRecorder.resume();
          beginActiveRecordingSegment();
          console.log("▶️ Resumed recording at", timestamps.formatTimestamp(elapsedMs));
          return true;
        } catch (error) {
          console.error("❌ Failed to resume recording:", error);
          markRecordingInterrupted("resume_failed");
          return false;
        }
      }
      return false;
    }

    function pauseRecordingIfActive() {
      if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
        return pauseRecording();
      }
      return false;
    }

    function resumeRecordingIfPaused() {
      if (state.isPaused && state.mediaRecorder && state.mediaRecorder.state === "paused") {
        return resumeRecording();
      }
      return Promise.resolve(false);
    }

    function isRecordingPaused() {
      return state.isPaused;
    }

    function isRecordingActive() {
      return state.isRecording || localStorage.getItem("sessionRecordingActive") === "true";
    }

    function isMediaRecorderLive() {
      return !!(state.mediaRecorder && state.mediaRecorder.state !== "inactive");
    }

    return {
      clearMaxDurationCheckTimer: clearMaxDurationCheckTimer,
      resetActiveRecordingMeter: resetActiveRecordingMeter,
      getActiveRecordingMs: getActiveRecordingMs,
      setOnMaxDurationReached: setOnMaxDurationReached,
      getMaxSessionRecordingMs: getMaxSessionRecordingMs,
      isAtMaxSessionDuration: isAtMaxSessionDuration,
      startContinuousRecording: startContinuousRecording,
      stopContinuousRecording: stopContinuousRecording,
      pauseRecording: pauseRecording,
      pauseRecordingIfActive: pauseRecordingIfActive,
      resumeRecording: resumeRecording,
      resumeRecordingIfPaused: resumeRecordingIfPaused,
      isRecordingPaused: isRecordingPaused,
      isRecordingActive: isRecordingActive,
      isMediaRecorderLive: isMediaRecorderLive,
      checkRecordingHealth: checkRecordingHealth,
      isRecordingInterrupted: isRecordingInterrupted,
      clearRecordingInterrupted: clearRecordingInterrupted,
      setOnRecordingInterrupted: setOnRecordingInterrupted,
      markRecordingInterrupted: markRecordingInterrupted,
    };
  }

  window.MiliRecordingParts = window.MiliRecordingParts || {};
  window.MiliRecordingParts.createCapture = createRecordingCapture;
})();
