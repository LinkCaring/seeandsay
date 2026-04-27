function usePersistentState(key, initialValue) {
  const [state, setState] = React.useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load state for", key, e);
    }
    return initialValue;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save state for", key, e);
    }
  }, [key, state]);

  return [state, setState];
}

function App() {
  const [page, setPage] = usePersistentState("page", "home");
  const [csvLoaded, setCsvLoaded] = React.useState(false);
  const [allQuestions, setAllQuestions] = React.useState([]);

  // Load CSV and start image loading as soon as the site opens
  React.useEffect(() => {
    Papa.parse("resources/query_database.csv", {
      download: true,
      header: true,
      complete: function (res) {
        const questions = res.data || [];
        setAllQuestions(questions);
        setCsvLoaded(true);

        // Start loading ALL images immediately (no priority yet)
        ImageLoader.startLoading(questions, []);
      },
    });
  }, []);

  // Reset all persistent states
  function resetAll() {
    localStorage.removeItem("ageYears");
    localStorage.removeItem("ageMonths");
    localStorage.removeItem("ageConfirmed");
    localStorage.removeItem("ageInvalid");
    localStorage.removeItem("currentIndex");
    localStorage.removeItem("trackProgress");
    localStorage.removeItem("currentLevel");
    localStorage.removeItem("phase");
    localStorage.removeItem("completeMessege");
    localStorage.removeItem("questionType");
    localStorage.removeItem("permission");
    localStorage.removeItem("microphoneSkipped");
    localStorage.removeItem("audioChunks");
    localStorage.removeItem("audioUrl");
    localStorage.removeItem("recPaused");
    localStorage.removeItem("showAdvancedChoice");

    window.location.reload();
  }

  let content;
  if (!csvLoaded) {
    content = React.createElement(
      "div",
      { className: "surface-card", style: { textAlign: "center" } },
      React.createElement("div", { className: "kicker" }, "רגע אחד"),
      React.createElement(
        "p",
        { className: "muted" },
        "אנחנו טוענים את כל השאלות והמשחקים בשבילכם."
      )
    );
  } else if (page === "test") {
    content = React.createElement(Test, { allQuestions: allQuestions });
  } else if (page === "help") {
    content = React.createElement(Help);
  } else {
    content = React.createElement(Welcome);
  }

  return React.createElement(
    "div",
    { className: "app-container" },
    React.createElement("div", { className: "page-content" }, content),
    React.createElement(BottomNav, { page: page, setPage: setPage }),
    React.createElement(
      "button",
      {
        className: "reset-button",
        onClick: resetAll,
      },
      "איפוס"
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
