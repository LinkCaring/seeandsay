/**
 * Welcome flow orchestrator. Screens 3 & 4 temporarily skipped — see changes/docs/FRONTEND_DEMO_CHANGELOG.md.
 */
function Welcome({ lang, setPage, onRequestStartTest }) {
  var WM = window.MiliWelcomeModules || {};
  var isEn = lang === "en";
  var orderedScreens = ["screen1", "screen2_login", "screen1_video", "screen3"];
  var activeScreenState = React.useState("screen1");
  var activeScreen = activeScreenState[0];
  var setActiveScreen = activeScreenState[1];
  var tipsOpenState = React.useState(false);
  var tipsOpen = tipsOpenState[0];
  var setTipsOpen = tipsOpenState[1];
  var introVideoRef = React.useRef(null);
  var introVideoAutoplayBlockedRef = React.useRef(false);
  var childNameState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childName") || "\"\""); } catch (e) { return ""; }
  });
  var childName = childNameState[0];
  var setChildName = childNameState[1];
  var childGenderState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childGender") || "\"\""); } catch (e) { return ""; }
  });
  var childGender = childGenderState[0];
  var setChildGender = childGenderState[1];
  var childDobState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("childDob") || "\"\""); } catch (e) { return ""; }
  });
  var childDob = childDobState[0];
  var setChildDob = childDobState[1];
  var recordingConsentState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("recordingConsent") || "false"); } catch (e) { return false; }
  });
  var recordingConsent = recordingConsentState[0];
  var setRecordingConsent = recordingConsentState[1];
  var legalConfirmationState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("legalConfirmation") || "false"); } catch (e) { return false; }
  });
  var legalConfirmation = legalConfirmationState[0];
  var setLegalConfirmation = legalConfirmationState[1];
  var parentPhoneState = React.useState(function () {
    try { return JSON.parse(localStorage.getItem("parentPhone") || "\"\""); } catch (e) { return ""; }
  });
  var parentPhone = parentPhoneState[0];
  var setParentPhone = parentPhoneState[1];
  var micPermissionErrorState = React.useState("");
  var micPermissionError = micPermissionErrorState[0];
  var setMicPermissionError = micPermissionErrorState[1];
  var loginSubmittingState = React.useState(false);
  var loginSubmitting = loginSubmittingState[0];
  var setLoginSubmitting = loginSubmittingState[1];
  var resumePromptStageState = React.useState(null);
  var resumePromptStage = resumePromptStageState[0];
  var setResumePromptStage = resumePromptStageState[1];
  var dobInputRef = React.useRef(null);
  var activeIndex = orderedScreens.indexOf(activeScreen);

  var welcomeCtx = {
    isEn: isEn,
    lang: lang,
    setPage: setPage,
    onRequestStartTest: onRequestStartTest,
    activeScreen: activeScreen,
    setActiveScreen: setActiveScreen,
    tipsOpen: tipsOpen,
    setTipsOpen: setTipsOpen,
    introVideoRef: introVideoRef,
    introVideoAutoplayBlockedRef: introVideoAutoplayBlockedRef,
    childName: childName,
    setChildName: setChildName,
    childGender: childGender,
    setChildGender: setChildGender,
    childDob: childDob,
    setChildDob: setChildDob,
    recordingConsent: recordingConsent,
    setRecordingConsent: setRecordingConsent,
    legalConfirmation: legalConfirmation,
    setLegalConfirmation: setLegalConfirmation,
    parentPhone: parentPhone,
    setParentPhone: setParentPhone,
    micPermissionError: micPermissionError,
    setMicPermissionError: setMicPermissionError,
    loginSubmitting: loginSubmitting,
    setLoginSubmitting: setLoginSubmitting,
    resumePromptStage: resumePromptStage,
    setResumePromptStage: setResumePromptStage,
    dobInputRef: dobInputRef,
  };
  welcomeCtx.resumeHandlers = WM.createWelcomeResumeHandlers
    ? WM.createWelcomeResumeHandlers(welcomeCtx)
    : {};

  React.useEffect(function tryAutoplayIntroVideo() {
    if (activeScreen !== "screen1_video") return;
    var el = introVideoRef.current;
    if (!el) return;
    introVideoAutoplayBlockedRef.current = false;
    el.muted = false;
    var p = el.play();
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
      var el = introVideoRef.current;
      if (!el) return;
      var p = el.play();
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
      if (welcomeCtx.resumeHandlers.maybeAskResume("beforeLogin")) return;
    }
    setActiveScreen(next);
  }

  var screenBody = WM.renderWelcomeScreenBody ? WM.renderWelcomeScreenBody(welcomeCtx) : null;

  return (
    <div className="onboarding-flow">
      <div className="onboarding-frame">{screenBody}</div>

      <div
        className="onboarding-nav"
        style={{
          visibility:
            activeScreen === "screen1_video" || activeScreen === "screen2_login"
              ? "hidden"
              : "visible",
        }}
      >
        {activeIndex >= 1 ? (
          <button type="button" className="onboarding-nav-btn" onClick={goPrev}>
            {isEn ? "Previous" : "הקודם"}
          </button>
        ) : (
          <span className="onboarding-nav-btn onboarding-nav-btn--ghost" aria-hidden={true} />
        )}
        <div className="onboarding-progress">
          {orderedScreens.map(function (screenId, idx) {
            return (
              <span
                key={screenId}
                className={"onboarding-dot" + (idx === activeIndex ? " is-active" : "")}
                onClick={function () {
                  if (activeScreen === "screen1" && screenId === "screen2_login") {
                    if (welcomeCtx.resumeHandlers.maybeAskResume("beforeLogin")) return;
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
        {activeIndex < orderedScreens.length - 1 ? (
          <button type="button" className="onboarding-nav-btn" onClick={goNext}>
            {isEn ? "Next" : "הבא"}
          </button>
        ) : (
          <span className="onboarding-nav-btn onboarding-nav-btn--ghost" aria-hidden={true} />
        )}
      </div>
      {WM.renderResumeModal ? WM.renderResumeModal(welcomeCtx) : null}
      {WM.renderTipsModal ? WM.renderTipsModal(welcomeCtx) : null}
    </div>
  );
}
