/**
 * Session complete: recording finish pipeline, upload, retry.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createSessionFinish(getCtx) {
    function completeSession(updatedQuestionResults) {
      var ctx = getCtx();
      function isIncrementalMode() {
        return typeof ctx.getExpressionAudioMode === "function" && ctx.getExpressionAudioMode() === "incremental";
      }
      // If test is paused, unpause it first
      if (ctx.isPaused) {
        ctx.setIsPaused(false);
      }

      ctx.markCurrentQuestionEndTimestamp();

      ctx.expressionAnswerCaptureActiveRef.current = false;
      if (typeof SessionRecorder !== "undefined" && SessionRecorder.pauseRecordingIfActive) {
        SessionRecorder.pauseRecordingIfActive();
      }

      ctx.stopQuestionAudioForSessionComplete();

      ctx.setImages([]);
      ctx.setExpressionAiResult(null);
      ctx.setExpressionAiLoading(false);
      ctx.setTestUploadError(null);
      ctx.setExpressionAiPollError(null);
      ctx.expressionAiPollStartedRef.current = Date.now();
      ctx.consecutiveCompFailRef.current = 0;
      ctx.consecutiveExprFailRef.current = 0;

      var resultsForFinish = updatedQuestionResults || ctx.questionResults;
      ctx.pendingCompleteSessionResultsRef.current = resultsForFinish;

      var handleUploadResult = function (result) {
        var uploadCtx = getCtx();
        if (!result || result.success === false) {
          uploadCtx.setTestUploadState("failed");
          uploadCtx.setTestUploadError(
            (result && result.error) ? String(result.error) : (uploadCtx.lang === "en" ? "Upload failed" : "העלאת הנתונים נכשלה")
          );
          console.error("[completeSession] test upload failed:", result);
          return;
        }
        uploadCtx.setTestUploadState("ok");
        uploadCtx.setTestUploadError(null);
        if (result.test_id) {
          uploadCtx.setLastCompletedTestId(result.test_id);
          console.log("[completeSession] test_id for AI polling:", result.test_id);
        }
        if (result.expression_ai) {
          uploadCtx.setExpressionAiResult(result.expression_ai);
        }
      };

      function seedLocalExpressionUploadPhase(phaseKey) {
        var seedCtx = getCtx();
        seedCtx.setExpressionAiResult({
          status: "pending",
          meta: {
            progress: {
              phase: phaseKey,
              processed_questions: 0,
              total_questions: 0,
              last_updated_at: new Date().toISOString(),
            },
          },
          expressive_language_impression: { status: "pending" },
        });
      }

      async function uploadSessionResults(finalBlob, timestampText, fullArray) {
        var uploadCtx = getCtx();
        var testId =
          typeof uploadCtx.ensurePendingTestId === "function" ? uploadCtx.ensurePendingTestId() : "test-" + Date.now();

        if (typeof uploadCtx.prepareAudioUpload === "function" && typeof uploadCtx.putSessionAudioToBlob === "function") {
          uploadCtx.setTestUploadState("uploading_blob");
          seedLocalExpressionUploadPhase("uploading_audio");
          try {
            localStorage.setItem("seeandsayPendingBlobUploaded", "0");
          } catch (ssErr) {}

          var prep = await uploadCtx.prepareAudioUpload(uploadCtx.idDigits, testId);
          if (!prep || prep.success === false) {
            throw new Error((prep && prep.error) || "prepareUpload failed");
          }

          var putResult = await uploadCtx.putSessionAudioToBlob(prep.uploadUrl, finalBlob);
          if (!putResult || putResult.success === false) {
            throw new Error((putResult && putResult.error) || "Blob upload failed");
          }

          try {
            localStorage.setItem("seeandsayPendingBlobUploaded", "1");
          } catch (ssErr2) {}

          uploadCtx.setTestUploadState("saving_metadata");
          seedLocalExpressionUploadPhase("saving_metadata");
          return await uploadCtx.updateUserTests(
            uploadCtx.idDigits,
            uploadCtx.ageYears,
            uploadCtx.ageMonths,
            fullArray,
            uploadCtx.correctAnswers,
            uploadCtx.partialAnswers,
            uploadCtx.wrongAnswers,
            null,
            timestampText,
            uploadCtx.childGender,
            prep.blobPath,
            testId
          );
        }

        uploadCtx.setTestUploadState("uploading");
        return await new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = async function () {
            try {
              var legacyCtx = getCtx();
              var legacyResult = await legacyCtx.updateUserTests(
                legacyCtx.idDigits,
                legacyCtx.ageYears,
                legacyCtx.ageMonths,
                fullArray,
                legacyCtx.correctAnswers,
                legacyCtx.partialAnswers,
                legacyCtx.wrongAnswers,
                reader.result,
                timestampText,
                legacyCtx.childGender,
                null,
                testId
              );
              resolve(legacyResult);
            } catch (legacyErr) {
              reject(legacyErr);
            }
          };
          reader.onerror = function () {
            reject(new Error("Failed to read recording for upload"));
          };
          reader.readAsDataURL(finalBlob);
        });
      }

      async function runRecordingFinishPipeline() {
        var pipelineCtx = getCtx();
        var fullArray = pipelineCtx.formatQuestionResultsArray(resultsForFinish);
        if (isIncrementalMode()) {
          var scoreBuckets = null;
          if (typeof pipelineCtx.reconcileSessionScoreCounters === "function") {
            scoreBuckets = pipelineCtx.reconcileSessionScoreCounters(resultsForFinish);
          }
          if (typeof pipelineCtx.beginExpressionEvalFreezeForIncrementalUpload === "function") {
            pipelineCtx.beginExpressionEvalFreezeForIncrementalUpload();
          }
          if (typeof pipelineCtx.waitForExpressionSegmentQueueIdle === "function") {
            try {
              pipelineCtx.setTestUploadState("saving_metadata");
              seedLocalExpressionUploadPhase("scoring_questions");
              await pipelineCtx.waitForExpressionSegmentQueueIdle(60000);
            } catch (idleErr) {}
          }
          var segStats =
            typeof pipelineCtx.getExpressionSegmentUploadStats === "function"
              ? pipelineCtx.getExpressionSegmentUploadStats()
              : { pending: 0, completed: 0, failed: 0 };
          var hasUploadedSegments = (segStats && segStats.completed > 0);
          if (!hasUploadedSegments) {
            console.warn(
              "[incremental] no uploaded segments before finish; falling back to legacy full-audio upload"
            );
          } else {
          pipelineCtx.setTestUploadState("saving_metadata");
          pipelineCtx.expressionPhaseRecordingStartedRef.current = false;
          pipelineCtx.setSessionCompleted(true);
          var incrementalResult = await pipelineCtx.updateUserTests(
            pipelineCtx.idDigits,
            pipelineCtx.ageYears,
            pipelineCtx.ageMonths,
            fullArray,
            scoreBuckets ? scoreBuckets.correct : pipelineCtx.correctAnswers,
            scoreBuckets ? scoreBuckets.partly : pipelineCtx.partialAnswers,
            scoreBuckets ? scoreBuckets.wrong : pipelineCtx.wrongAnswers,
            null,
            null,
            pipelineCtx.childGender,
            null,
            pipelineCtx.ensurePendingTestId()
          );
          handleUploadResult(incrementalResult);
          return;
          }
        }
        pipelineCtx.setTestUploadState("preparing_recording");

        if (typeof SessionRecorder !== "undefined" && SessionRecorder.stopContinuousRecording) {
          SessionRecorder.stopContinuousRecording();
        }
        pipelineCtx.expressionPhaseRecordingStartedRef.current = false;

        var waitMs = 120000;
        if (typeof SessionRecorder !== "undefined" && SessionRecorder.getConversionWaitMs) {
          waitMs = SessionRecorder.getConversionWaitMs();
        }
        console.log("🛑 Waiting for session recording (up to " + Math.round(waitMs / 1000) + "s)...");

        try {
          if (typeof SessionRecorder === "undefined" || !SessionRecorder.whenFinalBlobReady) {
            throw new Error("SessionRecorder is not available");
          }

          var data = await SessionRecorder.whenFinalBlobReady({ timeoutMs: waitMs });
          if (!data || !data.recordingBlob) {
            throw new Error("Recording file is not available after preparation");
          }

          if (SessionRecorder.setFinalRecordingBlob) {
            SessionRecorder.setFinalRecordingBlob(data.recordingBlob, {
              mimeType: data.mimeType || "audio/mpeg",
              timestamp: data.recordingDate || Date.now(),
            });
          }
          var recordingUrl = URL.createObjectURL(data.recordingBlob);
          localStorage.setItem("sessionRecordingUrl", recordingUrl);
          pipelineCtx.setSessionCompleted(true);

          var uploadResult = await uploadSessionResults(
            data.recordingBlob,
            data.timestampText,
            fullArray
          );
          handleUploadResult(uploadResult);
        } catch (prepErr) {
          var errCtx = getCtx();
          console.error("[completeSession] recording prepare/upload failed:", prepErr);
          errCtx.setSessionCompleted(true);
          errCtx.setTestUploadState("failed");
          var prepMsg =
            errCtx.lang === "en"
              ? "Could not prepare the session recording. Wait a moment, then tap Retry."
              : "לא ניתן להכין את הקלטת המבחן. המתינו רגע ולחצו על ניסיון חוזר.";
          if (prepErr && prepErr.message) {
            prepMsg += " (" + prepErr.message + ")";
          }
          errCtx.setTestUploadError(prepMsg);
        }
      }

      async function retryRecordingUpload() {
        var retryCtx = getCtx();
        var results = retryCtx.pendingCompleteSessionResultsRef.current || retryCtx.questionResults;
        retryCtx.pendingCompleteSessionResultsRef.current = results;
        retryCtx.setTestUploadError(null);
        await runRecordingFinishPipeline();
      }
      ctx.retryRecordingUploadRef.current = retryRecordingUpload;

      // Stop continuous session recording and send data to backend
      if (ctx.sessionRecordingStarted && ctx.permission) {
        runRecordingFinishPipeline();
      } else {
        var noRecCtx = getCtx();
        noRecCtx.setTestUploadState("uploading");
        // No recording, show completion and send immediately
        noRecCtx.expressionPhaseRecordingStartedRef.current = false;
        noRecCtx.setSessionCompleted(true);
        const fullArray = noRecCtx.formatQuestionResultsArray(resultsForFinish);
        noRecCtx.updateUserTests(noRecCtx.idDigits, noRecCtx.ageYears, noRecCtx.ageMonths, fullArray, noRecCtx.correctAnswers, noRecCtx.partialAnswers, noRecCtx.wrongAnswers,
          null, null, noRecCtx.childGender).then(function(result) {
            handleUploadResult(result);
          }).catch(function(err) {
            console.error("updateUserTests (no recording):", err);
            handleUploadResult({
              success: false,
              error: err && err.message ? err.message : String(err),
            });
          }); //MongoDB
      }
    }

    return {
      completeSession: completeSession,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createSessionFinish = createSessionFinish;
})();
