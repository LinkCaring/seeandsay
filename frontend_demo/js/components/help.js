function Help({ lang }) {
  const isEn = lang === "en";

  return (
    <div className="content-area">
      <div className="help-layout">
        <header className="help-hero">
          <span className="kicker">{isEn ? "Quick help" : "עזרה מהירה"}</span>
          <h1>
            {isEn
              ? "Everything you need for a smooth, successful learning session"
              : "כל מה שצריך כדי להוביל מפגש למידה מוצלח"}
          </h1>
          <p>
            {isEn
              ? "A short checklist and tips for each screen—take a moment before starting so the next steps feel easy and clear."
              : "אספנו עבורכם את ההנחיות והתובנות החשובות מכל מסך. עצרו לרגע לפני תחילת המפגש כדי לוודא שכל הצעדים הבאים ברורים ונוחים."}
          </p>
        </header>

        <div className="help-grid">
          <article className="help-card">
            <h2>{isEn ? "Before you start" : "לפני שמתחילים"}</h2>
            <ul className="help-list">
              <li>{isEn ? "Pick a calm, quiet place with good lighting." : "קבעו עם הילד מקום שקט ונעים עם תאורה טובה."}</li>
              <li>{isEn ? "Check the microphone—skip if the child isn’t ready." : "בדקו שהמיקרופון פועל – אפשר תמיד לדלג אם הילד אינו מוכן."}</li>
              <li>{isEn ? "Use good speakers/headphones for clear audio." : "הכינו אוזניות או רמקולים איכותיים לתקשורת צלולה."}</li>
            </ul>
          </article>

          <article className="help-card">
            <h2>{isEn ? "How a question works" : "מהלך שאלה"}</h2>
            <ul className="help-list">
              <li>{isEn ? "Read the question out loud and listen to the response." : "קראו בקול את השאלה והקשיבו לתגובה של הילד."}</li>
              <li>{isEn ? "Choose the correct image—fireworks celebrate success." : "בחרו יחד את התמונה הנכונה – האפקט החגיגי יעיד על הצלחה."}</li>
              <li>{isEn ? "Some questions require multiple or ordered answers—follow the on-screen instructions." : "תוכלו לבחור מספר תשובות או סדר הופעה כאשר השאלה דורשת זאת. עוקבים אחר ההנחיות שמופיעות על המסך."}</li>
            </ul>
          </article>

          <article className="help-card">
            <h2>{isEn ? "Traffic light evaluation" : "רמזור ההערכה"}</h2>
            <ul className="help-list">
              <li>
                <strong>{isEn ? "Green" : "ירוק"}</strong> — {isEn ? "confident mastery." : "הילד שולט במשימה ובטוח בעצמו."}
              </li>
              <li>
                <strong>{isEn ? "Orange" : "כתום"}</strong> — {isEn ? "revisit soon." : "שווה לחזור שוב במפגש הבא."}
              </li>
              <li>
                <strong>{isEn ? "Red" : "אדום"}</strong> — {isEn ? "pause, explain, and try a different phrasing." : "מומלץ לעצור, להסביר מחדש ולנסות ניסוח אחר."}
              </li>
            </ul>
          </article>

          <article className="help-card">
            <h2>{isEn ? "Recording tips" : "טיפים להקלטה"}</h2>
            <ul className="help-list">
              <li>{isEn ? "Encourage the child to speak clearly toward the screen." : "עזרו לילד לדבר מול המסך והזכירו לו לדבר בקול ברור."}</li>
              <li>{isEn ? "If the child prefers not to record, tap Skip to continue." : "אם הילד מסתייג, לחצו על \"דלג\" כדי להמשיך בנוחות."}</li>
              <li>{isEn ? "You can listen later for monitoring and professional review." : "ניתן להאזין להקלטות בהמשך למעקב והתייעצות עם הצוות המקצועי."}</li>
            </ul>
          </article>
        </div>

        <div className="help-callout">
          <span>
            {isEn
              ? "Need a fresh start? Use the red reset button."
              : "צריכים התחלה חדשה? לחצו על כפתור האיפוס האדום בפינה."}
          </span>
          <span className="stat-chip" data-tone="warning">
            {isEn ? "Clears previous progress" : "מוחק את כל ההתקדמות הקודמת"}
          </span>
        </div>
      </div>
    </div>
  );
}
