/**
 * Question type labels, results formatting, dedupe/count helpers, load-all sort.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function getQuestionTypeLabel(q) {
    if (!q) return "comprehension";
    return q.query_type === "הבנה" ? "comprehension" : "expression";
  }

  function findFirstExpressionQuestionIndex(questions) {
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].query_type === "הבעה") return i;
    }
    return -1;
  }

  function isOnExpressionPhaseByIndex(idx, questions) {
    var firstExpr = findFirstExpressionQuestionIndex(questions);
    if (firstExpr < 0) return false;
    return idx >= firstExpr;
  }

  function dedupeQuestionResultsKeepLastAttempt(results) {
    var lastByKey = new Map();
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      lastByKey.set(String(r.questionNumber), r);
    }
    var keys = Array.from(lastByKey.keys()).sort(function (a, b) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
    return keys.map(function (k) {
      return lastByKey.get(k);
    });
  }

  function formatQuestionResultsArray(resultsArray) {
    var comp = [];
    var expr = [];

    resultsArray.forEach(function (item) {
      var questionNum = parseInt(item.questionNumber, 10);
      var tuple = "(" + questionNum + ',\"' + item.result + "\")";
      if (item.questionType === "expression") {
        expr.push(tuple);
      } else {
        comp.push(tuple);
      }
    });

    return JSON.stringify({
      comprehension: "[" + comp.join(",") + "]",
      expression: "[" + expr.join(",") + "]",
    });
  }

  function countUniqueQuestionsAnswered(rows) {
    return dedupeQuestionResultsKeepLastAttempt(rows).length;
  }

  function countAnsweredByType(rows, typeLabel, questions) {
    var normalizedType = typeLabel === "expression" ? "expression" : "comprehension";
    var deduped = dedupeQuestionResultsKeepLastAttempt(rows);
    var count = 0;
    for (var i = 0; i < deduped.length; i++) {
      var r = deduped[i];
      var rType = r && r.questionType;
      if (!rType) {
        var qn = parseInt(r && r.questionNumber, 10);
        var q = Number.isFinite(qn) ? questions[qn - 1] : null;
        rType = getQuestionTypeLabel(q);
      }
      if (rType === normalizedType) count += 1;
    }
    return count;
  }

  function countQuestionsByType(typeLabel, questions) {
    var normalizedType = typeLabel === "expression" ? "expression" : "comprehension";
    var count = 0;
    for (var i = 0; i < questions.length; i++) {
      if (getQuestionTypeLabel(questions[i]) === normalizedType) count += 1;
    }
    return count;
  }

  function normalizeAndSortQuestions(allQuestions, childGender) {
    var normalizedGender = String(childGender || "").toLowerCase();
    var useGirlQuery = normalizedGender === "female" || normalizedGender === "girl";
    var useBoyQuery = normalizedGender === "male" || normalizedGender === "boy";

    function pickQueryByGender(q) {
      if (useGirlQuery) {
        return q.query_girl || q.query || q.query_boy || "";
      }
      if (useBoyQuery) {
        return q.query_boy || q.query || q.query_girl || "";
      }
      return q.query_boy || q.query || "";
    }

    var filtered = allQuestions
      .filter(function (q) {
        if (!q || !q.query_type || !q.age_group) return false;
        var chosenQuery = pickQueryByGender(q);
        return !!String(chosenQuery).trim();
      })
      .map(function (q) {
        var chosenQuery = pickQueryByGender(q);
        return Object.assign({}, q, {
          query_type: q.query_type.trim().normalize("NFC"),
          age_group: q.age_group.trim().normalize("NFC"),
          query: String(chosenQuery || "").trim(),
          comments: (q.comments || "").trim(),
        });
      });

    return filtered.sort(function (a, b) {
      var numA = parseInt(a.query_number, 10) || 0;
      var numB = parseInt(b.query_number, 10) || 0;
      return numA - numB;
    });
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.getQuestionTypeLabel = getQuestionTypeLabel;
  window.MiliTestModules.findFirstExpressionQuestionIndex = findFirstExpressionQuestionIndex;
  window.MiliTestModules.isOnExpressionPhaseByIndex = isOnExpressionPhaseByIndex;
  window.MiliTestModules.dedupeQuestionResultsKeepLastAttempt = dedupeQuestionResultsKeepLastAttempt;
  window.MiliTestModules.formatQuestionResultsArray = formatQuestionResultsArray;
  window.MiliTestModules.countUniqueQuestionsAnswered = countUniqueQuestionsAnswered;
  window.MiliTestModules.countAnsweredByType = countAnsweredByType;
  window.MiliTestModules.countQuestionsByType = countQuestionsByType;
  window.MiliTestModules.normalizeAndSortQuestions = normalizeAndSortQuestions;
})();
