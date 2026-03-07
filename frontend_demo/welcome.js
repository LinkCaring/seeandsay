function Welcome({ lang, setPage }) {
  const isEn = lang === "en";

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const nav = document.querySelector(".landing-nav");
    const header = document.querySelector(".top-header");
    const headerH = header ? header.getBoundingClientRect().height : 85;
    const navH = nav ? nav.getBoundingClientRect().height : 56;
    const offset = headerH + navH;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <div className="landing-page">

      {/* ── Sticky section nav ── */}
      <nav className="landing-nav" aria-label={isEn ? "Sections" : "חלקי הדף"}>
        <button type="button" onClick={() => scrollTo("landing-intro")}>
          {isEn ? "Intro" : "הקדמה"}
        </button>
        <button type="button" onClick={() => scrollTo("landing-how")}>
          {isEn ? "🐰 How it works" : "🐰 איך משחקים?"}
        </button>
        <button type="button" onClick={() => scrollTo("landing-start")}>
          {isEn ? "Start" : "התחלה"}
        </button>
      </nav>

      {/* ── Section 1: Introduction ── */}
      <section id="landing-intro" className="landing-section">
        <div className="landing-section__inner">
          <span className="kicker">
            {isEn ? "Walking in Language" : "צועדים בשפה"}
          </span>

          <div className="intro-textbox">
            {isEn ? (
              <React.Fragment>
                <p>Welcome to <strong>"Walking in Language"</strong> — a brief language assessment that will help you as parents understand how your child comprehends and expresses themselves in language relative to their age.</p>
                <p>The activity is built from a series of images and short comprehension and expression questions that gradually progress by age.</p>
                <p>During the assessment, you will be asked to rate the quality of your child's response based on what you hear and see — this also provides important parental feedback on the quality of the response.</p>
                <p>The language assessment is based on formal and standardized language assessments.</p>
                <p className="intro-textbox__note">* The system records the assessment for future development and improvement purposes. Currently, the recording is not used for the language assessment of the child.</p>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <p>ברוכים הבאים ל<strong>״צועדים בשפה״</strong> — הערכה שפתית קצרה שתעזור לכם כהורים להבין איך ילדכם מבין ומביע את עצמו בשפה ביחס לגילו.</p>
                <p>הפעילות בנויה ממערך תמונות ושאלות הבנה והבעה קצרות המתקדמות בהדרגה לפי גיל.</p>
                <p>במהלך ההערכה תתבקשו לדרג את איכות התשובה של הילד לפי מה שאתם שומעים ורואים — כך מתקבל גם משוב הורי חשוב על איכות התגובה.</p>
                <p>ההערכה השפתית מתבססת על אבחוני שפה פורמלים ומתוקננים.</p>
                <p className="intro-textbox__note">* המערכת מקליטה את ההערכה לשם פיתוח וטיוב עתידי. בתוצאות הערכה כרגע אין שימוש בהקלטה לצורכי הערכה השפתית של הילד.</p>
              </React.Fragment>
            )}
          </div>

          <button className="landing-scroll-btn" type="button" onClick={() => scrollTo("landing-how")}>
            {isEn ? "How does it work? ↓" : "איך זה עובד? ↓"}
          </button>
        </div>
      </section>

      {/* ── Section 2: How to use ── */}
      <section id="landing-how" className="landing-section landing-section--alt">
        <div className="landing-section__inner">
          <span className="kicker">{isEn ? "🐰 How it works" : "🐰 איך משחקים?"}</span>

          {/* Setup tips */}
          <div className="intro-textbox how-tips-box">
            <ul className="how-tips-list">
              <li>{isEn
                ? "Sit in a quiet place without distractions, with the child facing the screen."
                : "מומלץ לשבת במקום שקט, ללא מסיחים, עם הילד מול המסך."}</li>
              <li>{isEn
                ? "Make sure the device has proper sound and that you have approved microphone permissions."
                : <React.Fragment>ודאו שהמכשיר עם <strong>שמע תקין</strong>, ושאישרתם הרשאות <strong>מיקרופון</strong>.</React.Fragment>}</li>
            </ul>
          </div>

          {/* 4 Steps */}
          <h2 className="landing-section-title">
            {isEn ? "How it works — 4 simple steps" : "איך זה עובד בכל שאלה — 4 שלבים פשוטים"}
          </h2>

          <div className="landing-how-grid">
            <div className="landing-how-card">
              <div className="landing-how-card__num">1</div>
              <h3>{isEn ? "Listen to the question 🔊" : "שומעים את השאלה 🔊"}</h3>
              <p>{isEn
                ? "The system reads the question aloud at the start. Tap the speaker icon to replay it anytime."
                : "המערכת תבצע הקראה של השאלה בתחילת כל שאלה. ניתן לחזור על ההקראה בלחיצה על אייקון הרמקול."}</p>
            </div>
            <div className="landing-how-card">
              <div className="landing-how-card__num">2</div>
              <h3>{isEn ? "Give the child time to answer" : "נותנים לילד זמן לענות"}</h3>
              <p>{isEn
                ? "Wait for the child's response and give them time to understand and try to answer on their own."
                : "המתינו לתשובת הילד, ותנו לו זמן להבין ולנסות לענות לבד."}</p>
            </div>
            <div className="landing-how-card">
              <div className="landing-how-card__num">3</div>
              <h3>{isEn ? "Two question types" : "שני סוגי שאלות"}</h3>
              <p>{isEn
                ? <React.Fragment><strong>Comprehension:</strong> If the child struggles, use the 🧰 for hint.<br/><strong>Expression:</strong> The system will show you 🔍 guidance on the nature of the "correct" response expected from the child.</React.Fragment>
                : <React.Fragment><strong>הבנה:</strong> אם הילד מתקשה — לחצו על 🧰 לרמז.<br/><strong>הבעה:</strong> המערכת תציג לכם 🔍 הכוונה לאופי התשובה ״הנכונה״ המצופה מהילד.</React.Fragment>}</p>
            </div>
            <div className="landing-how-card">
              <div className="landing-how-card__num">4</div>
              <h3>{isEn ? "Give parental feedback" : "נותנים משוב הורי"}</h3>
              <p>{isEn
                ? "At the end of each question, rate how well the child answered using the traffic light."
                : "בסוף כל שאלה תתבקשו לדרג את מידת ההצלחה של הילד/ה בעזרת רמזור התשובות."}</p>
            </div>
          </div>

          {/* Traffic light legend */}
          <div className="intro-textbox how-traffic-box">
            <h3 className="how-traffic-title">
              {isEn ? "Traffic light — how to rate the answer" : "רמזור תשובה — איך מדרגים את התשובה"}
            </h3>
            <ul className="how-traffic-list">
              <li>
                🟢 <strong>{isEn ? "Succeeded easily" : "הצליח בקלות"}</strong>
                {" — "}{isEn
                  ? "The child answered immediately and without hesitation."
                  : "הילד הצביע/ענה מיד וללא התלבטות."}
              </li>
              <li>
                🟡 <strong>{isEn ? "Partially succeeded" : "הצליח חלקית"}</strong>
                {" — "}{isEn
                  ? "Succeeded with a hint or guidance, then answered correctly."
                  : "הצליח עם עזרה/רמז, או אחרי הכוונה ואז ענה נכון."}
              </li>
              <li>
                🔴 <strong>{isEn ? "Did not succeed" : "לא הצליח"}</strong>
                {" — "}{isEn
                  ? "The child did not answer or point correctly."
                  : "הילד לא הצביע/ענה נכון."}
              </li>
            </ul>
            <p className="intro-textbox__note">
              {isEn
                ? "Let the child answer at their own pace, and use hints only when needed. The goal is a natural and reliable picture of the child's language abilities."
                : "תנו לילד לענות בקצב שלו, והשתמשו ברמז רק כשצריך. המטרה היא לקבל תמונה טבעית ואמינה ליכולות השפה של הילד."}
            </p>
          </div>

          <button className="landing-scroll-btn" type="button" onClick={() => scrollTo("landing-start")}>
            {isEn ? "Ready to start? ↓" : "מוכנים? ↓"}
          </button>
        </div>
      </section>

      {/* ── Section 3: Start Test ── */}
      <section id="landing-start" className="landing-section landing-section--start">
        <div className="landing-section__inner landing-start-inner">
          <span className="kicker">{isEn ? "Let's go!" : "מוכנים!"}</span>
          <h2 className="landing-section-title">
            {isEn ? "Begin your session" : "התחילו את המפגש"}
          </h2>
          <div className="landing-rotate-hint">
            <span className="landing-rotate-icon">📱↔️</span>
            <span>
              {isEn
                ? "Rotate your device to landscape for the best experience"
                : "סובבו את המכשיר לאופקי (מאוזן) לחוויה הטובה ביותר"}
            </span>
          </div>

          <button
            className="landing-cta-btn"
            type="button"
            onClick={() => setPage("test")}
          >
            {isEn ? "🚀 Start Assessment" : "🚀 התחל הערכה"}
          </button>
        </div>
      </section>

      {/* Spacer — continues the Start section background and gives scroll room */}
      <div style={{ height: "260px", flexShrink: 0, background: "linear-gradient(135deg, rgba(102, 0, 255, 0.06), rgba(66, 171, 199, 0.08))" }} aria-hidden="true" />
    </div>
  );
}
