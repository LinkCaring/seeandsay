// =============================================================================
// CONTINUOUS SESSION RECORDING MODULE
// Thin facade over js/record_session/recording*.js (same SessionRecorder global API)
// =============================================================================

const SessionRecorder = (function () {
  var parts = window.MiliRecordingParts || {};

  var state = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    isRecording: false,
    isPaused: false,
    recordingStartTime: null,
    questionTimestamps: [],
    pauseStartTime: null,
    totalPausedTime: 0,
    finalRecordingBlob: null,
    finalRecordingMeta: null,
    MAX_SESSION_RECORDING_MS: (12 * 60 + 30) * 1000,
    maxDurationCheckTimer: null,
    onMaxDurationReached: null,
    activeRecordingAccumulatedMs: 0,
    activeRecordingSegmentStart: null,
    CONVERSION_WAIT_MIN_MS: 60000,
    CONVERSION_WAIT_MAX_MS: 300000,
    finalBlobReadyPromise: null,
    finalBlobReadyResolve: null,
    finalBlobReadyReject: null,
    currentMimeType: "",
    getActiveRecordingMs: null,
  };

  var timestamps = parts.createTimestamps(state);
  var encodeRef = {};
  var encode = parts.createEncode(state, timestamps);
  encodeRef.convertToMP3 = encode.convertToMP3;
  encodeRef.buildRecordingPayload = encode.buildRecordingPayload;
  encodeRef.settleFinalBlobReadySuccess = encode.settleFinalBlobReadySuccess;
  encodeRef.settleFinalBlobReadyFailure = encode.settleFinalBlobReadyFailure;
  encodeRef.beginFinalBlobReadyWait = encode.beginFinalBlobReadyWait;
  encodeRef.resetFinalBlobReadyWait = encode.resetFinalBlobReadyWait;
  var capture = parts.createCapture(state, timestamps, encodeRef);

  function cleanup(options) {
    var preserveTs = options && options.preserveQuestionTimestamps;
    capture.clearMaxDurationCheckTimer();
    capture.stopContinuousRecording();
    localStorage.removeItem("sessionRecordingActive");
    localStorage.removeItem("sessionRecordingUrl");
    localStorage.removeItem("sessionRecordingFinal");
    localStorage.removeItem("sessionRecordingFinalMeta");
    localStorage.removeItem("sessionRecordingChunks");
    encode.clearFinalRecording();
    encode.settleFinalBlobReadyFailure(new Error("Session recording cleanup"));
    if (!preserveTs) {
      timestamps.clearTimestampsOnCleanup();
      capture.resetActiveRecordingMeter();
    } else {
      timestamps.restoreTimestampsFromStorage();
    }
    console.log(
      "🧹 Cleaned up session recording" +
        (preserveTs ? " (preserved question timestamps)" : "")
    );
  }

  return {
    startContinuousRecording: capture.startContinuousRecording,
    stopContinuousRecording: capture.stopContinuousRecording,
    pauseRecording: capture.pauseRecording,
    pauseRecordingIfActive: capture.pauseRecordingIfActive,
    resumeRecording: capture.resumeRecording,
    resumeRecordingIfPaused: capture.resumeRecordingIfPaused,
    isRecordingPaused: capture.isRecordingPaused,
    getFinalRecordingUrl: encode.getFinalRecordingUrl,
    getFinalRecordingUrlSync: encode.getFinalRecordingUrlSync,
    getFinalRecordingData: encode.getFinalRecordingData,
    setFinalRecordingBlob: encode.setFinalRecordingBlob,
    getCurrentMimeType: encode.getCurrentMimeType,
    getCurrentFileExtension: encode.getCurrentFileExtension,
    isRecordingActive: capture.isRecordingActive,
    isMediaRecorderLive: capture.isMediaRecorderLive,
    markQuestionStart: timestamps.markQuestionStart,
    markQuestionEnd: timestamps.markQuestionEnd,
    downloadTimestampFile: timestamps.downloadTimestampFile,
    getTimestampText: timestamps.getTimestampText,
    getRecordingAndText: encode.getRecordingAndText,
    resetTimestamps: timestamps.resetTimestamps,
    cleanup: cleanup,
    setOnMaxDurationReached: capture.setOnMaxDurationReached,
    getMaxSessionRecordingMs: capture.getMaxSessionRecordingMs,
    isAtMaxSessionDuration: capture.isAtMaxSessionDuration,
    getActiveRecordingMs: capture.getActiveRecordingMs,
    getConversionWaitMs: encode.getConversionWaitMs,
    whenFinalBlobReady: encode.whenFinalBlobReady,
  };
})();
