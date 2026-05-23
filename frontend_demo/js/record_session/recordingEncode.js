/**
 * Session recording: lamejs MP3 conversion and final-blob readiness.
 */
(function () {
  function createRecordingEncode(state, timestamps) {
    function resetFinalBlobReadyWait() {
      state.finalBlobReadyPromise = null;
      state.finalBlobReadyResolve = null;
      state.finalBlobReadyReject = null;
    }

    function settleFinalBlobReadySuccess(payload) {
      if (typeof state.finalBlobReadyResolve === "function") {
        var resolve = state.finalBlobReadyResolve;
        resetFinalBlobReadyWait();
        resolve(payload);
      }
    }

    function settleFinalBlobReadyFailure(err) {
      if (typeof state.finalBlobReadyReject === "function") {
        var reject = state.finalBlobReadyReject;
        resetFinalBlobReadyWait();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    function beginFinalBlobReadyWait() {
      if (!state.finalBlobReadyPromise) {
        state.finalBlobReadyPromise = new Promise(function (resolve, reject) {
          state.finalBlobReadyResolve = resolve;
          state.finalBlobReadyReject = reject;
        });
      }
      return state.finalBlobReadyPromise;
    }

    function buildRecordingPayload(blob, mimeType) {
      return {
        recordingBlob: blob,
        mimeType: mimeType || "audio/mpeg",
        timestampText: timestamps.generateTimestampText(),
        recordingDate: Date.now(),
      };
    }

    function getConversionWaitMs() {
      var activeMs =
        typeof state.getActiveRecordingMs === "function" ? state.getActiveRecordingMs() : 0;
      var scaled = Math.max(state.CONVERSION_WAIT_MIN_MS, activeMs * 0.5 + 30000);
      return Math.min(scaled, state.CONVERSION_WAIT_MAX_MS);
    }

    async function convertToMP3(blob) {
      return new Promise(function (resolve, reject) {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const fileReader = new FileReader();

          fileReader.onload = function () {
            audioContext
              .decodeAudioData(fileReader.result)
              .then(function (audioBuffer) {
                const samples = audioBuffer.getChannelData(0);
                const sampleRate = audioBuffer.sampleRate;

                const int16Samples = new Int16Array(samples.length);
                for (let i = 0; i < samples.length; i++) {
                  const s = Math.max(-1, Math.min(1, samples[i]));
                  int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }

                const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
                const sampleBlockSize = 1152;
                const mp3Data = [];

                for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
                  const sampleChunk = int16Samples.subarray(i, i + sampleBlockSize);
                  const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                  if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                  }
                }

                const mp3buf = mp3encoder.flush();
                if (mp3buf.length > 0) {
                  mp3Data.push(mp3buf);
                }

                const mp3Blob = new Blob(mp3Data, { type: "audio/mpeg" });
                console.log("✅ MP3 conversion complete, size:", mp3Blob.size);
                resolve(mp3Blob);
              })
              .catch(function (err) {
                console.error("Failed to decode audio:", err);
                resolve(blob);
              });
          };

          fileReader.onerror = function () {
            console.error("Failed to read audio file");
            resolve(blob);
          };

          fileReader.readAsArrayBuffer(blob);
        } catch (err) {
          console.error("Error converting to MP3:", err);
          resolve(blob);
        }
      });
    }

    function getFileExtension(mimeType) {
      return ".mp3";
    }

    function getCurrentMimeType() {
      return state.currentMimeType;
    }

    function getCurrentFileExtension() {
      return getFileExtension(state.currentMimeType);
    }

    async function getFinalRecordingUrl() {
      if (state.finalRecordingBlob) {
        return URL.createObjectURL(state.finalRecordingBlob);
      }
      const stored = localStorage.getItem("sessionRecordingUrl");
      if (stored) {
        return stored;
      }
      return null;
    }

    function dataURLtoBlob(dataURL) {
      const arr = dataURL.split(",");
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    }

    async function getFinalRecordingData() {
      if (!state.finalRecordingBlob) {
        return null;
      }
      return {
        recordingBlob: state.finalRecordingBlob,
        mimeType: (state.finalRecordingMeta && state.finalRecordingMeta.mimeType) || "audio/mpeg",
        timestamp: (state.finalRecordingMeta && state.finalRecordingMeta.timestamp) || Date.now(),
      };
    }

    function setFinalRecordingBlob(blob, meta) {
      if (!blob) return;
      state.finalRecordingBlob = blob;
      state.finalRecordingMeta = {
        mimeType: (meta && meta.mimeType) || blob.type || "audio/mpeg",
        timestamp: (meta && meta.timestamp) || Date.now(),
      };
      try {
        localStorage.setItem("sessionRecordingFinalMeta", JSON.stringify(state.finalRecordingMeta));
      } catch (e) {
        console.warn("Failed to persist recording metadata:", e);
      }
    }

    async function getRecordingAndText() {
      if (!state.finalRecordingBlob) {
        console.warn("No recording data found");
        return null;
      }
      return buildRecordingPayload(
        state.finalRecordingBlob,
        (state.finalRecordingMeta && state.finalRecordingMeta.mimeType) || "audio/mpeg"
      );
    }

    function whenFinalBlobReady(options) {
      if (state.finalRecordingBlob) {
        return Promise.resolve(
          buildRecordingPayload(
            state.finalRecordingBlob,
            (state.finalRecordingMeta && state.finalRecordingMeta.mimeType) || "audio/mpeg"
          )
        );
      }

      var timeoutMs =
        options && typeof options.timeoutMs === "number" && options.timeoutMs > 0
          ? options.timeoutMs
          : getConversionWaitMs();

      var readyPromise = beginFinalBlobReadyWait();

      return new Promise(function (resolve, reject) {
        var settled = false;
        function finish(fn, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(value);
        }

        var timer = setTimeout(function () {
          finish(
            reject,
            new Error(
              "Recording preparation timed out after " + Math.round(timeoutMs / 1000) + " seconds"
            )
          );
        }, timeoutMs);

        readyPromise
          .then(function (payload) {
            finish(resolve, payload);
          })
          .catch(function (err) {
            finish(reject, err);
          });
      });
    }

    function getFinalRecordingUrlSync() {
      if (state.finalRecordingBlob) {
        const url = URL.createObjectURL(state.finalRecordingBlob);
        localStorage.setItem("sessionRecordingUrl", url);
        return url;
      }
      return null;
    }

    function clearFinalRecording() {
      state.finalRecordingBlob = null;
      state.finalRecordingMeta = null;
    }

    return {
      resetFinalBlobReadyWait: resetFinalBlobReadyWait,
      settleFinalBlobReadySuccess: settleFinalBlobReadySuccess,
      settleFinalBlobReadyFailure: settleFinalBlobReadyFailure,
      beginFinalBlobReadyWait: beginFinalBlobReadyWait,
      buildRecordingPayload: buildRecordingPayload,
      convertToMP3: convertToMP3,
      getConversionWaitMs: getConversionWaitMs,
      getCurrentMimeType: getCurrentMimeType,
      getCurrentFileExtension: getCurrentFileExtension,
      getFinalRecordingUrl: getFinalRecordingUrl,
      getFinalRecordingUrlSync: getFinalRecordingUrlSync,
      getFinalRecordingData: getFinalRecordingData,
      setFinalRecordingBlob: setFinalRecordingBlob,
      getRecordingAndText: getRecordingAndText,
      whenFinalBlobReady: whenFinalBlobReady,
      clearFinalRecording: clearFinalRecording,
    };
  }

  window.MiliRecordingParts = window.MiliRecordingParts || {};
  window.MiliRecordingParts.createEncode = createRecordingEncode;
})();
