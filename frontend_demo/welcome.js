function Welcome({ lang, setPage }) {
  const isEn = lang === "en";
  const orderedScreens = ["screen1", "screen2", "screen3", "screen4"];
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
          <div className="onboarding-hero-box">
            <h1 className="onboarding-hero-box__title">{isEn ? "Walking in Language" : "צועדים בשפה"}</h1>
            <p className="onboarding-hero-box__subtitle">
              {isEn
                ? "A quick language check for your child's development"
                : "בדיקה עצמית קצרה להתפתחות השפה של ילדכם"}
            </p>
          </div>

          <div className="onboarding-card onboarding-card--overview">
            <div className="onboarding-list-row">
              <span className="material-symbols-outlined onboarding-list-row__icon">checklist</span>
              <span>{isEn ? "Short age-based questions" : "שאלות קצרות לפי גיל הילד"}</span>
            </div>
            <div className="onboarding-list-row">
              <span className="material-symbols-outlined onboarding-list-row__icon">home</span>
              <span>{isEn ? "Focus on understanding and expression" : "עונים לפי מה שרואים ושומעים בבית"}</span>
            </div>
            <div className="onboarding-list-row">
              <span className="material-symbols-outlined onboarding-list-row__icon">lightbulb</span>
              <span>{isEn ? "Get an initial language profile" : "מקבלים תמונה ראשונית של רמת השפה"}</span>
            </div>
            <div className="onboarding-list-row">
              <span className="material-symbols-outlined onboarding-list-row__icon">task_alt</span>
              <span>{isEn ? "Parental feedback on language skills" : "הערכה שפתית מבוססת על אבחוני שפה רשמיים ומתוקננים"}</span>
            </div>
          </div>

          <p className="onboarding-note">
            {isEn
              ? "* Recording is used for future product improvement only."
              : "* המערכת מקליטה את ההערכה לשם פיתוח וטיוב עתידי. כרגע אין שימוש בהקלטה לצורכי הערכה."}
          </p>
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
              <div className="onboarding-step-card__icon material-symbols-outlined">volume_up</div>
              <div>
                <h3>{isEn ? "Listen to the question" : "שומעים את השאלה"}</h3>
                <p>{isEn ? "The system reads each question. You can replay via the speaker icon." : "המערכת מקריאה את השאלה. ניתן להשתמש שוב בלחיצה על אייקון הרמקול."}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">2</span>
              <div className="onboarding-step-card__icon material-symbols-outlined">hourglass_top</div>
              <div>
                <h3>{isEn ? "Give the child time" : "נותנים לילד לענות"}</h3>
                <p>{isEn ? "Wait for the child's response and allow independent thinking." : "המתינו לתשובת הילד ותנו לו זמן להבין ולנסות לענות לבד."}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">3</span>
              <div className="onboarding-step-card__icon material-symbols-outlined">lightbulb</div>
              <div>
                <h3>{isEn ? "When to use hints?" : "צריכים רמז?"}</h3>
                <p>{isEn ? "Comprehension: use hint only when needed. Expression: compare response with expected style." : "בשאלות הבנה לחצו על רמז רק לקבלת עזרה. בשאלות הבעה לחצו על זכוכית המגדלת להבנת אופי התשובה המצופה."}</p>
              </div>
            </article>
            <article className="onboarding-step-card">
              <span className="onboarding-step-card__badge">4</span>
              <div className="onboarding-step-card__icon material-symbols-outlined">checklist</div>
              <div>
                <h3>{isEn ? "Rate the answer" : "דרגו את התשובה"}</h3>
                <p>{isEn ? "At the end of each question, choose success level via traffic light." : "בסיום כל שאלה דרגו את מידת ההצלחה של הילד בעזרת רמזור התשובות."}</p>
              </div>
            </article>
          </div>
        </section>
      );
    }

    if (activeScreen === "screen3") {
      return (
        <section className="onboarding-screen onboarding-screen--s3">
          <h2 className="onboarding-title">{isEn ? "Question types" : "סוגי שאלות"}</h2>
          <div className="onboarding-types">
            <article className="onboarding-type-card">
              <div className="onboarding-type-card__head onboarding-type-card__head--centered">
                <span className="material-symbols-outlined onboarding-type-title-icon" aria-hidden="true">touch_app</span>
                <h3 className="onboarding-type-card__title">{isEn ? "Comprehension" : "שאלות הבנה"}</h3>
              </div>
              <p>{isEn ? "The child chooses the correct image from available options. The traffic light appears automatically after the choice." : "הילד בוחר את התמונה הנכונה מתוך האפשרויות. הרמזור יופיע אוטומטית לאחר הבחירה"}</p>
            </article>
            <article className="onboarding-type-card onboarding-type-card--alt">
              <div className="onboarding-type-card__head onboarding-type-card__head--centered">
                <span className="material-symbols-outlined onboarding-type-title-icon" aria-hidden="true">mic</span>
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
            <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={function () { setPage("test"); }}>
              {isEn ? "Start test" : "התחל"}
            </button>
          </div>
        </section>
      );
    }
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
