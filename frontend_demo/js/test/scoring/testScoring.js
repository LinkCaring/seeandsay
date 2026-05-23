/**
 * Comprehension image clicks, auto-score, traffic beeps, handleContinue advance.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createTestScoring(getCtx) {
    function playTrafficFeedback(result) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const now = audioCtx.currentTime;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "sine";
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
          o.connect(g);
          g.connect(audioCtx.destination);
          const seq = result === "success" ? [660, 880] : result === "partial" ? [440] : [330, 220];
          o.frequency.setValueAtTime(seq[0], now);
          if (seq.length > 1) o.frequency.setValueAtTime(seq[1], now + 0.11);
          o.start(now);
          o.stop(now + 0.24);
          setTimeout(function () { audioCtx.close && audioCtx.close(); }, 400);
        }
      } catch (e) {
        // ignore
      }
    }

    function finalizeComprehensionResult(result) {
      var ctx = getCtx();
      if (ctx.comprehensionAdvanceLockRef.current) return;
      ctx.comprehensionAdvanceLockRef.current = true;
    if (result === "partial") {
      ctx.setClickedCorrect(true);
      ctx.setFireworksVisible(true);
      playTrafficFeedback("success");
      if (ctx.fireworksTimerRef.current) {
        clearTimeout(ctx.fireworksTimerRef.current);
        ctx.fireworksTimerRef.current = null;
      }
      ctx.fireworksTimerRef.current = setTimeout(function () {
        handleContinue("partial");
        ctx.comprehensionAdvanceLockRef.current = false;
      }, 1600);
      return;
    }

    playTrafficFeedback(result);
    handleContinue(result);
    ctx.comprehensionAdvanceLockRef.current = false;
    }

    function finalizeComprehensionSuccess() {
      var ctx = getCtx();
      if (ctx.comprehensionAdvanceLockRef.current) return;
      ctx.comprehensionAdvanceLockRef.current = true;
      ctx.setClickedCorrect(true);
      ctx.setFireworksVisible(true);
      if (ctx.fireworksTimerRef.current) {
        clearTimeout(ctx.fireworksTimerRef.current);
        ctx.fireworksTimerRef.current = null;
      }
      ctx.fireworksTimerRef.current = setTimeout(function () {
        handleContinue("success");
        ctx.comprehensionAdvanceLockRef.current = false;
      }, 2400);
    }
    function handleClick(img, event) {
      var ctx = getCtx();
      // Reset AFK timer on user interaction
      ctx.resetAfkTimer();

      if (ctx.questionType === "C") {
        // Get the image index (1-based)
        const imgIndex = ctx.images.indexOf(img) + 1;

        // Check if this image is non-clickable
        if (ctx.nonClickableImage && imgIndex === ctx.nonClickableImage) {
          return; // Don't process click on non-clickable image
        }

        if (ctx.answerType === "single") {
          var twoPhotoStrict = ctx.images.length === 2;
          if (twoPhotoStrict) {
            var correct2 = img === ctx.target;
            if (correct2) {
              finalizeComprehensionSuccess();
            } else {
              finalizeComprehensionResult("failure");
            }
            return;
          }

          const correct = img === ctx.target;
          var awaitingRetry = ctx.singleComprehensionRetryRef.current;
          if (correct) {
            if (!awaitingRetry) {
              finalizeComprehensionSuccess();
            } else {
              ctx.singleComprehensionRetryRef.current = false;
              finalizeComprehensionResult("partial");
            }
          } else {
            if (!awaitingRetry) {
              ctx.singleComprehensionRetryRef.current = true;
              ctx.playTryAgainAudio();
            } else {
              ctx.singleComprehensionRetryRef.current = false;
              finalizeComprehensionResult("failure");
            }
          }
        } else if (ctx.answerType === "multi") {
          // Repeated taps on the same image count as a single pick.
          if (ctx.allClickedAnswers.includes(imgIndex)) {
            if (!ctx.multiAnswers.includes(imgIndex)) {
              ctx.playTryAgainAudio();
            }
            return;
          }

          const nextAttempts = ctx.multiAttemptCount + 1;
          ctx.setMultiAttemptCount(nextAttempts);

          if (!ctx.multiAnswers.includes(imgIndex)) {
            ctx.multiWrongClicksRef.current += 1;
          }

          const newAllClicked = ctx.allClickedAnswers.includes(imgIndex)
            ? ctx.allClickedAnswers
            : [...ctx.allClickedAnswers, imgIndex];
          if (newAllClicked !== ctx.allClickedAnswers) {
            ctx.setAllClickedAnswers(newAllClicked);
          }

          let updatedClickedCorrect = ctx.clickedMultiAnswers;
          if (ctx.multiAnswers.includes(imgIndex)) {
            if (!ctx.clickedMultiAnswers.includes(imgIndex)) {
              updatedClickedCorrect = [...ctx.clickedMultiAnswers, imgIndex];
              ctx.setClickedMultiAnswers(updatedClickedCorrect);
            }
          }

          let isNowCorrect = false;
          const correctTargetCount = ctx.minCorrectAnswers !== null ? ctx.minCorrectAnswers : ctx.multiAnswers.length;
          const allCorrectSelected = ctx.minCorrectAnswers !== null
            ? (updatedClickedCorrect.length >= ctx.minCorrectAnswers)
            : (updatedClickedCorrect.length === ctx.multiAnswers.length);
          if (allCorrectSelected) {
            ctx.setClickedCorrect(true);
            isNowCorrect = true;
          }

          /* Stop after x+1 attempts without a full pass (x = min correct picks).
             Also stop immediately if it becomes impossible to reach the required correct set
             with the attempts left (early hard-failure). */
          const attemptLimit = correctTargetCount + 1;
          const attemptsLeft = attemptLimit - nextAttempts;
          const neededCorrect = Math.max(0, correctTargetCount - updatedClickedCorrect.length);
          const impossibleToRecover = !isNowCorrect && neededCorrect > attemptsLeft;
          var willFinalizeFailure = !isNowCorrect && (nextAttempts >= attemptLimit || impossibleToRecover);
          if (!ctx.multiAnswers.includes(imgIndex) && !willFinalizeFailure) {
            ctx.playTryAgainAudio();
          }

          if (isNowCorrect || nextAttempts >= attemptLimit || impossibleToRecover) {
            var x = correctTargetCount;
            var wrongs = ctx.multiWrongClicksRef.current;
            if (isNowCorrect) {
              if (wrongs === 0 && nextAttempts === x) {
                finalizeComprehensionSuccess();
              } else {
                finalizeComprehensionResult("partial");
              }
            } else {
              finalizeComprehensionResult("failure");
            }
          }
        } else if (ctx.answerType === "ordered") {
          if (ctx.orderedAnswers.length !== 2) {
            if (ctx.orderedClickSequence.length > 0 && ctx.orderedClickSequence.at(-1) != imgIndex) {
              const newSeq = [ctx.orderedClickSequence.at(-1), imgIndex];
              var isOkLong = newSeq.length === ctx.orderedAnswers.length &&
                newSeq.every(function (val, idx) { return val === ctx.orderedAnswers[idx]; });
              if (newSeq.length === ctx.orderedAnswers.length) {
                if (isOkLong) {
                  ctx.setClickedCorrect(true);
                  ctx.setOrderedClickSequence(newSeq);
                  finalizeComprehensionSuccess();
                } else {
                  ctx.setOrderedClickSequence(newSeq);
                  finalizeComprehensionResult("failure");
                }
              } else {
                ctx.setOrderedClickSequence(newSeq);
              }
            } else {
              ctx.setOrderedClickSequence([imgIndex]);
            }
          } else {
            var expFirst = ctx.orderedAnswers[0];
            var expSecond = ctx.orderedAnswers[1];
            var fourImageOrdered = ctx.images.length === 4;

            if (ctx.orderedRescueActiveRef.current) {
              if (imgIndex === ctx.orderedRescueTargetRef.current) {
                ctx.orderedRescueActiveRef.current = false;
                ctx.orderedRescueTargetRef.current = null;
                finalizeComprehensionResult("partial");
              } else {
                ctx.orderedRescueActiveRef.current = false;
                ctx.orderedRescueTargetRef.current = null;
                finalizeComprehensionResult("failure");
              }
              return;
            }

            if (fourImageOrdered) {
              if (ctx.orderedClickSequence.length === 0) {
                ctx.setOrderedClickSequence([imgIndex]);
                if (imgIndex !== expFirst) {
                  ctx.playTryAgainAudio();
                }
                return;
              }

              if (ctx.orderedClickSequence.length === 1) {
                var firstPick4 = ctx.orderedClickSequence[0];
                if (imgIndex === firstPick4) {
                  if (firstPick4 === expFirst) {
                    ctx.setOrderedClickSequence([firstPick4, imgIndex]);
                    ctx.playTryAgainAudio();
                    ctx.orderedRescueActiveRef.current = true;
                    ctx.orderedRescueTargetRef.current = expSecond;
                  } else {
                    finalizeComprehensionResult("failure");
                  }
                  return;
                }
                if (firstPick4 !== expFirst && imgIndex !== expFirst) {
                  ctx.setOrderedClickSequence([firstPick4, imgIndex]);
                  finalizeComprehensionResult("failure");
                  return;
                }
                var pair4 = [firstPick4, imgIndex];
                ctx.setOrderedClickSequence(pair4);
                if (firstPick4 === expFirst && imgIndex === expSecond) {
                  ctx.setClickedCorrect(true);
                  finalizeComprehensionSuccess();
                  return;
                }
                if (firstPick4 === expFirst && imgIndex !== expSecond) {
                  ctx.playTryAgainAudio();
                }
                return;
              }

              if (ctx.orderedClickSequence.length === 2) {
                var a4 = ctx.orderedClickSequence[0];
                var b4 = ctx.orderedClickSequence[1];
                ctx.setOrderedClickSequence([a4, b4, imgIndex]);
                // Partial: X→1→2 or 1→X→2 (correct last tap on expSecond).
                var fourUpThirdTapPartial =
                  imgIndex === expSecond &&
                  (b4 === expFirst || a4 === expFirst);
                if (fourUpThirdTapPartial) {
                  ctx.setClickedCorrect(true);
                  finalizeComprehensionResult("partial");
                } else {
                  finalizeComprehensionResult("failure");
                }
                return;
              }

              return;
            }

            if (ctx.orderedClickSequence.length === 0) {
              ctx.setOrderedClickSequence([imgIndex]);
              if (imgIndex !== expFirst) {
                ctx.playTryAgainAudio();
              }
              return;
            }

            var firstPick = ctx.orderedClickSequence[0];
            if (ctx.orderedClickSequence.length === 1) {
              if (imgIndex === firstPick) {
                if (firstPick === expFirst) {
                  ctx.setOrderedClickSequence([firstPick, imgIndex]);
                  ctx.playTryAgainAudio();
                  ctx.orderedRescueActiveRef.current = true;
                  ctx.orderedRescueTargetRef.current = expSecond;
                } else {
                  finalizeComprehensionResult("failure");
                }
                return;
              }

              if (firstPick !== expFirst && imgIndex !== expFirst) {
                ctx.setOrderedClickSequence([firstPick, imgIndex]);
                finalizeComprehensionResult("failure");
                return;
              }
              var pair = [firstPick, imgIndex];
              ctx.setOrderedClickSequence(pair);
              var pairOk = pair[0] === expFirst && pair[1] === expSecond;
              if (pairOk) {
                ctx.setClickedCorrect(true);
                finalizeComprehensionSuccess();
              } else if (firstPick === expFirst && imgIndex !== expSecond) {
                ctx.playTryAgainAudio();
                ctx.orderedRescueActiveRef.current = true;
                ctx.orderedRescueTargetRef.current = expSecond;
              } else {
                ctx.orderedRescueActiveRef.current = true;
                ctx.orderedRescueTargetRef.current = expSecond;
              }
              return;
            }
          }
        } else if (ctx.answerType === "mask") {
          if (ctx.maskCanvas) {
            const isGreen = checkMaskClick(event);
            var awaitingMask2 = ctx.maskAwaitingSecondRef.current;
            if (isGreen) {
              if (!awaitingMask2) {
                ctx.maskAwaitingSecondRef.current = false;
                finalizeComprehensionSuccess();
              } else {
                ctx.maskAwaitingSecondRef.current = false;
                finalizeComprehensionResult("partial");
              }
            } else {
              if (!awaitingMask2) {
                ctx.maskAwaitingSecondRef.current = true;
                ctx.playTryAgainAudio();
              } else {
                ctx.maskAwaitingSecondRef.current = false;
                finalizeComprehensionResult("failure");
              }
            }
          }
        }
      }
    }

    function checkMaskClick(event) {
      var ctx = getCtx();
      if (!ctx.maskCanvas) return false;

      const imgElement = event.target;
      const rect = imgElement.getBoundingClientRect();

      // Get click position relative to image
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Scale to canvas coordinates
      const scaleX = ctx.maskCanvas.width / rect.width;
      const scaleY = ctx.maskCanvas.height / rect.height;
      const canvasX = Math.floor(x * scaleX);
      const canvasY = Math.floor(y * scaleY);

      // Ensure coordinates are within bounds
      if (canvasX < 0 || canvasX >= ctx.maskCanvas.width || canvasY < 0 || canvasY >= ctx.maskCanvas.height) {
        return false;
      }

      // Get pixel data from canvas
      const canvasCtx = ctx.maskCanvas.getContext("2d");
      const pixelData = canvasCtx.getImageData(canvasX, canvasY, 1, 1).data;

      // Check if pixel is green (R < 50, G > 200, B < 50)
      const isGreen = pixelData[0] < 50 && pixelData[1] > 200 && pixelData[2] < 50;

      console.log('Mask click at:', canvasX, canvasY, 'RGB:', pixelData[0], pixelData[1], pixelData[2], 'isGreen:', isGreen);

      return isGreen;
    }

    function handleContinue(result) {
      var ctx = getCtx();
      // Reset AFK timer on user interaction
      ctx.resetAfkTimer();

      // Important: close "continue" state BEFORE changing question index to avoid
      // the traffic popup staying open / re-opening over the next question.
      ctx.setShowContinue(false);

      const currentIdx = ctx.getCurrentQuestionIndex();
      const currentQuestion = ctx.questions[currentIdx];

      let updatedQuestionResults = ctx.questionResults;

      if (currentQuestion) {
        let resultString = "";
        let expressionCakeCategory = null;
        if (result === "success") {
          resultString = "correct";
          expressionCakeCategory = "exact";
        } else if (result === "partial") {
          resultString = "partly";
          expressionCakeCategory = "almost";
        } else if (result === "midFailure") {
          // Keep mapped as wrong for adaptive flow (including consecutive-failure rules).
          resultString = "wrong";
          expressionCakeCategory = "knew_not_say";
        } else if (result === "failure") {
          resultString = "wrong";
          expressionCakeCategory = "not_there_yet";
        }

        if (resultString) {
          const questionNumber = currentQuestion.query_number;
          const questionTypeLabel = ctx.getQuestionTypeLabel(currentQuestion);
          const qKey = String(questionNumber);
          const previousForQuestion = ctx.questionResults.filter(function (r) {
            return String(r.questionNumber) === qKey;
          });
          previousForQuestion.forEach(function (r) {
            ctx.adjustCountsForResult(r.result, -1);
          });
          ctx.adjustCountsForResult(resultString, 1);
          const nextBase = ctx.questionResults.filter(function (r) {
            return String(r.questionNumber) !== qKey;
          });
          updatedQuestionResults = nextBase.concat([{
            questionNumber: questionNumber,
            result: resultString,
            questionType: questionTypeLabel,
            expressionCakeCategory: questionTypeLabel === "expression" ? expressionCakeCategory : null
          }]);

          ctx.setQuestionResults(updatedQuestionResults);
          console.log("Recorded result for question", questionNumber, ":", resultString);

          var qtLabel = ctx.getQuestionTypeLabel(currentQuestion);
          var adaptiveLogicEnabledForQuestion = ctx.shouldApplyAdaptiveWrongLogic(currentQuestion);
          if (qtLabel === "comprehension") {
            ctx.consecutiveExprFailRef.current = 0; // Keep comprehension streak independent from expression streak.
            ctx.consecutiveCompFailRef.current = adaptiveLogicEnabledForQuestion && resultString === "wrong"
              ? ctx.consecutiveCompFailRef.current + 1
              : 0;
          }
          if (qtLabel === "expression") {
            ctx.consecutiveCompFailRef.current = 0; // Keep expression streak independent from comprehension streak.
            ctx.consecutiveExprFailRef.current = adaptiveLogicEnabledForQuestion && resultString === "wrong"
              ? ctx.consecutiveExprFailRef.current + 1
              : 0;
          }
        }
      }

      var nextStreak = result === "success" ? (ctx.consecutiveSuccessStreak + 1) : 0;
      ctx.setConsecutiveSuccessStreak(nextStreak);
      var shouldRunThreeInRowCelebration = result === "success" && nextStreak > 0 && (nextStreak % 3 === 0);

      function advanceAfterResult() {
        if (ctx.consecutiveExprFailRef.current >= 2) {
          ctx.consecutiveExprFailRef.current = 0;
          ctx.consecutiveCompFailRef.current = 0;
          ctx.requestCompleteSessionOrConfirm(updatedQuestionResults);
          return;
        }
        if (ctx.consecutiveCompFailRef.current >= 2) {
          var firstExprIdx = ctx.findFirstExpressionQuestionIndex();
          ctx.consecutiveCompFailRef.current = 0;
          if (firstExprIdx >= 0 && currentIdx < firstExprIdx) {
            if (ctx.tryGateExpressionMicCheckBeforeNavigatingTo(firstExprIdx)) return;
            if (ctx.tryDeferExpressionIntroBeforeNavigatingTo(firstExprIdx)) return;
            ctx.updateCurrentQuestionIndex(firstExprIdx);
            return;
          }
        }
        // Last question in the CSV flow — still confirm if expression section is incomplete.
        if (currentIdx >= ctx.questions.length - 1) {
          ctx.requestCompleteSessionOrConfirm(updatedQuestionResults);
          return;
        }
        if (currentIdx < ctx.questions.length - 1) {
          var nextIdx = currentIdx + 1;
          var firstExprForAdvance = ctx.findFirstExpressionQuestionIndex();
          if (
            firstExprForAdvance >= 0 &&
            nextIdx >= firstExprForAdvance &&
            currentIdx < firstExprForAdvance &&
            ctx.tryGateExpressionMicCheckBeforeNavigatingTo(nextIdx)
          ) {
            return;
          }
          if (
            firstExprForAdvance >= 0 &&
            nextIdx >= firstExprForAdvance &&
            currentIdx < firstExprForAdvance &&
            ctx.tryDeferExpressionIntroBeforeNavigatingTo(nextIdx)
          ) {
            return;
          }
          ctx.updateCurrentQuestionIndex(nextIdx);
        } else {
          var shouldFinishAtLastQuestion = false;
          if (ctx.questionType === "E") {
            var exprTotalAtEnd = ctx.countQuestionsByType("expression");
            var exprAnsweredAtEnd = ctx.countAnsweredByType(updatedQuestionResults, "expression");
            shouldFinishAtLastQuestion = exprTotalAtEnd === 0 || exprAnsweredAtEnd >= exprTotalAtEnd;
          } else {
            var answeredCount = ctx.dedupeQuestionResultsKeepLastAttempt(updatedQuestionResults).length;
            shouldFinishAtLastQuestion = answeredCount >= ctx.questions.length;
          }
          if (shouldFinishAtLastQuestion) {
            ctx.requestCompleteSessionOrConfirm(updatedQuestionResults);
          } else {
            ctx.openIncompleteSummaryConfirm(updatedQuestionResults);
          }
        }
      }

      if (shouldRunThreeInRowCelebration) {
        ctx.startThreeInRowCelebration(advanceAfterResult);
        return;
      }

      // All non-celebration paths continue immediately.
      advanceAfterResult();
    }

    return {
      playTrafficFeedback: playTrafficFeedback,
      handleClick: handleClick,
      handleContinue: handleContinue,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createTestScoring = createTestScoring;
})();
