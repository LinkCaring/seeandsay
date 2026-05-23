/**
 * Age math, badge formatting, adaptive wrong-logic gate (no UI).
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  function totalMonths(ageYears, ageMonths) {
    var y = parseInt(ageYears, 10) || 0;
    var m = parseInt(ageMonths, 10) || 0;
    return y * 12 + m;
  }

  function deriveAgeFromDob(dobValue) {
    if (!dobValue) return null;
    var dob = new Date(dobValue + "T00:00:00");
    if (Number.isNaN(dob.getTime())) return null;
    var today = new Date();
    var years = today.getFullYear() - dob.getFullYear();
    var months = today.getMonth() - dob.getMonth();
    if (today.getDate() < dob.getDate()) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return null;
    return { years: years, months: months, totalMonths: years * 12 + months };
  }

  function ageValueFromPart(part) {
    if (!part) return "";
    var match = String(part).trim().match(/^(\d+):(\d{1,2})$/);
    if (!match) return String(part).trim();
    var years = parseInt(match[1], 10);
    var months = parseInt(match[2], 10);
    if (!Number.isFinite(years) || !Number.isFinite(months)) return String(part).trim();
    return months <= 0 ? years : years + 0.5;
  }

  function formatAgePartCompact(part) {
    var value = ageValueFromPart(part);
    if (value === "") return "";
    if (typeof value === "string") return value;
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }

  function formatQuestionAgeBadge(ageGroup) {
    if (!ageGroup) return "";
    var normalized = String(ageGroup).trim();
    if (normalized === "") return "";
    var parts = normalized.split("-");
    if (parts.length !== 2) return normalized;
    var from = formatAgePartCompact(parts[0]);
    var to = formatAgePartCompact(parts[1]);
    if (!from || !to) return normalized;
    if (from === to) return from;
    return from + " - " + to;
  }

  function parseAgeTokenToMonths(token) {
    if (!token) return null;
    var t = String(token).trim();
    if (!t) return null;
    var m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) {
      var y = parseInt(m[1], 10);
      var mm = parseInt(m[2], 10);
      if (!Number.isFinite(y) || !Number.isFinite(mm)) return null;
      return y * 12 + mm;
    }
    var yOnly = parseInt(t, 10);
    if (Number.isFinite(yOnly)) return yOnly * 12;
    return null;
  }

  function getAgeGroupStartMonths(ageGroup) {
    if (!ageGroup) return null;
    var parts = String(ageGroup).split("-");
    return parseAgeTokenToMonths(parts[0]);
  }

  function shouldApplyAdaptiveWrongLogic(questionObj, childMonths) {
    if (!questionObj) return true;
    var startMonths = getAgeGroupStartMonths(questionObj.age_group);
    if (startMonths == null) return true;
    return startMonths > childMonths;
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.totalMonths = totalMonths;
  window.MiliTestModules.deriveAgeFromDob = deriveAgeFromDob;
  window.MiliTestModules.ageValueFromPart = ageValueFromPart;
  window.MiliTestModules.formatAgePartCompact = formatAgePartCompact;
  window.MiliTestModules.formatQuestionAgeBadge = formatQuestionAgeBadge;
  window.MiliTestModules.parseAgeTokenToMonths = parseAgeTokenToMonths;
  window.MiliTestModules.getAgeGroupStartMonths = getAgeGroupStartMonths;
  window.MiliTestModules.shouldApplyAdaptiveWrongLogic = shouldApplyAdaptiveWrongLogic;
})();
