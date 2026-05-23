/**
 * Session recording: question marks, elapsed time, timestamp export.
 */
(function () {
  function createRecordingTimestamps(state) {
    function ensureTimingState() {
      if (!state.recordingStartTime) {
        const stored = localStorage.getItem("recordingStartTime");
        if (stored) {
          state.recordingStartTime = parseInt(stored, 10);
        } else {
          console.warn("Recording start time not found");
          return false;
        }
      }
      if (state.totalPausedTime === 0) {
        const storedPausedTime = localStorage.getItem("totalPausedTime");
        if (storedPausedTime) {
          state.totalPausedTime = parseInt(storedPausedTime, 10);
        }
      }
      if (!state.isPaused && localStorage.getItem("recordingPaused") === "true") {
        state.isPaused = true;
      }
      if (!state.pauseStartTime) {
        const storedPauseStart = localStorage.getItem("pauseStartTime");
        if (storedPauseStart) {
          state.pauseStartTime = parseInt(storedPauseStart, 10);
        }
      }
      return true;
    }

    function getElapsedMs() {
      if (!ensureTimingState()) return null;
      const currentTime = Date.now();
      let elapsed = currentTime - state.recordingStartTime - state.totalPausedTime;
      if (state.isPaused && state.pauseStartTime) {
        elapsed -= currentTime - state.pauseStartTime;
      }
      return Math.max(0, elapsed);
    }

    /** Matches test UI timer / backend slice — reads window.MILI_EXPRESSION_ANSWER_MS from expressionTiming.js */
    function getExpressionAnswerMaxMs() {
      try {
        var w = typeof window !== "undefined" ? window.MILI_EXPRESSION_ANSWER_MS : null;
        var n = Number(w);
        return Number.isFinite(n) && n > 0 ? n : 20000;
      } catch (e) {
        return 20000;
      }
    }

    function markQuestionStart(questionNumber) {
      let elapsedMs = getElapsedMs();
      if (elapsedMs == null) return;

      state.questionTimestamps.push({
        questionNumber: questionNumber,
        timestamp: elapsedMs,
        eventType: "start",
      });

      localStorage.setItem("questionTimestamps", JSON.stringify(state.questionTimestamps));

      console.log("📝 Marked question", questionNumber, "at", formatTimestamp(elapsedMs));
    }

    function getQuestionStartMs(questionNumber) {
      const qKey = String(questionNumber || "");
      if (!qKey) return null;
      for (let i = state.questionTimestamps.length - 1; i >= 0; i--) {
        const item = state.questionTimestamps[i];
        if (String(item.questionNumber) === qKey && item.eventType === "start") {
          return item.timestamp;
        }
      }
      return null;
    }

    function hasQuestionEnd(questionNumber) {
      const qKey = String(questionNumber || "");
      return state.questionTimestamps.some(function (item) {
        return String(item.questionNumber) === qKey && item.eventType === "end";
      });
    }

    function markQuestionEnd(questionNumber) {
      if (hasQuestionEnd(questionNumber)) return;
      if (
        typeof window !== "undefined" &&
        window.MiliTestFinishDialog &&
        typeof window.MiliTestFinishDialog.isOpen === "function" &&
        window.MiliTestFinishDialog.isOpen()
      ) {
        return;
      }

      let elapsedMs = getElapsedMs();
      if (elapsedMs == null) return;
      const questionNumStr = String(questionNumber || "");
      if (!questionNumStr) return;

      const startMs = getQuestionStartMs(questionNumStr);
      if (startMs != null) {
        const maxEndMs = startMs + getExpressionAnswerMaxMs();
        if (elapsedMs > maxEndMs) {
          elapsedMs = maxEndMs;
        }
        if (elapsedMs <= startMs) {
          return;
        }
      }

      const last =
        state.questionTimestamps.length > 0
          ? state.questionTimestamps[state.questionTimestamps.length - 1]
          : null;
      if (
        last &&
        String(last.questionNumber) === questionNumStr &&
        last.eventType === "end" &&
        Math.abs((last.timestamp || 0) - elapsedMs) <= 250
      ) {
        return;
      }

      state.questionTimestamps.push({
        questionNumber: questionNumber,
        timestamp: elapsedMs,
        eventType: "end",
      });
      localStorage.setItem("questionTimestamps", JSON.stringify(state.questionTimestamps));
      console.log("🏁 Marked question end", questionNumber, "at", formatTimestamp(elapsedMs));
    }

    function formatTimestamp(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }

    function generateTimestampText() {
      if (state.questionTimestamps.length === 0) {
        const stored = localStorage.getItem("questionTimestamps");
        if (stored) {
          try {
            state.questionTimestamps = JSON.parse(stored);
          } catch (e) {
            console.error("Failed to parse stored timestamps:", e);
          }
        }
      }

      if (state.questionTimestamps.length === 0) {
        return "[]";
      }

      const questionEntries = state.questionTimestamps.filter(function (item) {
        return item.questionNumber !== "PAUSED" && item.questionNumber !== "RESUMED";
      });

      const startEntries = questionEntries.filter(function (item) {
        return !item.eventType || item.eventType === "start";
      });
      const timestampTuples = startEntries.map(function (item) {
        const timeInSeconds = Math.floor(item.timestamp / 1000);
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

    function getTimestampText() {
      return generateTimestampText();
    }

    function resetTimestamps() {
      state.questionTimestamps = [];
      localStorage.removeItem("questionTimestamps");
      console.log("🔄 Reset timestamps");
    }

    function restoreTimestampsFromStorage() {
      try {
        var qts = localStorage.getItem("questionTimestamps");
        state.questionTimestamps = qts ? JSON.parse(qts) : [];
      } catch (e) {
        state.questionTimestamps = [];
      }
      var rst = localStorage.getItem("recordingStartTime");
      state.recordingStartTime = rst ? parseInt(rst, 10) : null;
      var tpt = localStorage.getItem("totalPausedTime");
      state.totalPausedTime = tpt ? parseInt(tpt, 10) : 0;
      state.pauseStartTime = null;
      state.isPaused = false;
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
    }

    function clearTimestampsOnCleanup() {
      localStorage.removeItem("recordingStartTime");
      localStorage.removeItem("questionTimestamps");
      localStorage.removeItem("recordingPaused");
      localStorage.removeItem("pauseStartTime");
      localStorage.removeItem("totalPausedTime");
      state.recordingStartTime = null;
      state.questionTimestamps = [];
      state.totalPausedTime = 0;
      state.pauseStartTime = null;
      state.isPaused = false;
    }

    return {
      ensureTimingState: ensureTimingState,
      getElapsedMs: getElapsedMs,
      formatTimestamp: formatTimestamp,
      markQuestionStart: markQuestionStart,
      markQuestionEnd: markQuestionEnd,
      generateTimestampText: generateTimestampText,
      downloadTimestampFile: downloadTimestampFile,
      getTimestampText: getTimestampText,
      resetTimestamps: resetTimestamps,
      restoreTimestampsFromStorage: restoreTimestampsFromStorage,
      clearTimestampsOnCleanup: clearTimestampsOnCleanup,
    };
  }

  window.MiliRecordingParts = window.MiliRecordingParts || {};
  window.MiliRecordingParts.createTimestamps = createRecordingTimestamps;
})();
