/**
 * Shared test constants and expression timing mirror.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  var PRIVACY_POLICY_URL = "https://www.heb.linkcaring.com/privacy-policy";
  var TERMS_OF_USE_URL = "https://www.heb.linkcaring.com/terms-of-use";
  function getExpressionEvalDelayMs() {
    return typeof window !== "undefined" && Number(window.MILI_EXPRESSION_ANSWER_MS) > 0
      ? Number(window.MILI_EXPRESSION_ANSWER_MS)
      : 20000;
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.PRIVACY_POLICY_URL = PRIVACY_POLICY_URL;
  window.MiliTestModules.TERMS_OF_USE_URL = TERMS_OF_USE_URL;
  window.MiliTestModules.getExpressionEvalDelayMs = getExpressionEvalDelayMs;
})();
