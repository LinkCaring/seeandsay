function Welcome({ lang }) {
  const isEn = lang === "en";
 
  return (
    <div className="welcome-screen">
      <section className="welcome-hero">
        <span className="kicker">See&Say</span>
        <h1>{isEn ? "Playful learning that speaks kids’ language" : "למידה חווייתית שמדברת בשפת הילדים"}</h1>
        <p>
          {isEn
            ? "See&Say builds a game-like journey that strengthens language and expression. Each step adapts to age and confidence—so the session stays simple, accurate, and enjoyable."
            : "See&Say בונה לילד מסע משחקי המחזק את כישורי השפה וההבעה. כל שלב מותאם לגיל, לרמת הוודאות ולתגובה הקולית של הילד – כך שאתם מקבלים תהליך מדויק, קל ונעים."}
        </p>
        <div className="welcome-cta">
          <span className="badge">{isEn ? "Let’s begin" : "בואו נצא לדרך"}</span>
          <span className="stat-chip">{isEn ? "⚡️ Start in the “Test” tab" : "⚡️ התחילו בעמוד \"מבחן\""}</span>
        </div>
      </section>

      <section className="welcome-highlight">
        <article className="welcome-card">
          <h3>{isEn ? "Age-aware flow" : "מסלול מותאם לגיל"}</h3>
          <p>
            {isEn
              ? "Enter the child’s age and move through a guided flow with clear checkpoints and next-step prompts."
              : "הזינו את גיל הילד ותעבדו בתוך מסלול אישי שמתקדם בקצב שלו, עם נקודות בדיקה ברורות והכוונה ליעד הבא."}
          </p>
        </article>

        <article className="welcome-card">
          <h3>{isEn ? "Instant game feedback" : "חוויית משחק מיידית"}</h3>
          <p>
            {isEn
              ? "High-quality images, celebratory fireworks, and clear cues that reward success and encourage repetition."
              : "כל שאלה מציגה תמונות איכותיות, אפקטי \"זיקוקים\" וחיווי ברור שמחזק הצלחות ומעודד התנסות חוזרת."}
          </p>
        </article>

        <article className="welcome-card">
          <h3>{isEn ? "Control & monitoring" : "שליטה וניטור בזמן אמת"}</h3>
          <p>
            {isEn
              ? "Use the traffic-light evaluation and recordings to track progress—review anytime, and reset with one click."
              : "רמזור ההערכה, הקלטות הקול והדו\"חות שומרים עליכם במעקב – בלחיצה אחת תוכלו לחזור אחורה, לסקור ולהתחיל מחדש."}
          </p>
        </article>
      </section>
    </div>
  );
}
