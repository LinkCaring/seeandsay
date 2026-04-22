/**
 * Welcome flow: screens 3 & 4 are temporarily skipped (see FRONTEND_DEMO_CHANGELOG.md).
 * Restore: set orderedScreens to include "screen3","screen4", uncomment blocks below in renderScreenBody,
 * and remove the onboarding-cta-row from screen2 (Tips + Start) — that CTA was only on screen4.
 */
function Welcome({ lang, setPage, onRequestStartTest }) {
  const isEn = lang === "en";
  const orderedScreens = ["screen1", "screen2"];
  // const orderedScreens = ["screen1", "screen2", "screen3", "screen4"];
  const [activeScreen, setActiveScreen] = React.useState("screen1");
  const [tipsOpen, setTipsOpen] = React.useState(false);
  const activeIndex = orderedScreens.indexOf(activeScreen);

  function goPrev() {
    if (activeIndex <= 0) return;
    setActiveScreen(orderedScreens[activeIndex - 1]);
  }

  function goNext() {
    if (activeIndex < 0 || activeIndex >= orderedScreens.length - 1) return;
    setActiveScreen(orderedScreens[activeIndex + 1]);
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

    if (activeScreen === "screen2") {
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
              <div className="onboarding-step-card__icon onboarding-step-card__icon--test-bulb" aria-hidden="true">
                <span className="question-bottom-actions__emoji question-bottom-actions__emoji--hint">💡</span>
              </div>
              <div>
                <h3>{isEn ? "When to use hints?" : "צריכים רמז?"}</h3>
                <p>{isEn ? "Comprehension: use hint only when needed. Expression: compare response with expected style." : "לחצו על הנורה רק כשהילד לא מצליח לענות לבד"}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">4</span>
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
                if (onRequestStartTest) onRequestStartTest();
                else setPage("test");
              }}
            >
              {isEn ? "Start test" : "התחל"}
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
          <p className="onboarding-s3-note">{isEn ? "Pay attention to these icons during the test to identify the question type." : "שימו לב לאייקונים אלו במהלך המבחן לזיהוי סוג השאלה"}</p>
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
              {isEn ? "Start test" : "התחל"}
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

      <div className="onboarding-nav">
        <button type="button" className="onboarding-nav-btn" onClick={goPrev} disabled={activeIndex <= 0}>
          {isEn ? "Previous" : "הקודם"}
        </button>
        <div className="onboarding-progress">
          {orderedScreens.map(function (screenId, idx) {
            return (
              <span
                key={screenId}
                className={"onboarding-dot" + (idx === activeIndex ? " is-active" : "")}
                onClick={function () { setActiveScreen(screenId); }}
                role="button"
                tabIndex={0}
                aria-label={(isEn ? "Go to screen " : "מעבר למסך ") + (idx + 1)}
              />
            );
          })}
        </div>
        <button type="button" className="onboarding-nav-btn" onClick={goNext} disabled={activeIndex >= orderedScreens.length - 1}>
          {isEn ? "Next" : "הבא"}
        </button>
      </div>
      {tipsOpen ? (
        <div className="onboarding-modal-overlay" role="dialog" aria-modal="true" onClick={function () { setTipsOpen(false); }}>
          <div className="onboarding-modal" onClick={function (e) { e.stopPropagation(); }}>
            <h2 className="onboarding-title">{isEn ? "Tips for smooth flow" : "טיפים חשובים למבחן"}</h2>
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
