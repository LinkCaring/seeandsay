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
            "app.reset.body": "נמחק את כל הנתונים וההתקדמות במשחק הזה. להמשיך?",
            "app.reset.yes": "כן, לאפס",
            "app.reset.no": "ביטול",
            "app.startResume.title": "יש התקדמות שמורה",
            "app.startResume.body": "לא סיימתם את המשחק האחרון. להמשיך מאותה נקודה או להתחיל משחק חדש?",
            "app.startResume.continue": "להמשיך",
            "app.startResume.newRun": "משחק חדש",
            "app.brandAlt": "מיל\"י (MILI)",
            "app.lang.he": "עב",
            "app.lang.en": "EN",

            "nav.home": "בית",
            "nav.test": "משחק",
            "nav.help": "עזרה",
            "nav.home.aria": "דף הבית",
            "nav.test.aria": "מסך המשחק",
            "nav.help.aria": "מסך עזרה",

            "test.progress": "שאלה {current} מתוך {total}",
            "test.questionOf": "שאלה {current} מתוך {total}",
            "test.trafficLight.aria": "רמזור הערכה",
            "test.evaluate.label": "משוב",
            "test.trafficLight.green": "ירוק",
            "test.trafficLight.orange": "כתום",
            "test.trafficLight.red": "אדום",
            "test.trafficPopup.title": "איך הייתה התשובה?",
            "test.trafficPopup.subtitle": "בחרו צבע כדי להמשיך לשאלה הבאה",
            "test.trafficPopup.green.title": "בדיוק",
            "test.trafficPopup.green.desc": "ענה נכון ובביטחון",
            "test.trafficPopup.orange.title": "כמעט",
            "test.trafficPopup.orange.desc": "ענה נכון עם עזרה",
            "test.trafficPopup.midFailure.title": "יודע אבל לא אומר עכשיו",
            "test.trafficPopup.red.title": "עדיין לא שם",
            "test.trafficPopup.red.desc": "לא הצליח / צריך תרגול",
            "test.trafficPopup.examplePrefix": "לדוגמה:",
            "test.trafficPopup.back": "↪️ חזור",
            "test.trafficPopup.backAria": "חזרה לשאלה",

            "test.incompleteSummary.title": "לא כל השאלות נענו",
            "test.incompleteSummary.body": "עדיין לא סיימתם לענות על כל השאלות. להמשיך למסך הסיכום בכל זאת?",
            "test.incompleteSummary.stay": "המשיכו במשחק",
            "test.incompleteSummary.finish": "סיום ומעבר לסיכום",

            "test.paused.title": "⏸️ אתם עוד פה?",
            "test.paused.body": "עצרנו את ההקלטה.",
            "test.paused.cta": "▶️ להמשיך",
            "test.pause": "⏸️ השהה",
            "test.resume": "▶️ המשך",

            "test.afk.title": "⚠️ עדיין פה איתנו?",
            "test.afk.body": "לא זיהינו לחיצות כבר 5 דקות. בעוד דקה נשהה את המשחק אוטומטית — לחצו למטה רק כדי שנדע שאתם כאן ונמשיך בכיף!",
            "test.afk.cta": "כן, אנחנו פה!",

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
            "test.start.childName": "שם הילד/ה",
            "test.start.dob": "תאריך לידה",
            "test.start.gender.placeholder": "מגדר",
            "test.start.gender.female": "נקבה",
            "test.start.gender.male": "זכר",
            "test.start.parentPhone": "טלפון נייד- לשליחת המשוב בסיום",
            "test.start.recordingConsent": "נשתמש במיקרופון כדי להקליט תשובות קצרות - אפשר לעצור בכל רגע",
            "test.start.privacyTermsPrefix": "בהמשך, אני מאשר/ת כי קראתי והסכמתי ל",
            "test.start.privacyPolicyLink": "מדיניות הפרטיות",
            "test.start.termsOfUseLink": "תנאי השימוש",
            "test.start.and": "ול",
            "test.start.legalConfirmation": "אני מסכים/ה ל",
            "test.start.invalidName": "נא להזין שם ילד/ה.",
            "test.start.invalidGender": "נא לבחור מגדר.",
            "test.start.invalidConsent": "יש לאשר הקלטה כדי להמשיך.",
            "test.start.invalidLegal": "יש לאשר את מדיניות הפרטיות ותנאי השימוש כדי להמשיך.",
            "test.cta.continue": "המשך",
            "test.age.invalid": "מצטערים, הגיל הזה לא מתאים.",
            "test.age.invalidInput": "נא להזין גיל תקין (חודשים 0–11).",
            "test.age.invalidId": "נא להזין מספר תעודת זהות תקין (9 ספרות)",

            "test.mic.title": "הרשאת מיקרופון",
            "test.mic.body": "במשחק יש שאלות עם הקלטה קצרה. נא לאפשר גישה למיקרופון.",
            "test.mic.allow": "אפשר מיקרופון",
            "test.mic.skip": "דלג (ללא הקלטה)",
            "test.mic.unsupported": "הדפדפן אינו תומך בהקלטה (MediaRecorder).",
            "test.mic.deniedInline": "נדרשת הרשאת מיקרופון כדי להמשיך. יש לאשר גישה למיקרופון בהגדרות הדפדפן ולנסות שוב.",
            "test.mic.check.title": "בדיקת מיקרופון",
            "test.mic.check.body": "בקשו מהילד לדבר בקול רגיל למשך כמה שניות.",
            "test.mic.check.target": "טווח עוצמה מומלץ להתחלה",
            "test.mic.check.start": "התחל בדיקה",
            "test.mic.check.done": "העוצמה תקינה, אפשר להתחיל.",
            "test.mic.check.continue": "התחל משחק",
            "test.mic.check.audioNotReady": "לא הצלחנו להפעיל את האזנה. נא ללחוץ שוב על \"התחל בדיקה\".",
            "test.rec.interrupted.title": "ההקלטה נפסקה",
            "test.rec.interrupted.body": "שיחה, יציאה מהאפליקציה או הרשאת מיקרופון שינו את ההקלטה. אפשר להמשיך במשחק, אבל חלק מהשמע עלול להיות חסר.",
            "test.rec.interrupted.dismiss": "הבנתי",
            "test.incremental.interrupted.title": "ההקלטה לשאלה זו נפסקה",
            "test.incremental.interrupted.body": "שיחה או שינוי הרשאת מיקרופון עצרו את ההקלטה לשאלה הנוכחית. אפשר להקליט מחדש רק את השאלה הזו לפני שהתשובה נשלחה לשרת.",
            "test.incremental.interrupted.uploadInFlight": "התשובה לשאלה זו עדיין נשלחת. אפשר לנסות שוב בעוד רגע, או להמתין לסיום השליחה.",
            "test.incremental.interrupted.alreadySent": "התשובה לשאלה זו כבר נשלחה לשרת ולא ניתן להקליט אותה מחדש. אפשר להמשיך בשאלות הבאות.",
            "test.incremental.interrupted.restart": "הקליטו שוב את השאלה",
            "test.incremental.interrupted.restartRequired": "יש להקליט מחדש את השאלה כדי להמשיך. לא ניתן לדלג על שלב זה.",
            "test.incremental.interrupted.micDisabled": "כדי להקליט מחדש, הפעילו שוב את המיקרופון בהגדרות הדפדפן. כשהמיקרופון זמין, כפתור ההקלטה יופיע.",
            "test.incremental.interrupted.dismiss": "המשך",
            "test.rec.startFailed": "לא הצלחנו להתחיל הקלטה: {msg}",

            "test.reading.recordingNotReady": "עדיין אין הקלטת קריאה. המתינו שההקלטה תתחיל ונסו שוב.",
            "test.finish.verifyPending": "עדיין מאמתים את דגימת הקריאה. אנא המתינו רגע ונסו שוב לסיים.",
            "test.finish.verifyOverlayTitle": "מאמתים את דגימת הקריאה",
            "test.finish.verifyOverlayBody": "המערכת בודקת את דגימת הקריאה שלכם. כשהאימות יסתיים בהצלחה, נעבור אוטומטית למסך סיכום התוצאות. אם האימות לא יצליח, תתבקשו להקליט קריאה חדשה — בלי לחזור לשאלות המשחק.",
            "test.reading.finishGateBody": "כדי לסיים את המשחק נדרשת דגימת קריאה תקינה של ההורה. לאחר שתקליטו את הקריאה למטה, לחצו על \"המשך\" — נאמת ברקע, ואם הכל תקין תועברו למסך הסיכום. אם לא, תוכלו לנסות לקרוא שוב.",

            "test.reading.validating": "בודקים את הקריאה...",
            "test.reading.wait": "אנא המתינו בזמן שאנחנו מאמתים את הקריאה.",
            "test.reading.valid": "הקריאה אומתה",
            "test.reading.validMsg": "✅ הקריאה אומתה בהצלחה!",
            "test.reading.toTest": "בואו נתחיל!",
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
            "app.reset.body": "We’ll clear all data and progress for this game. Continue?",
            "app.reset.yes": "Yes, reset",
            "app.reset.no": "Cancel",
            "app.startResume.title": "Saved progress",
            "app.startResume.body": "You have a game that isn’t finished yet. Continue where you left off, or start a new game?",
            "app.startResume.continue": "Continue",
            "app.startResume.newRun": "New game",
            "app.brandAlt": "MILI",
            "app.lang.he": "עב",
            "app.lang.en": "EN",

            "nav.home": "Home",
            "nav.test": "Game",
            "nav.help": "Help",
            "nav.home.aria": "Home page",
            "nav.test.aria": "Game screen",
            "nav.help.aria": "Help screen",

            "test.progress": "Question {current} of {total}",
            "test.questionOf": "Question {current} of {total}",
            "test.trafficLight.aria": "Traffic light evaluation",
            "test.evaluate.label": "Evaluate",
            "test.trafficLight.green": "Green",
            "test.trafficLight.orange": "Orange",
            "test.trafficLight.red": "Red",
            "test.trafficPopup.title": "How was the answer?",
            "test.trafficPopup.subtitle": "Choose a color to continue",
            "test.trafficPopup.green.title": "Exact",
            "test.trafficPopup.green.desc": "Correct and confident",
            "test.trafficPopup.orange.title": "Almost",
            "test.trafficPopup.orange.desc": "Correct with help",
            "test.trafficPopup.midFailure.title": "Knows but not saying now",
            "test.trafficPopup.red.title": "Not there yet",
            "test.trafficPopup.red.desc": "Not correct / needs practice",
            "test.trafficPopup.examplePrefix": "For example:",
            "test.trafficPopup.back": "↪️ Back",
            "test.trafficPopup.backAria": "Back to question",

            "test.incompleteSummary.title": "Not all questions answered",
            "test.incompleteSummary.body": "You have not answered every question yet. Do you still want to go to the results summary?",
            "test.incompleteSummary.stay": "Keep playing",
            "test.incompleteSummary.finish": "Finish and view summary",

            "test.paused.title": "⏸️ Still here?",
            "test.paused.body": "We paused recording — take a breath! Tap below when you’re ready to keep playing.",
            "test.paused.cta": "▶️ Keep playing",
            "test.pause": "⏸️ Pause",
            "test.resume": "▶️ Resume",

            "test.afk.title": "⚠️ Still with us?",
            "test.afk.body": "We haven’t seen a tap for 5 minutes. We’ll pause the game automatically in one minute unless you press below — just letting us know you’re here keeps the fun going!",
            "test.afk.cta": "Yes, we’re here!",

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
            "test.start.childName": "Child name",
            "test.start.dob": "Date of birth",
            "test.start.gender.placeholder": "Gender",
            "test.start.gender.female": "Female",
            "test.start.gender.male": "Male",
            "test.start.parentPhone": "Mobile phone — feedback SMS when done",
            "test.start.recordingConsent": "I consent to recording throughout the questionnaire.",
            "test.start.privacyTermsPrefix": "By continuing, you confirm that you agree to the",
            "test.start.privacyPolicyLink": "privacy policy",
            "test.start.termsOfUseLink": "terms of use",
            "test.start.and": "and",
            "test.start.legalConfirmation": "I confirm continuing according to the",
            "test.start.invalidName": "Please enter the child's name.",
            "test.start.invalidGender": "Please select a gender.",
            "test.start.invalidConsent": "Recording consent is required to continue.",
            "test.start.invalidLegal": "Please confirm the privacy policy and terms of use to continue.",
            "test.cta.continue": "Continue",
            "test.age.invalid": "Sorry, this age does not fit.",
            "test.age.invalidInput": "Please enter a valid age (months 0–11).",
            "test.age.invalidId": "Please enter a valid ID number (9 digits).",

            "test.mic.title": "Microphone permission",
            "test.mic.body": "This game includes questions with short recordings. Please allow microphone access.",
            "test.mic.allow": "Allow microphone",
            "test.mic.skip": "Skip (no recording)",
            "test.mic.unsupported": "The MediaRecorder API is not supported in your browser.",
            "test.mic.deniedInline": "Microphone permission is required to continue. Please allow microphone access in the browser and try again.",
            "test.mic.check.title": "Microphone check",
            "test.mic.check.body": "Ask the child to speak in a normal voice for a few seconds.",
            "test.mic.check.target": "Recommended loudness range",
            "test.mic.check.start": "Start check",
            "test.mic.check.done": "Great, the level is good enough to start.",
            "test.mic.check.continue": "Start game",
            "test.mic.check.audioNotReady": 'Could not start listening. Please tap "Start check" again.',
            "test.rec.interrupted.title": "Recording stopped",
            "test.rec.interrupted.body": "A call, leaving the app, or a microphone change may have interrupted recording. You can keep playing, but part of the audio may be missing.",
            "test.rec.interrupted.dismiss": "Got it",
            "test.incremental.interrupted.title": "Recording for this question stopped",
            "test.incremental.interrupted.body": "A call or microphone change stopped capture for this question. You can re-record only this question before it is sent to the server.",
            "test.incremental.interrupted.uploadInFlight": "This answer is still uploading. Try again in a moment, or wait for the upload to finish.",
            "test.incremental.interrupted.alreadySent": "This answer was already sent to the server and cannot be re-recorded. You can continue with the next questions.",
            "test.incremental.interrupted.restart": "Re-record this question",
            "test.incremental.interrupted.restartRequired": "You must re-record this question to continue. You cannot skip this step.",
            "test.incremental.interrupted.micDisabled": "To re-record, turn the microphone back on in your browser settings. The re-record button will appear when the mic is available.",
            "test.incremental.interrupted.dismiss": "Continue",
            "test.rec.startFailed": "Failed to start recording: {msg}",

            "test.reading.recordingNotReady": "There is no reading recording yet. Wait for recording to start, then try again.",
            "test.finish.verifyPending": "Your reading sample is still being verified. Please wait a moment and try finishing again.",
            "test.finish.verifyOverlayTitle": "Verifying your reading sample",
            "test.finish.verifyOverlayBody": "We are verifying your parent reading clip. When verification succeeds, you will be taken to the results summary automatically. If it does not succeed, you will be asked to record a new reading — without going back through the game questions.",
            "test.reading.finishGateBody": "To finish the game we need a valid parent reading sample. After you record the sentence below, tap Continue — we verify in the background, and if all is well you will go to the results summary. If not, you can try reading again.",

            "test.reading.validating": "Validating reading...",
            "test.reading.wait": "Please wait while we verify your reading.",
            "test.reading.valid": "Reading validated",
            "test.reading.validMsg": "✅ Your reading has been validated successfully!",
            "test.reading.toTest": "let's start!",
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


