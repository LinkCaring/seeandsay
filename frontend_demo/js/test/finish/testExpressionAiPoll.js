/**
 * Expression AI status polling.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function createExpressionAiPoll(getCtx) {
    async function refreshExpressionAiStatus() {
      var ctx = getCtx();
      if (!ctx.lastCompletedTestId) return;
      ctx.setExpressionAiLoading(true);
      try {
        var resp =
          typeof getExpressionAiStatus === "function"
            ? await getExpressionAiStatus(ctx.idDigits, ctx.lastCompletedTestId)
            : null;
        if (resp && resp.expression_ai) {
          ctx.setExpressionAiResult(resp.expression_ai);
          ctx.setExpressionAiPollError(null);
        } else {
          ctx.setExpressionAiPollError(
            ctx.lang === "en"
              ? "Could not load AI status. Tap Refresh."
              : "לא ניתן לטעון סטטוס משוב. לחצו רענון."
          );
        }
      } catch (pollErr) {
        console.error("refreshExpressionAiStatus:", pollErr);
        ctx.setExpressionAiPollError(
          ctx.lang === "en"
            ? "Could not load AI status. Tap Refresh."
            : "לא ניתן לטעון סטטוס משוב. לחצו רענון."
        );
      } finally {
        ctx.setExpressionAiLoading(false);
      }
    }

    return {
      refreshExpressionAiStatus: refreshExpressionAiStatus,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createExpressionAiPoll = createExpressionAiPoll;
})();
