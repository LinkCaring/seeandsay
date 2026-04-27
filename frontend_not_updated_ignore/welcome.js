function Welcome() {
  return (
    <div className="welcome-screen">
      <section className="welcome-hero">
        <span className="kicker">See&Say</span>
        <h1>למידה חווייתית שמדברת בשפת הילדים</h1>
        <p>
          See&Say בונה לילד מסע משחקי המחזק את כישורי השפה וההבעה.
          כל שלב מותאם לגיל, לרמת הוודאות ולתגובה הקולית של הילד – כך
          שאתם מקבלים תהליך מדויק, קל ונעים.
        </p>
        <div className="welcome-cta">
          <span className="badge">בואו נצא לדרך</span>
          <span className="stat-chip">⚡️ התחילו בעמוד "מבחן"</span>
        </div>
      </section>

      <section className="welcome-highlight">
        <article className="welcome-card">
          <h3>מסלול מותאם לגיל</h3>
          <p>
            הזינו את גיל הילד ותעבדו בתוך מסלול אישי שמתקדם בקצב שלו,
            עם נקודות בדיקה ברורות והכוונה ליעד הבא.
          </p>
        </article>

        <article className="welcome-card">
          <h3>חוויית משחק מיידית</h3>
          <p>
            כל שאלה מציגה תמונות איכותיות, אפקטי "זיקוקים" וחיווי ברור
            שמחזק הצלחות ומעודד התנסות חוזרת.
          </p>
        </article>

        <article className="welcome-card">
          <h3>שליטה וניטור בזמן אמת</h3>
          <p>
            רמזור ההערכה, הקלטות הקול והדו"חות שומרים עליכם במעקב – בלחיצה אחת
            תוכלו לחזור אחורה, לסקור ולהתחיל מחדש.
          </p>
        </article>
      </section>
    </div>
  );
}
