function BottomNav({ page, setPage }) {
  return (
    <div className="bottom-nav">
      <button
        type="button"
        className={page === "home" ? "active" : ""}
        onClick={() => setPage("home")}
        aria-current={page === "home" ? "page" : undefined}
        aria-label="דף הבית"
      >
        <span className="icon">🏠</span>
        <span className="label">בית</span>
      </button>

      <button
        type="button"
        className={page === "test" ? "active" : ""}
        onClick={() => setPage("test")}
        aria-current={page === "test" ? "page" : undefined}
        aria-label="מסך מבחן"
      >
        <span className="icon">🧪</span>
        <span className="label">מבחן</span>
      </button>

      <button
        type="button"
        className={page === "help" ? "active" : ""}
        onClick={() => setPage("help")}
        aria-current={page === "help" ? "page" : undefined}
        aria-label="מסך עזרה"
      >
        <span className="icon">💡</span>
        <span className="label">עזרה</span>
      </button>
    </div>
  );
}
