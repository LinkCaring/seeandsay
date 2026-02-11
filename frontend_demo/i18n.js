// Simple URL-driven i18n for the static demo.
// Usage: ?lang=he | ?lang=en
// Exposes: window.I18N = { getLang, setLang, t, dir, isRTL }

window.I18N = (function () {
    const SUPPORTED = ["he", "en"];
    const DEFAULT_LANG = "he";

    const DICT = {
        he: {
            "app.loading.title": "רגע אחד",
            "app.loading.body": "אנחנו טוענים את כל השאלות והמשחקים בשבילכם.",
            "app.reset": "איפוס",
            "app.reset.confirm": "האם לבצע איפוס? הפעולה תמחק את ההתקדמות.",
            "app.reset.title": "לאפס את ההתקדמות?",
            "app.reset.body": "נמחק את כל הנתונים וההתקדמות במבחן הזה. להמשיך?",
            "app.reset.yes": "כן, לאפס",
            "app.reset.no": "ביטול",
            "app.brandAlt": "לוגו",
            "app.lang.he": "עברית",
            "app.lang.en": "English",

            "nav.home": "בית",
            "nav.test": "מבחן",
            "nav.help": "עזרה",
            "nav.home.aria": "דף הבית",
            "nav.test.aria": "מסך מבחן",
            "nav.help.aria": "מסך עזרה",

            "test.progress": "התקדמות: {current} / {total} שאלות",
            "test.questionOf": "שאלה {current} מתוך {total}",
            "test.trafficLight.aria": "רמזור הערכה",
            "test.trafficLight.green": "ירוק",
            "test.trafficLight.orange": "כתום",
            "test.trafficLight.red": "אדום",
            "test.trafficPopup.title": "איך הייתה התשובה?",
            "test.trafficPopup.subtitle": "בחרו צבע כדי להמשיך לשאלה הבאה",
            "test.trafficPopup.green.title": "מעולה!",
            "test.trafficPopup.green.desc": "ענה נכון ובביטחון",
            "test.trafficPopup.orange.title": "כמעט",
            "test.trafficPopup.orange.desc": "ענה נכון עם עזרה",
            "test.trafficPopup.red.title": "ננסה שוב",
            "test.trafficPopup.red.desc": "לא הצליח / צריך תרגול",
            "test.trafficPopup.back": "↪️ חזור",
            "test.trafficPopup.backAria": "חזרה לשאלה",

            "test.paused.title": "⏸️ בהשהיה",
            "test.paused.body": "המבחן בהשהיה. ההקלטה נעצרה.",
            "test.paused.cta": "▶️ המשך מבחן",
            "test.pause": "⏸️ השהה",
            "test.resume": "▶️ המשך",

            "test.afk.title": "⚠️ אתם עדיין איתנו?",
            "test.afk.body": "לא זיהינו פעילות במשך 5 דקות. המבחן יושהה אוטומטית בעוד דקה אם לא תהיה תגובה.",
            "test.afk.cta": "כן, אני כאן!",

            "test.audio.playing": "🔊 מנגן...",
            "test.audio.replay": "🔊 נגן שוב",
            "test.audio.playQuestion": "🔊 נגן את השאלה",
            "test.audio.playingQuestion": "🔊 מנגן את השאלה...",

            "test.loadingQuestion.title": "טוען שאלה...",
            "test.loadingQuestion.body": "אנא המתינו בזמן שהתמונות נטענות",
            "test.noQuestions": "לא נמצאו שאלות לרמה הנוכחית",

            "test.age.title": "נא להזין גיל ותעודת זהות",
            "test.age.years": "שנים",
            "test.age.months": "חודשים",
            "test.age.id": "תעודת זהות",
            "test.cta.continue": "המשך",
            "test.age.invalid": "מצטערים, הגיל הזה לא מתאים.",
            "test.age.invalidInput": "נא להזין גיל תקין (חודשים 0–11).",
            "test.age.invalidId": "נא להזין מספר תעודת זהות תקין (9 ספרות)",

            "test.mic.title": "הרשאת מיקרופון",
            "test.mic.body": "במבחן יש שאלות הכוללות הקלטה. נא לאפשר גישה למיקרופון.",
            "test.mic.allow": "אפשר מיקרופון",
            "test.mic.skip": "דלג (ללא הקלטה)",
            "test.mic.unsupported": "הדפדפן אינו תומך בהקלטה (MediaRecorder).",
            "test.rec.startFailed": "לא הצלחנו להתחיל הקלטה: {msg}",

            "test.reading.validating": "בודקים את הקריאה...",
            "test.reading.wait": "אנא המתינו בזמן שאנחנו מאמתים את הקריאה.",
            "test.reading.valid": "הקריאה אומתה",
            "test.reading.validMsg": "✅ הקריאה אומתה בהצלחה!",
            "test.reading.toTest": "המשך למבחן",
            "test.reading.invalid": "הקריאה לא זוהתה",
            "test.reading.invalidMsg": "❌ נסו לקרוא את המשפט שוב.",
            "test.reading.tryAgain": "נסה שוב",
            "test.reading.skipDev": "דלג (מצב מפתח)",
            "test.reading.noBackend": "אין חיבור לשרת",
            "test.reading.noBackendMsg": "לא הצלחנו להתחבר לשרת לצורך אימות.",
            "test.reading.continueNoBackend": "המשך ללא שרת",
            "test.reading.tryReadingAgain": "נסה לקרוא שוב",
            "test.reading.title": "זיהוי דובר",
            "test.reading.recording": "מקליט...",
            "test.reading.prompt": "נא לקרוא בקול את המשפט הבא:",
            "test.reading.hint": "לאחר הקריאה, לחצו על \"המשך\" כדי לאמת.",

            "test.done.title": "כל הכבוד!",
            "test.done.body": "הילד ענה {correct} נכון לבד, {partial} נכון בעזרתכם, ו-{wrong} לא נכון.",
            "test.done.total": "סה\"כ שאלות שנענו: {answered} / {total}",
            "test.done.downloadBoth": "📦 הורדת הכל (MP3 + פרטי הקלטה)",
            "test.done.downloadRecording": "📥 הורדת הקלטה בלבד (MP3)",
            "test.done.downloadTimestamps": "📄 הורדת פרטי הקלטה בלבד",

            "test.nav.back": "⬅️ לשאלה קודמת",
            "test.nav.back.aria": "חזרה לשאלה קודמת",

            "dev.off": "כבה מצב מפתח"
        },
        en: {
            "app.loading.title": "One moment",
            "app.loading.body": "We’re loading all questions and games for you.",
            "app.reset": "Reset",
            "app.reset.confirm": "Are you sure? This will clear all progress.",
            "app.reset.title": "Reset progress?",
            "app.reset.body": "We’ll clear all data and progress for this test. Continue?",
            "app.reset.yes": "Yes, reset",
            "app.reset.no": "Cancel",
            "app.brandAlt": "Logo",
            "app.lang.he": "עברית",
            "app.lang.en": "English",

            "nav.home": "Home",
            "nav.test": "Test",
            "nav.help": "Help",
            "nav.home.aria": "Home page",
            "nav.test.aria": "Test screen",
            "nav.help.aria": "Help screen",

            "test.progress": "Progress: {current} / {total} questions",
            "test.questionOf": "Question {current} of {total}",
            "test.trafficLight.aria": "Traffic light evaluation",
            "test.trafficLight.green": "Green",
            "test.trafficLight.orange": "Orange",
            "test.trafficLight.red": "Red",
            "test.trafficPopup.title": "How was the answer?",
            "test.trafficPopup.subtitle": "Choose a color to continue",
            "test.trafficPopup.green.title": "Great!",
            "test.trafficPopup.green.desc": "Correct and confident",
            "test.trafficPopup.orange.title": "Almost",
            "test.trafficPopup.orange.desc": "Correct with help",
            "test.trafficPopup.red.title": "Try again",
            "test.trafficPopup.red.desc": "Not correct / needs practice",
            "test.trafficPopup.back": "↪️ Back",
            "test.trafficPopup.backAria": "Back to question",

            "test.paused.title": "⏸️ Paused",
            "test.paused.body": "The test is paused. Recording stopped.",
            "test.paused.cta": "▶️ Resume test",
            "test.pause": "⏸️ Pause",
            "test.resume": "▶️ Resume",

            "test.afk.title": "⚠️ Are you still there?",
            "test.afk.body": "No activity for 5 minutes. The test will pause automatically in 1 minute if you don't respond.",
            "test.afk.cta": "Yes, I’m here!",

            "test.audio.playing": "🔊 Playing...",
            "test.audio.replay": "🔊 Replay audio",
            "test.audio.playQuestion": "🔊 Play the question",
            "test.audio.playingQuestion": "🔊 Playing the question...",

            "test.loadingQuestion.title": "Loading question...",
            "test.loadingQuestion.body": "Please wait while images load",
            "test.noQuestions": "No questions found for the current level",

            "test.age.title": "Enter age and ID",
            "test.age.years": "Years",
            "test.age.months": "Months",
            "test.age.id": "ID",
            "test.cta.continue": "Continue",
            "test.age.invalid": "Sorry, this age does not fit.",
            "test.age.invalidInput": "Please enter a valid age (months 0–11).",
            "test.age.invalidId": "Please enter a valid ID number (9 digits).",

            "test.mic.title": "Microphone permission",
            "test.mic.body": "This test includes recording questions. Please allow microphone access.",
            "test.mic.allow": "Allow microphone",
            "test.mic.skip": "Skip (no recording)",
            "test.mic.unsupported": "The MediaRecorder API is not supported in your browser.",
            "test.rec.startFailed": "Failed to start recording: {msg}",

            "test.reading.validating": "Validating reading...",
            "test.reading.wait": "Please wait while we verify your reading.",
            "test.reading.valid": "Reading validated",
            "test.reading.validMsg": "✅ Your reading has been validated successfully!",
            "test.reading.toTest": "Continue to test",
            "test.reading.invalid": "Reading not valid",
            "test.reading.invalidMsg": "❌ Please try reading the sentence again.",
            "test.reading.tryAgain": "Try again",
            "test.reading.skipDev": "Skip (dev mode)",
            "test.reading.noBackend": "No backend connection",
            "test.reading.noBackendMsg": "Unable to connect to the backend for validation.",
            "test.reading.continueNoBackend": "Continue without backend",
            "test.reading.tryReadingAgain": "Try reading again",
            "test.reading.title": "Voice identifier",
            "test.reading.recording": "Recording…",
            "test.reading.prompt": "Please read the following sentence out loud:",
            "test.reading.hint": "After reading the sentence, click Continue to validate your reading.",

            "test.done.title": "Congratulations!",
            "test.done.body": "Your child got {correct} correct by themselves, {partial} correct with your help, and {wrong} wrong.",
            "test.done.total": "Total questions answered: {answered} / {total}",
            "test.done.downloadBoth": "📦 Download both (MP3 + timestamps)",
            "test.done.downloadRecording": "📥 Recording only (MP3)",
            "test.done.downloadTimestamps": "📄 Timestamps only",

            "test.nav.back": "⬅️ Previous question",
            "test.nav.back.aria": "Go back to previous question",

            "dev.off": "Turn off dev mode"
        }
    };

    function normalizeLang(lang) {
        if (!lang) return DEFAULT_LANG;
        const clean = String(lang).toLowerCase();
        return SUPPORTED.includes(clean) ? clean : DEFAULT_LANG;
    }

    function getLang() {
        try {
            const p = new URLSearchParams(window.location.search);
            return normalizeLang(p.get("lang"));
        } catch (e) {
            return DEFAULT_LANG;
        }
    }

    function setLang(lang) {
        const next = normalizeLang(lang);
        const url = new URL(window.location.href);
        url.searchParams.set("lang", next);
        window.history.replaceState({}, "", url.toString());
        return next;
    }

    function dir(lang) {
        return normalizeLang(lang) === "he" ? "rtl" : "ltr";
    }

    function isRTL(lang) {
        return dir(lang) === "rtl";
    }

    function t(key, vars) {
        const lang = getLang();
        const table = DICT[lang] || DICT[DEFAULT_LANG];
        let s = table[key] || (DICT[DEFAULT_LANG] && DICT[DEFAULT_LANG][key]) || key;
        if (vars && typeof vars === "object") {
            Object.keys(vars).forEach(function (k) {
                s = s.replaceAll("{" + k + "}", String(vars[k]));
            });
        }
        return s;
    }

    return { getLang, setLang, t, dir, isRTL };
})();


