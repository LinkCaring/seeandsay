# PR summary: `frontend_demo` UI / UX (See&Say)

This document summarizes the **demo frontend** work from this iteration: test flow polish, login/start form styling, welcome/onboarding overhaul, typography, icons, and copy alignment. Use it as the PR description or reviewer checklist.

**Primary touched files:** `css/styles.css`, `css/colors.css`, `test.js`, `welcome.js`, `i18n.js`, `index.html`, `loader.js` (plus binary assets under `resources/test_assets/` where applicable).

---

## Login / start form

- **Start form fields** (from earlier iteration): name, gender, date of birth, recording consent, privacy/terms acknowledgment — wired in the UI with validation and bilingual strings in `i18n.js`.
- **Styling**: RTL/LTR-friendly layout and spacing for the pre-test form (`styles.css`).
- **Backend gap list**: deferred API/storage work is documented separately in **`LOGIN_START_BACKEND_NOTES.md`** (not duplicated here in detail).

---

## Global design system

- **Font**: Global `--font-family` set to **Rubik** in `colors.css` so login, welcome, test, evaluation popup, hints, and summary inherit one typeface.
- **Material Symbols**: Linked from `index.html`; navbar and key controls use outlined symbols (`home`, `replay`, `outlined_flag`, `pause_circle` / `play_circle`, `volume_up`, etc.) with shared sizing in `styles.css`.
- **Test page background**: Test flow uses warm off-white **`#F3F0EA`** on `.app-container[data-page="test"]` (iterated from earlier palette options).

---

## Test flow

### Images

- **Image tiles** (`.image-wrapper`): “Paper” look — warm fill (**`#fef2e4`**), border, shadow; hover on wrapper; inner image radius tuned for the tile frame.
- **Loading**: `loader.js` prefers **`.png` first**, then `.webp`; `test.js` fallback chain aligned (png ↔ webp only).

### Question bar

- **Query text** (`.query-text`): Rubik, weight/size/line-height/letter-spacing tuned for friendlier Hebrew; query row styled as a white card with border/shadow.
- **Question-type indicator**: Per question, **comprehension** shows `touch_app`, **expression** shows `mic` (Material), **no circular chip** — icon only beside the query row (`test.js` + `styles.css`).

### Bottom actions (comprehension / expression)

- **Expression row**: Hint vs evaluation order and layout fixed for **portrait mobile** (flex, nowrap, physical placement); larger tap targets; warm frosted bottom strip.
- **Hint**: Warm card styling; hint text can sit above the bulb control; bulb uses **darkened emoji** filter (tuned); wider hint box when text is long.
- **Expected answer** (expression): Warm white card targeting **`.question-expected-answer-above`** (correct class vs old `.expected-answer-box`).

### Feedback & evaluation

- **Correct answer**: Per-image fireworks removed; **full-screen confetti** overlay with configurable feel (`test.js` + `styles.css`).
- **Traffic-light popup**: Top kicker/title/subtitle and gray bar hidden; back control **icon-only**; option labels use query-style font; Hebrew/English titles unified with welcome (see **Copy** below).

### Summary (completion)

- Removed the banner that said the test was completed **without microphone recording** (recording/transcript unavailable) — no longer shown in summary.

### Misc test UX

- Spacing tweaks for **expression, two images** in single column (gap, max width, min image height).
- Navbar reset icon switched to **`replay`** for cleaner glyph rendering.

---

## Welcome / onboarding (`welcome.js` + onboarding CSS)

### Structure

- **Four screens** with prev/next and dots; **screen 3 ↔ 4 content** order adjusted per product flow.
- **Tips**: Opened as a **modal** from screen 4 (not a separate full screen).
- **Screen 1**: Hero box (blue), white title/subtitle, list styling, recording note in **dark** text on blue card area.
- **Screen 2 (“How it works”)**: Step cards with numbered badges; badges **vertically centered** on the **right**, reserved padding so they do not overlap text; **LTR shell** + **RTL text block** so the **Material icon sits on the left** of the Hebrew copy; slightly smaller type on small portrait.
- **Screen 3 (“Question types”)**:
  - Copy aligned to product spec (comprehension vs expression, auto traffic light after choice, parent uses traffic light for expression feedback).
  - **Headlines**: Icon (`touch_app` / `mic`) matches test flow; **centered row**, icon on physical **left**, title **RTL + right-aligned** to reduce empty space.
  - Demo chips for expression reordered: **הצליח** (green) **top** → **הצליח חלקית** → **לא הצליח** (bottom).
  - Removed standalone bold “רמזור” lines and the old circular demo buttons where replaced by title icons + chips.
- **Screen 4**: Traffic-light explanation cards; **Tips** + **Start test** CTAs.

### Tips modal (Hebrew / English)

- Bullet content updated to: quiet place, child’s pace, hints only when needed, sound + mic permissions, natural picture goal (with light emoji prefixes where used).

---

## Copy alignment (Hebrew + English in `i18n` / welcome)

Unified **evaluation** wording with onboarding chips / screen 4:

| Level   | Hebrew (canonical) | English (aligned in UI strings) |
|--------|----------------------|----------------------------------|
| Green  | הצליח               | Succeeded                        |
| Yellow | הצליח חלקית         | Partially succeeded              |
| Red    | לא הצליח            | Did not succeed                  |

- **`i18n.js`**: `test.trafficPopup.green.title`, `orange.title`, and English `red.title` updated to match.
- **`welcome.js`**: Screen 3 chips and screen 4 card titles use the same three phrases.

---

## Files reference (high level)

| Area | Files |
|------|--------|
| Tokens / font | `css/colors.css` |
| All UI rules | `css/styles.css` |
| Test logic, confetti, navbar icons, summary, query row indicator | `test.js` |
| Onboarding screens + tips modal | `welcome.js` |
| Strings for test / nav / forms / popup | `i18n.js` |
| Fonts + Material link | `index.html` |
| Image URL preference | `loader.js` |
| Backend follow-ups (start form) | `LOGIN_START_BACKEND_NOTES.md` |

---

## Notes for reviewers

- **RTL**: Several onboarding fixes use explicit `direction` / physical `left`/`right` where logical properties were ambiguous on small screens.
- **Assets**: Large `resources/test_assets/**` changes may dominate diff size; UI logic changes are mostly in the files above.
- **No backend**: This PR is UI-first; persistence of new start fields remains as in `LOGIN_START_BACKEND_NOTES.md`.

---

*Generated for PR documentation. Adjust section titles or add ticket IDs as needed before merge.*
