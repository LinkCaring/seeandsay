/**
 * Welcome flow: screens 3 & 4 are temporarily skipped (see FRONTEND_DEMO_CHANGELOG.md).
 * Restore: set orderedScreens to include "screen3","screen4", uncomment blocks below in renderScreenBody,
 * and remove the onboarding-cta-row from screen2 (Tips + Start) — that CTA was only on screen4.
 */
function Welcome({ lang, setPage, onRequestStartTest }) {
  const isEn = lang === "en";
  const ENABLE_SCREEN1_INTRO_VIDEO = true;
  const orderedScreens = ["screen1", "screen2_login", "screen1_video", "screen3"];
  // const orderedScreens = ["screen1", "screen2", "screen3", "screen4"];
  const [activeScreen, setActiveScreen] = React.useState("screen1");
  const [tipsOpen, setTipsOpen] = React.useState(false);
  const introVideoRef = React.useRef(null);
  const introVideoAutoplayBlockedRef = React.useRef(false);
  const PRIVACY_POLICY_URL = "https://www.heb.linkcaring.com/privacy-policy";
  const TERMS_OF_USE_URL = "https://www.heb.linkcaring.com/terms-of-use";
  const [childName, setChildName] = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childName") || "\"\""); } catch (e) { return ""; }
  });
  const [childGender, setChildGender] = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childGender") || "\"\""); } catch (e) { return ""; }
  });
  const [childDob, setChildDob] = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childDob") || "\"\""); } catch (e) { return ""; }
  });
  const [recordingConsent, setRecordingConsent] = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("recordingConsent") || "false"); } catch (e) { return false; }
  });
  const [legalConfirmation, setLegalConfirmation] = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("legalConfirmation") || "false"); } catch (e) { return false; }
  });
  const [micPermissionError, setMicPermissionError] = React.useState("");
  const [loginSubmitting, setLoginSubmitting] = React.useState(false);
  const [resumePromptStage, setResumePromptStage] = React.useState(null); // "beforeLogin" | null
  const dobInputRef = React.useRef(null);
  const activeIndex = orderedScreens.indexOf(activeScreen);

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === "function") {
      return window.I18N.t(key);
    }
    return fallback || key;
  }

  function setPersistentValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function hasInProgressTestState() {
    try {
      if (localStorage.getItem("sessionCompleted") === "true") return false;
      if (localStorage.getItem("ageConfirmed") !== "true") return false;
      if (localStorage.getItem("voiceIdentifierConfirmed") === "true") return true;
      var idx = parseInt(localStorage.getItem("currentIndex") || "0", 10);
      if (!isNaN(idx) && idx > 0) return true;
      var qr = JSON.parse(localStorage.getItem("questionResults") || "[]");
      return Array.isArray(qr) && qr.length > 0;
    } catch (e) {
      return false;
    }
  }

  function clearStoredTestRunKeepChildProfile() {
    [
      "currentIndex",
      "questionResults",
      "correctAnswers",
      "partialAnswers",
      "wrongAnswers",
      "voiceIdentifierConfirmed",
      "readingValidated",
      "readingValidationResult",
      "readingRecordingBlob",
      "sessionCompleted",
      "sessionRecordingStarted",
      "testPaused",
      "audioChunks",
      "audioUrl",
      "recPaused",
      "sessionRecordingActive",
      "sessionRecordingUrl",
      "sessionRecordingFinal",
      "sessionRecordingChunks",
      "recordingStartTime",
      "questionTimestamps",
      "recordingPaused",
      "pauseStartTime",
      "totalPausedTime",
      "ageInvalid",
      "ageConfirmed",
      "permission",
      "microphoneSkipped",
      "micCheckPassed",
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    try {
      sessionStorage.removeItem("seeandsayTempBackendUserId");
    } catch (e) {}
  }

  function maybeAskResume(stage) {
    if (!hasInProgressTestState()) return false;
    setResumePromptStage(stage);
    return true;
  }

  function continueFromPrompt() {
    var stage = resumePromptStage;
    setResumePromptStage(null);
    if (stage === "beforeLogin") {
      // Resume immediately from the saved test state.
      setPersistentValue("forceFreshStartAfterMicCheck", false);
      setPage("test");
    }
  }

  function startNewFromPrompt() {
    var stage = resumePromptStage;
    setResumePromptStage(null);
    if (stage === "beforeLogin") {
      // User asked for a fresh run before login; clear prior persisted run and show login step.
      clearStoredTestRunKeepChildProfile();
      setPersistentValue("forceFreshStartAfterMicCheck", true);
      setActiveScreen("screen2_login");
    }
  }

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

  function ensureInternalUserId() {
    try {
      var existing = JSON.parse(localStorage.getItem("idDigits") || "\"\"");
      if (existing && String(existing).trim() !== "") return String(existing).trim();
    } catch (e) {}
    var generatedId = "demo-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    setPersistentValue("idDigits", generatedId);
    return generatedId;
  }

  async function submitLoginWelcomeStep() {
    if (loginSubmitting) return;
    setMicPermissionError("");
    if (!childName || !String(childName).trim()) {
      alert(tr("test.start.invalidName", isEn ? "Please enter child name." : "נא למלא שם ילד/ה."));
      return;
    }
    if (!childGender) {
      alert(tr("test.start.invalidGender", isEn ? "Please select gender." : "נא לבחור מגדר."));
      return;
    }
    if (!childDob) {
      alert(tr("test.age.invalidInput", isEn ? "Please enter a valid age." : "אנא הזינו גיל תקין"));
      return;
    }
    if (!recordingConsent) {
      alert(tr("test.start.invalidConsent", isEn ? "Please approve recording consent." : "יש לאשר הסכמה להקלטה."));
      return;
    }
    if (!legalConfirmation) {
      alert(tr("test.start.invalidLegal", isEn ? "Please approve legal terms." : "יש לאשר תנאים ומדיניות."));
      return;
    }

    var derivedAge = deriveAgeFromDob(childDob);
    if (!derivedAge) {
      alert(tr("test.age.invalidInput", isEn ? "Please enter a valid age." : "אנא הזינו גיל תקין"));
      return;
    }
    if (derivedAge.totalMonths < 24 || derivedAge.totalMonths >= 72) {
      setPersistentValue("ageInvalid", true);
      alert(tr("test.age.invalid", isEn ? "Age is outside supported range." : "הגיל מחוץ לטווח הנתמך."));
      return;
    }

    if (!("MediaRecorder" in window)) {
      alert(tr("test.mic.unsupported", isEn ? "Microphone is not supported on this device." : "המיקרופון אינו נתמך במכשיר זה."));
      return;
    }

    setLoginSubmitting(true);
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(function (track) { track.stop(); });

      setPersistentValue("childName", String(childName).trim());
      setPersistentValue("childGender", childGender);
      setPersistentValue("childDob", childDob);
      setPersistentValue("recordingConsent", !!recordingConsent);
      setPersistentValue("legalConfirmation", !!legalConfirmation);
      setPersistentValue("ageYears", String(derivedAge.years));
      setPersistentValue("ageMonths", String(derivedAge.months));
      setPersistentValue("ageInvalid", false);
      setPersistentValue("ageConfirmed", true);
      setPersistentValue("permission", true);
      setPersistentValue("microphoneSkipped", false);
      setPersistentValue("micCheckPassed", false);
      setPersistentValue("voiceIdentifierConfirmed", true);
      setPersistentValue("readingValidated", true);
      setPersistentValue("readingValidationResult", null);
      setPersistentValue("sessionRecordingStarted", false);
      setPersistentValue("sessionCompleted", false);
      setPersistentValue("forceFreshStartAfterMicCheck", true);

      var internalUserId = ensureInternalUserId();
      if (typeof createUser === "function") {
        createUser(internalUserId, String(childName).trim() || "SomeUserName");
      }

      setActiveScreen("screen1_video");
    } catch (err) {
      setMicPermissionError(tr("test.mic.deniedInline", isEn ? "Microphone permission is required to continue." : "נדרשת הרשאת מיקרופון כדי להמשיך."));
    } finally {
      setLoginSubmitting(false);
    }
  }

  React.useEffect(function tryAutoplayIntroVideo() {
    if (activeScreen !== "screen1_video") return;
    const el = introVideoRef.current;
    if (!el) return;
    introVideoAutoplayBlockedRef.current = false;
    el.muted = false;
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        introVideoAutoplayBlockedRef.current = true;
      });
    }
  }, [activeScreen]);

  React.useEffect(function retryIntroVideoOnFirstInteraction() {
    if (activeScreen !== "screen1_video") return;
    function tryStart() {
      if (!introVideoAutoplayBlockedRef.current) return;
      const el = introVideoRef.current;
      if (!el) return;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          introVideoAutoplayBlockedRef.current = false;
        }).catch(function () {});
      }
    }
    document.addEventListener("pointerdown", tryStart, { passive: true });
    document.addEventListener("touchstart", tryStart, { passive: true });
    return function () {
      document.removeEventListener("pointerdown", tryStart);
      document.removeEventListener("touchstart", tryStart);
    };
  }, [activeScreen]);

  function goPrev() {
    if (activeIndex <= 0) return;
    setActiveScreen(orderedScreens[activeIndex - 1]);
  }

  function goNext() {
    if (activeIndex < 0 || activeIndex >= orderedScreens.length - 1) return;
    var next = orderedScreens[activeIndex + 1];
    if (activeScreen === "screen1" && next === "screen2_login") {
      if (maybeAskResume("beforeLogin")) return;
    }
    setActiveScreen(next);
  }

  function renderScreenBody() {
    if (activeScreen === "screen1") {
      return (
        <section className="onboarding-screen onboarding-screen--s1">
          <div className="onboarding-s1-unified-card">
            <h1 className="onboarding-s1-unified-card__title">
              {isEn ? (
                <React.Fragment>
                  <span className="onboarding-s1-unified-card__title-line">Children&apos;s language abilities measure</span>
                  <span className="onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--sub">(MILI)</span>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <span className="onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--mili">{'מיל"י'}</span>
                  <span className="onboarding-s1-unified-card__title-line onboarding-s1-unified-card__title-line--group">
                    <span className="onboarding-s1-unified-card__title-line--he-desc">מדד יכולות לשוניות ילדים</span>
                    <span className="onboarding-s1-unified-card__title-line--sub">(MILI)</span>
                  </span>
                </React.Fragment>
              )}
            </h1>
            <div className="onboarding-s1-unified-card__divider" role="presentation" aria-hidden="true" />
            <p className="onboarding-s1-unified-card__subtitle">
              {isEn
                ? "Play a short game together and see how your child speaks and develops."
                : "שחקו משחק קצר יחד ותבינו איך ילדכם מדבר ומתפתח"}
            </p>
            <div className="onboarding-s1-unified-card__bullets">
              <div className="onboarding-list-row onboarding-list-row--emoji">
                <span className="onboarding-list-row__emoji" aria-hidden="true">🎯</span>
                <span>{isEn ? "Age-tailored game" : "משחק מותאם גיל"}</span>
              </div>
              <div className="onboarding-list-row onboarding-list-row--emoji">
                <span className="onboarding-list-row__emoji" aria-hidden="true">📊</span>
                <span>{isEn ? "Results will be shown at the end of the game!" : "תוצאות יוצגו בסוף המשחק!"}</span>
              </div>
            </div>
          </div>

          <div className="onboarding-illustration-slot">
            <img
              src="resources/welcome_photo.jpg"
              alt={isEn ? "Parent and child playing together" : "הורה וילד משחקים יחד"}
              className="onboarding-illustration-slot__image"
            />
          </div>
        </section>
      );
    }

    if (activeScreen === "screen2_login") {
      return (
        <section className="onboarding-screen onboarding-screen--s2">
          <div className="onboarding-s1-unified-card">
            <h2 className="onboarding-title" style={{ marginBottom: "12px" }}>
              {isEn ? "Before we start" : "לפני שמתחילים"}
            </h2>
            <div className="age-screen" style={{ maxWidth: "100%", boxShadow: "none", background: "transparent", padding: 0 }}>
              <input
                type="text"
                placeholder={tr("test.start.childName", isEn ? "Child name" : "שם הילד/ה")}
                value={childName}
                onChange={function (e) { setChildName(e.target.value); }}
              />
              <select
                value={childGender}
                onChange={function (e) { setChildGender(e.target.value); }}
              >
                <option value="" disabled>{tr("test.start.gender.placeholder", isEn ? "Select gender" : "בחרו מגדר")}</option>
                <option value="female">{tr("test.start.gender.female", isEn ? "Girl" : "בת")}</option>
                <option value="male">{tr("test.start.gender.male", isEn ? "Boy" : "בן")}</option>
              </select>
              <label
                className="start-date-field"
                onClick={function () {
                  if (!dobInputRef.current) return;
                  try {
                    if (typeof dobInputRef.current.showPicker === "function") dobInputRef.current.showPicker();
                    else {
                      dobInputRef.current.focus();
                      dobInputRef.current.click();
                    }
                  } catch (err) {
                    dobInputRef.current.focus();
                    dobInputRef.current.click();
                  }
                }}
              >
                <span className="start-date-icon" aria-hidden={true}>📅</span>
                <span className="start-date-value">
                  {childDob
                    ? new Date(childDob + "T00:00:00").toLocaleDateString(isEn ? "en-US" : "he-IL")
                    : tr("test.start.dob", isEn ? "Date of birth" : "תאריך לידה")}
                </span>
                <input
                  ref={dobInputRef}
                  type="date"
                  value={childDob}
                  aria-label={tr("test.start.dob", isEn ? "Date of birth" : "תאריך לידה")}
                  onChange={function (e) { setChildDob(e.target.value); }}
                />
              </label>
              <label className="start-consent-row">
                <input
                  type="checkbox"
                  checked={recordingConsent}
                  onChange={function (e) { setRecordingConsent(!!e.target.checked); }}
                />
                <span>{tr("test.start.recordingConsent", isEn ? "I agree to recording." : "מאשר/ת הסכמה להקלטה")}</span>
              </label>
              <label className="start-consent-row start-consent-row--legal">
                <input
                  type="checkbox"
                  checked={legalConfirmation}
                  onChange={function (e) { setLegalConfirmation(!!e.target.checked); }}
                />
                <span style={{ color: "#1c3b53" }}>
                  {tr("test.start.legalConfirmation", isEn ? "I agree to" : "אני מאשר/ת את")}
                  {isEn ? " " : ""}
                  <a href={TERMS_OF_USE_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#0b4f7d", fontWeight: 700, textDecoration: "underline" }} onClick={function (e) { e.stopPropagation(); }}>
                    {tr("test.start.termsOfUseLink", isEn ? "Terms of Use" : "תנאי השימוש")}
                  </a>
                  {" "}
                  {tr("test.start.and", isEn ? "and" : "ו-")}
                  {isEn ? " " : ""}
                  <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#0b4f7d", fontWeight: 700, textDecoration: "underline" }} onClick={function (e) { e.stopPropagation(); }}>
                    {tr("test.start.privacyPolicyLink", isEn ? "Privacy Policy" : "מדיניות הפרטיות")}
                  </a>
                  .
                </span>
              </label>
              <button type="button" onClick={submitLoginWelcomeStep} disabled={loginSubmitting}>
                {loginSubmitting
                  ? (isEn ? "Checking..." : "בודקים...")
                  : tr("test.cta.continue", isEn ? "Continue" : "המשך")}
              </button>
              {micPermissionError ? (
                <p style={{ marginTop: "12px", color: "#b71c1c", fontSize: "14px", lineHeight: "1.5", textAlign: "center" }}>
                  {micPermissionError}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (activeScreen === "screen1_video") {
      return (
        <section className="onboarding-screen onboarding-screen--intro-video-only">
          <video
            ref={introVideoRef}
            className="onboarding-intro-video-only__video"
            src="resources/avatar/intro1.webm"
            autoPlay
            playsInline
            preload="auto"
            onEnded={function () {
              introVideoAutoplayBlockedRef.current = false;
              setActiveScreen("screen3");
            }}
            onError={function () {
              introVideoAutoplayBlockedRef.current = false;
              setActiveScreen("screen3");
            }}
          />
        </section>
      );
    }

    if (activeScreen === "screen3") {
      return (
        <section className="onboarding-screen onboarding-screen--s2">
          <h2 className="onboarding-title">{isEn ? "How does it work?" : "איך זה עובד?"}</h2>
          <div className="onboarding-steps">
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">1</span>
              <div className="onboarding-step-card__icon onboarding-step-card__icon--plain-s2" aria-hidden="true">
                <span className="material-symbols-outlined onboarding-step-card__icon-glyph onboarding-step-card__icon-glyph--plain">volume_up</span>
              </div>
              <div>
                <h3>{isEn ? "Listen to the question" : "שומעים את השאלה"}</h3>
                <p>{isEn ? "The system reads each question. You can replay via the speaker icon." : "האזינו לשאלה יחד עם הילד"}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">2</span>
              <div className="onboarding-step-card__icon onboarding-step-card__icon--plain-s2" aria-hidden="true">
                <span className="material-symbols-outlined onboarding-step-card__icon-glyph onboarding-step-card__icon-glyph--plain onboarding-step-card__icon-glyph--plain-brown">hourglass_top</span>
              </div>
              <div>
                <h3>{isEn ? "Give the child time" : "נותנים לילד לענות"}</h3>
                <p>{isEn ? "Wait for the child's response and allow independent thinking." : "תנו לילד זמן לחשוב ולענות לבד"}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">3</span>
              <div className="onboarding-step-card__icon onboarding-step-card__icon--traffic-wrap">
                <div
                  className="onboarding-step-traffic-preview"
                  role="img"
                  aria-label={isEn ? "Traffic light: success, partial or hint, did not succeed" : "רמזור: הצליח, חלקית/רמז, לא הצליח"}
                >
                  <div className="onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--green">
                    {isEn ? "OK" : "הצליח"}
                  </div>
                  <div className="onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--yellow">
                    {isEn ? "Partial / hint" : "חלקית/רמז"}
                  </div>
                  <div className="onboarding-step-traffic-preview__seg onboarding-step-traffic-preview__seg--red">
                    {isEn ? "Failed" : "לא הצליח"}
                  </div>
                </div>
              </div>
              <div>
                <h3>{isEn ? "Rate the answer" : "דרגו את התשובה"}</h3>
                <p>{isEn ? "At the end of each question, choose success level via traffic light." : "ספקו משוב בשאלות בהן הילד נדרש לדבר  "}</p>
              </div>
            </article>
          </div>
          <div className="onboarding-cta-row onboarding-cta-row--single">
            {/*
            <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={function () { setTipsOpen(true); }}>
              {isEn ? "Tips" : "טיפים"}
            </button>
            */}
            <button
              type="button"
              className="onboarding-btn onboarding-btn--primary"
              onClick={function () {
                setPage("test");
              }}
            >
              {isEn ? "Start game" : "התחילו משחק"}
            </button>
          </div>
        </section>
      );
    }

    /*
    if (activeScreen === "screen3") {
      return (
        <section className="onboarding-screen onboarding-screen--s3">
          <h2 className="onboarding-title">{isEn ? "Question types" : "סוגי שאלות"}</h2>
          <div className="onboarding-types">
            <article className="onboarding-type-card">
              <div className="onboarding-type-card__head onboarding-type-card__head--centered">
                <span className="onboarding-type-title-icon-ring" aria-hidden="true">
                  <span className="material-symbols-outlined onboarding-type-title-icon">touch_app</span>
                </span>
                <h3 className="onboarding-type-card__title">{isEn ? "Comprehension" : "שאלות הבנה"}</h3>
              </div>
              <p>{isEn ? "The child chooses the correct image from available options. The traffic light appears automatically after the choice." : "הילד בוחר את התמונה הנכונה מתוך האפשרויות. הרמזור יופיע אוטומטית לאחר הבחירה"}</p>
            </article>
            <article className="onboarding-type-card onboarding-type-card--alt">
              <div className="onboarding-type-card__head onboarding-type-card__head--centered">
                <span className="onboarding-type-title-icon-ring" aria-hidden="true">
                  <span className="material-symbols-outlined onboarding-type-title-icon">mic</span>
                </span>
                <h3 className="onboarding-type-card__title">{isEn ? "Expression" : "שאלות הבעה"}</h3>
              </div>
              <p>{isEn ? "The child describes and explains the image. The parent clicks the traffic-light icon to provide feedback." : "הילד מתאר ומסביר את התמונה. ההורה לוחץ על אייקון הרמזור כדי לתת משוב"}</p>
              <div className="onboarding-demo-row onboarding-demo-row--expression" aria-hidden="true">
                <div className="onboarding-demo-rating">
                  <span className="onboarding-chip onboarding-chip--green">{isEn ? "Succeeded" : "הצליח"}</span>
                  <span className="onboarding-chip onboarding-chip--yellow">{isEn ? "Partially succeeded" : "הצליח חלקית"}</span>
                  <span className="onboarding-chip onboarding-chip--red">{isEn ? "Did not succeed" : "לא הצליח"}</span>
                </div>
              </div>
            </article>
          </div>
          <p className="onboarding-s3-note">{isEn ? "Pay attention to these icons during the game to spot the question type." : "שימו לב לאייקונים האלה במהלך המשחק כדי לזהות את סוג השאלה"}</p>
        </section>
      );
    }

    if (activeScreen === "screen4") {
      return (
        <section className="onboarding-screen onboarding-screen--s4">
          <h2 className="onboarding-title">{isEn ? "Traffic-light feedback" : "רמזור תשובות - איך מדרגים?"}</h2>
          <div className="onboarding-rating-stack">
            <article className="onboarding-rating onboarding-rating--green">
              <h3>{isEn ? "Succeeded" : "הצליח"}</h3>
              <p>{isEn ? "Answered immediately and confidently." : "ענה נכון ללא עזרה"}</p>
            </article>
            <article className="onboarding-rating onboarding-rating--yellow">
              <h3>{isEn ? "Partially succeeded" : "הצליח חלקית"}</h3>
              <p>{isEn ? "Succeeded with help, then answered correctly." : "הצליח עם עזרה/רמז "}</p>
            </article>
            <article className="onboarding-rating onboarding-rating--red">
              <h3>{isEn ? "Did not succeed" : "לא הצליח"}</h3>
            </article>
          </div>
          <div className="onboarding-cta-row">
            <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={function () { setTipsOpen(true); }}>
              {isEn ? "Tips" : "טיפים"}
            </button>
            <button
              type="button"
              className="onboarding-btn onboarding-btn--primary"
              onClick={function () {
                if (onRequestStartTest) onRequestStartTest();
                else setPage("test");
              }}
            >
              {isEn ? "Start game" : "התחילו משחק"}
            </button>
          </div>
        </section>
      );
    }
    */
  }

  return (
    <div className="onboarding-flow">
      <div className="onboarding-frame">{renderScreenBody()}</div>

      <div className="onboarding-nav" style={{ visibility: (activeScreen === "screen1_video" || activeScreen === "screen2_login") ? "hidden" : "visible" }}>
        {activeIndex >= 1
          ? React.createElement(
              "button",
              { type: "button", className: "onboarding-nav-btn", onClick: goPrev },
              isEn ? "Previous" : "הקודם"
            )
          : React.createElement("span", { className: "onboarding-nav-btn onboarding-nav-btn--ghost", "aria-hidden": true })}
        <div className="onboarding-progress">
          {orderedScreens.map(function (screenId, idx) {
            return (
              <span
                key={screenId}
                className={"onboarding-dot" + (idx === activeIndex ? " is-active" : "")}
                onClick={function () {
                  if (activeScreen === "screen1" && screenId === "screen2_login") {
                    if (maybeAskResume("beforeLogin")) return;
                  }
                  setActiveScreen(screenId);
                }}
                role="button"
                tabIndex={0}
                aria-label={(isEn ? "Go to screen " : "מעבר למסך ") + (idx + 1)}
              />
            );
          })}
        </div>
        {activeIndex < orderedScreens.length - 1
          ? React.createElement(
              "button",
              { type: "button", className: "onboarding-nav-btn", onClick: goNext },
              isEn ? "Next" : "הבא"
            )
          : React.createElement("span", { className: "onboarding-nav-btn onboarding-nav-btn--ghost", "aria-hidden": true })}
      </div>
      {resumePromptStage ? (
        <div className="onboarding-modal-overlay" role="dialog" aria-modal="true" onClick={function () { setResumePromptStage(null); }}>
          <div className="onboarding-modal" onClick={function (e) { e.stopPropagation(); }}>
            <h2 className="onboarding-title">
              {isEn ? "Continue previous game?" : "להמשיך משחק קודם?"}
            </h2>
            <p className="onboarding-subtitle" style={{ marginBottom: "16px" }}>
              {isEn
                ? "A saved game was found. Continue where you left off or start a new game."
                : "נמצא משחק שמור. האם להתחיל משחק חדש או להמשיך מהמקום שהפסקתם?"}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={continueFromPrompt}>
                {isEn ? "Start where you left off" : "המשיכו מהמקום שהפסקתם"}
              </button>
              <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={startNewFromPrompt}>
                {isEn ? "Start new game" : "התחילו משחק חדש"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {tipsOpen ? (
        <div className="onboarding-modal-overlay" role="dialog" aria-modal="true" onClick={function () { setTipsOpen(false); }}>
          <div className="onboarding-modal" onClick={function (e) { e.stopPropagation(); }}>
            <h2 className="onboarding-title">{isEn ? "Tips for a smooth game" : "טיפים חשובים למשחק"}</h2>
            <div className="onboarding-tips-list">
              <div className="onboarding-tip-line">🔇 {isEn ? "Sit in a quiet place." : "שבו במקום שקט"}</div>
              <div className="onboarding-tip-line">⏳ {isEn ? "Let the child answer at their own pace." : "תנו לילד לענות בקצב שלו"}</div>
              <div className="onboarding-tip-line">💡 {isEn ? "Use hints only when needed." : "השתמשו ברמז רק כשצריך"}</div>
              <div className="onboarding-tip-line">🔊🎙️ {isEn ? "Make sure the device allows sound playback and microphone permissions." : "ודאו שהמכשיר מאפשר שמיעת צליל והרשאות מיקרופון"}</div>
              <div className="onboarding-tip-line">🌿 {isEn ? "The goal is to get a natural and reliable picture." : "המטרה היא לקבל תמונה טבעית ואמינה"}</div>
            </div>
            <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={function () { setTipsOpen(false); }}>
              {isEn ? "Close" : "סגור"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
