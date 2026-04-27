function Help() {
  return (
    <div className="content-area">
      <div className="help-layout">
        <header className="help-hero">
          <span className="kicker">עזרה מהירה</span>
          <h1>כל מה שצריך כדי להוביל מפגש למידה מוצלח</h1>
          <p>
            אספנו עבורכם את ההנחיות והתובנות החשובות מכל מסך. עצרו לרגע לפני תחילת המפגש כדי
            לוודא שכל הצעדים הבאים ברורים ונוחים.
          </p>
        </header>

        <div className="help-grid">
          <article className="help-card">
            <h2>לפני שמתחילים</h2>
            <ul className="help-list">
              <li>קבעו עם הילד מקום שקט ונעים עם תאורה טובה.</li>
              <li>בדקו שהמיקרופון פועל – אפשר תמיד לדלג אם הילד אינו מוכן.</li>
              <li>הכינו אוזניות או רמקולים איכותיים לתקשורת צלולה.</li>
            </ul>
          </article>

          <article className="help-card">
            <h2>מהלך שאלה</h2>
            <ul className="help-list">
              <li>קראו בקול את השאלה והקשיבו לתגובה של הילד.</li>
              <li>בחרו יחד את התמונה הנכונה – האפקט החגיגי יעיד על הצלחה.</li>
              <li>
                תוכלו לבחור מספר תשובות או סדר הופעה כאשר השאלה דורשת זאת. עוקבים אחר
                ההנחיות שמופיעות על המסך.
              </li>
            </ul>
          </article>

          <article className="help-card">
            <h2>רמזור ההערכה</h2>
            <ul className="help-list">
              <li>
                <strong>ירוק</strong> – הילד שולט במשימה ובטוח בעצמו.
              </li>
              <li>
                <strong>כתום</strong> – שווה לחזור שוב במפגש הבא.
              </li>
              <li>
                <strong>אדום</strong> – מומלץ לעצור, להסביר מחדש ולנסות ניסוח אחר.
              </li>
            </ul>
          </article>

          <article className="help-card">
            <h2>טיפים להקלטה</h2>
            <ul className="help-list">
              <li>עזרו לילד לדבר מול המסך והזכירו לו לדבר בקול ברור.</li>
              <li>אם הילד מסתייג, לחצו על "דלג" כדי להמשיך בנוחות.</li>
              <li>ניתן להאזין להקלטות בהמשך למעקב והתייעצות עם הצוות המקצועי.</li>
            </ul>
          </article>
        </div>

        <div className="help-callout">
          <span>צריכים התחלה חדשה? לחצו על כפתור האיפוס האדום בפינה.</span>
          <span className="stat-chip" data-tone="warning">
            מוחק את כל ההתקדמות הקודמת
          </span>
        </div>
      </div>
    </div>
  );
}
