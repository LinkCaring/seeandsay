/**
 * Welcome login step: child profile, legal consent, mic gate, API user.
 */
(function () {
  var WM = function () {
    return window.MiliWelcomeModules || {};
  };

  function deriveAgeFromDob(dobValue) {
    if (!dobValue) return null;
    var birth = new Date(dobValue + "T00:00:00");
    if (Number.isNaN(birth.getTime())) return null;
    var now = new Date();
    var years = now.getFullYear() - birth.getFullYear();
    var months = now.getMonth() - birth.getMonth();
    var days = now.getDate() - birth.getDate();
    if (days < 0) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    var totalMonths = years * 12 + months;
    return { years: years, months: months, totalMonths: totalMonths };
  }

  function ensureInternalUserId(mods) {
    try {
      var existing = JSON.parse(localStorage.getItem("idDigits") || "\"\"");
      if (existing && String(existing).trim() !== "") return String(existing).trim();
    } catch (e) {}
    var generatedId = "demo-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    mods.setPersistentValue("idDigits", generatedId);
    return generatedId;
  }

  async function submitLoginWelcomeStep(ctx) {
    var mods = WM();
    if (ctx.loginSubmitting) return;
    ctx.setMicPermissionError("");
    if (!ctx.childName || !String(ctx.childName).trim()) {
      alert(mods.tr("test.start.invalidName", ctx.isEn ? "Please enter child name." : "נא למלא שם ילד/ה."));
      return;
    }
    if (!ctx.childGender) {
      alert(mods.tr("test.start.invalidGender", ctx.isEn ? "Please select gender." : "נא לבחור מגדר."));
      return;
    }
    if (!ctx.childDob) {
      alert(mods.tr("test.age.invalidInput", ctx.isEn ? "Please enter a valid age." : "אנא הזינו גיל תקין"));
      return;
    }
    if (!ctx.recordingConsent) {
      alert(mods.tr("test.start.invalidConsent", ctx.isEn ? "Please approve recording consent." : "יש לאשר הסכמה להקלטה."));
      return;
    }
    if (!ctx.legalConfirmation) {
      alert(mods.tr("test.start.invalidLegal", ctx.isEn ? "Please approve legal terms." : "יש לאשר תנאים ומדיניות."));
      return;
    }

    var derivedAge = deriveAgeFromDob(ctx.childDob);
    if (!derivedAge) {
      alert(mods.tr("test.age.invalidInput", ctx.isEn ? "Please enter a valid age." : "אנא הזינו גיל תקין"));
      return;
    }
    if (derivedAge.totalMonths < 24 || derivedAge.totalMonths >= 72) {
      mods.setPersistentValue("ageInvalid", true);
      alert(mods.tr("test.age.invalid", ctx.isEn ? "Age is outside supported range." : "הגיל מחוץ לטווח הנתמך."));
      return;
    }

    if (!("MediaRecorder" in window)) {
      alert(mods.tr("test.mic.unsupported", ctx.isEn ? "Microphone is not supported on this device." : "המיקרופון אינו נתמך במכשיר זה."));
      return;
    }

    ctx.setLoginSubmitting(true);
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(function (track) {
        track.stop();
      });

      mods.setPersistentValue("childName", String(ctx.childName).trim());
      mods.setPersistentValue("childGender", ctx.childGender);
      mods.setPersistentValue("childDob", ctx.childDob);
      mods.setPersistentValue("recordingConsent", !!ctx.recordingConsent);
      mods.setPersistentValue("legalConfirmation", !!ctx.legalConfirmation);
      mods.setPersistentValue("parentPhone", ctx.parentPhone ? String(ctx.parentPhone).trim() : "");
      mods.setPersistentValue(
        "expressionAudioMode",
        ctx.expressionAudioMode === "incremental" ? "incremental" : "legacy"
      );
      mods.setPersistentValue("ageYears", String(derivedAge.years));
      mods.setPersistentValue("ageMonths", String(derivedAge.months));
      mods.setPersistentValue("ageInvalid", false);
      mods.setPersistentValue("ageConfirmed", true);
      mods.setPersistentValue("permission", true);
      mods.setPersistentValue("microphoneSkipped", false);
      mods.setPersistentValue("micCheckPassed", false);
      mods.setPersistentValue("awaitingExpressionMicCheck", false);
      mods.setPersistentValue("comprIntroVideoComplete", false);
      mods.setPersistentValue("expIntroVideoComplete", false);
      mods.setPersistentValue("pendingExpressionIntroIndex", -1);
      mods.setPersistentValue("voiceIdentifierConfirmed", true);
      try {
        localStorage.removeItem("readingValidated");
        localStorage.removeItem("readingValidationResult");
        localStorage.removeItem("readingRecordingBlob");
      } catch (e) {}
      mods.setPersistentValue("sessionRecordingStarted", false);
      mods.setPersistentValue("sessionCompleted", false);
      mods.setPersistentValue("forceFreshStartAfterMicCheck", true);
      if (window.MiliTestSession && window.MiliTestSession.beginNewTestSessionIdentity) {
        window.MiliTestSession.beginNewTestSessionIdentity();
      }

      var internalUserId = ensureInternalUserId(mods);
      if (typeof createUser === "function") {
        var phoneArg = ctx.parentPhone && String(ctx.parentPhone).trim() ? String(ctx.parentPhone).trim() : null;
        createUser(internalUserId, String(ctx.childName).trim() || "SomeUserName", phoneArg);
      }

      ctx.setActiveScreen("screen1_video");
    } catch (err) {
      ctx.setMicPermissionError(
        mods.tr("test.mic.deniedInline", ctx.isEn ? "Microphone permission is required to continue." : "נדרשת הרשאת מיקרופון כדי להמשיך.")
      );
    } finally {
      ctx.setLoginSubmitting(false);
    }
  }

  function renderLoginScreen(ctx) {
    var mods = WM();
    return React.createElement(
      "section",
      { className: "onboarding-screen onboarding-screen--s2" },
      React.createElement(
        "div",
        { className: "onboarding-s1-unified-card" },
        React.createElement("h2", { className: "onboarding-title", style: { marginBottom: "12px" } },
          ctx.isEn ? "Before we start" : "לפני שמתחילים"
        ),
        React.createElement(
          "div",
          {
            className: "age-screen",
            style: { maxWidth: "100%", boxShadow: "none", background: "transparent", padding: 0 },
          },
          React.createElement("input", {
            type: "text",
            placeholder: mods.tr("test.start.childName", ctx.isEn ? "Child name" : "שם הילד/ה"),
            value: ctx.childName,
            onChange: function (e) {
              ctx.setChildName(e.target.value);
            },
          }),
          React.createElement(
            "select",
            {
              value: ctx.childGender,
              onChange: function (e) {
                ctx.setChildGender(e.target.value);
              },
            },
            React.createElement("option", { value: "", disabled: true },
              mods.tr("test.start.gender.placeholder", ctx.isEn ? "Select gender" : "בחרו מגדר")
            ),
            React.createElement("option", { value: "female" },
              mods.tr("test.start.gender.female", ctx.isEn ? "Girl" : "בת")
            ),
            React.createElement("option", { value: "male" },
              mods.tr("test.start.gender.male", ctx.isEn ? "Boy" : "בן")
            )
          ),
          React.createElement(
            "label",
            {
              className: "start-date-field",
              onClick: function () {
                if (!ctx.dobInputRef.current) return;
                try {
                  if (typeof ctx.dobInputRef.current.showPicker === "function") {
                    ctx.dobInputRef.current.showPicker();
                  } else {
                    ctx.dobInputRef.current.focus();
                    ctx.dobInputRef.current.click();
                  }
                } catch (err) {
                  ctx.dobInputRef.current.focus();
                  ctx.dobInputRef.current.click();
                }
              },
            },
            React.createElement("span", { className: "start-date-icon", "aria-hidden": true }, "📅"),
            React.createElement("span", { className: "start-date-value" },
              ctx.childDob
                ? new Date(ctx.childDob + "T00:00:00").toLocaleDateString(ctx.isEn ? "en-US" : "he-IL")
                : mods.tr("test.start.dob", ctx.isEn ? "Date of birth" : "תאריך לידה")
            ),
            React.createElement("input", {
              ref: ctx.dobInputRef,
              type: "date",
              value: ctx.childDob,
              "aria-label": mods.tr("test.start.dob", ctx.isEn ? "Date of birth" : "תאריך לידה"),
              onChange: function (e) {
                ctx.setChildDob(e.target.value);
              },
            })
          ),
          React.createElement("input", {
            type: "tel",
            inputMode: "tel",
            autoComplete: "tel",
            className: "start-phone-input",
            dir: ctx.isEn ? "ltr" : "rtl",
            placeholder: mods.tr(
              "test.start.parentPhone",
              ctx.isEn ? "Mobile phone — feedback SMS when done" : "טלפון נייד- לשליחת המשוב בסיום"
            ),
            value: ctx.parentPhone || "",
            onChange: function (e) {
              ctx.setParentPhone(e.target.value);
            },
          }),
          React.createElement(
            "label",
            { className: "start-consent-row", style: { alignItems: "center", gap: "8px" } },
            React.createElement(
              "span",
              { style: { color: "#1c3b53", minWidth: "140px" } },
              mods.tr("test.start.expressionAudioMode", ctx.isEn ? "Recording mode" : "מצב הקלטה")
            ),
            React.createElement(
              "select",
              {
                value: ctx.expressionAudioMode || "legacy",
                onChange: function (e) {
                  ctx.setExpressionAudioMode(e.target.value === "incremental" ? "incremental" : "legacy");
                },
              },
              React.createElement(
                "option",
                { value: "legacy" },
                mods.tr("test.start.expressionAudioMode.legacy", ctx.isEn ? "Legacy (full test upload)" : "רגיל (העלאה מלאה בסוף)")
              ),
              React.createElement(
                "option",
                { value: "incremental" },
                mods.tr("test.start.expressionAudioMode.incremental", ctx.isEn ? "Incremental (per expression question)" : "אינקרמנטלי (לפי שאלת הבעה)")
              )
            )
          ),
          React.createElement(
            "label",
            { className: "start-consent-row" },
            React.createElement("input", {
              type: "checkbox",
              checked: ctx.recordingConsent,
              onChange: function (e) {
                ctx.setRecordingConsent(!!e.target.checked);
              },
            }),
            React.createElement(
              "span",
              { style: { color: "#1c3b53" } },
              mods.tr("test.start.recordingConsent", ctx.isEn ? "I agree to recording." : "מאשר/ת הסכמה להקלטה")
            )
          ),
          React.createElement(
            "label",
            { className: "start-consent-row start-consent-row--legal" },
            React.createElement("input", {
              type: "checkbox",
              checked: ctx.legalConfirmation,
              onChange: function (e) {
                ctx.setLegalConfirmation(!!e.target.checked);
              },
            }),
            React.createElement(
              "span",
              { style: { color: "#1c3b53" } },
              mods.tr("test.start.legalConfirmation", ctx.isEn ? "I agree to" : "אני מאשר/ת את"),
              ctx.isEn ? " " : "",
              React.createElement(
                "a",
                {
                  href: mods.TERMS_OF_USE_URL,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: { color: "#0b4f7d", fontWeight: 700, textDecoration: "underline" },
                  onClick: function (e) {
                    e.stopPropagation();
                  },
                },
                mods.tr("test.start.termsOfUseLink", ctx.isEn ? "Terms of Use" : "תנאי השימוש")
              ),
              " ",
              mods.tr("test.start.and", ctx.isEn ? "and" : "ו-"),
              ctx.isEn ? " " : "",
              React.createElement(
                "a",
                {
                  href: mods.PRIVACY_POLICY_URL,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: { color: "#0b4f7d", fontWeight: 700, textDecoration: "underline" },
                  onClick: function (e) {
                    e.stopPropagation();
                  },
                },
                mods.tr("test.start.privacyPolicyLink", ctx.isEn ? "Privacy Policy" : "מדיניות הפרטיות")
              ),
              "."
            )
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: function () {
                submitLoginWelcomeStep(ctx);
              },
              disabled: ctx.loginSubmitting,
            },
            ctx.loginSubmitting
              ? ctx.isEn ? "Checking..." : "בודקים..."
              : mods.tr("test.cta.continue", ctx.isEn ? "Continue" : "המשך")
          ),
          ctx.micPermissionError
            ? React.createElement(
                "p",
                {
                  style: {
                    marginTop: "12px",
                    color: "#b71c1c",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    textAlign: "center",
                  },
                },
                ctx.micPermissionError
              )
            : null
        )
      )
    );
  }

  window.MiliWelcomeModules = window.MiliWelcomeModules || {};
  window.MiliWelcomeModules.submitLoginWelcomeStep = submitLoginWelcomeStep;
  window.MiliWelcomeModules.renderLoginScreen = renderLoginScreen;
})();
