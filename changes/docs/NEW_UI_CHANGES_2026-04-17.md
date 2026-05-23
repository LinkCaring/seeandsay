# New UI Changes Log (Starting Apr 17, 2026)

This file documents the new round of requested UI updates starting now.

## Requested Changes

- [x] Make the logo on the welcome page clickable to: `https://www.heb.linkcaring.com/`
- [x] Use stronger traffic-light colors in the evaluation popup during test flow:
  - stronger red
  - stronger orange
  - stronger green
- [x] Apply the same stronger traffic-light colors in welcome flow:
  - screen 3 (question types color demo chips)
  - screen 4 (traffic-light explanation cards)
- [x] Emphasize the question-type icons on welcome screen 3 by circling:
  - comprehension icon
  - expression icon

## Comprehension “A” / mask questions, six-image layout, navbar finish, backend user id

### Comprehension — tap the green region (`A` mask) (`test.js`)

- [x] **Mask answer type** — For the special comprehension format that uses **`A.png`** (with **`.webp`** fallback), the app sets **`answerType` to `"mask"`**, loads the mask into an offscreen **canvas**, and uses **`checkMaskClick`** on image clicks.
- [x] **Green = correct** — Same **green** pixel heuristic on the mask canvas. **Scoring is automatic** (no traffic popup): see **“Comprehension auto-scoring”** below for mask first/second tap and hint behavior.
- [x] **After closing the traffic popup** — **`cancelTrafficPopup`** intentionally **does not** clear **`maskImage` / `maskCanvas`** so mask (“A”) questions **keep working** on further taps; masks are still reset when **leaving** the question (**`goToPreviousQuestion`** / **`loadQuestion`**).

### Six images per question — layout (`test.js` + `css/styles.css`)

- [x] **Grid logic** — Up to **4** images: one row (`gridColumns === count`). More than 4: **two rows**, `gridColumns = ceil(count / 2)`.
- [x] **Dense mode** — When **`currentImageCount > 6`**, **`compactImages`** lowers **`minImgWidth`** so six-tile screens fit better on mobile/desktop.
- [x] **`data-count` on the grid** — The images container passes **`data-count={currentImageCount}`** so CSS can target counts; for **six** choices, **`styles.css`** tightens **`.image-wrapper`** padding (`.images-container[data-count="6"]`) so illustrations read larger while tiles stay aligned with the “paper” card look.

### Navbar — finish control (`navbar.js`)

- [x] **Checkered finish flag** — The **Finish test** control uses a small **inline SVG** (pole + **checkered** flag with stroke) via **`renderFinishFlagSvg`** / **`test-navbar__finish-svg`**, instead of a generic Material “flag” glyph, for clearer meaning and rendering across platforms.

### Backend — numeric user id for demo / FastAPI (`apiToMongo.js` + `test.js`)

- [x] **`apiToMongo.js`** — **`USE_TEMP_RANDOM_BACKEND_USER_ID`** (temporary): FastAPI expects **`userId` as int**; non-numeric demo ids caused **422**. **`getOrCreateTempBackendUserId()`** stores one **random 9-digit** id per **browser tab** in **`sessionStorage`** (fallback: in-memory), and **`resolveBackendUserId()`** substitutes it for **`createUser`** / **`updateUserTests`** while the flag stays on.
- [x] **`test.js` — `ensureInternalUserId()`** — If the learner ID field is empty, a **`demo-…`** string id is generated and persisted for the session UI; the **API layer** still maps to the numeric temp id above when calling the backend.

## Changes since question-type emphasis (`test.js`, `i18n.js`, related)

### Test flow — parent reading (voice) verification

- [x] **Background verification after first “Continue”** — After the reading clip is ready, the user enters the test immediately; `verifySpeaker` runs in the background (`runSpeakerVerificationInBackground`). No blocking “בודקים את הקריאה…” gate on that step.
- [x] **Stale verification ignored** — `readingVerificationGenRef` is bumped on new Continue, retry, and when invalidating verification before “read again”; `performSpeakerVerification` ignores late API results when the generation no longer matches. **`readingVerifyProcessingOwnerGenRef`** avoids leaving `speakerVerificationStatus` stuck on `"processing"` when a run is abandoned.
- [x] **Removed the green “הקריאה אומתה / בואו נתחיל!” screen** — Success is silent in the UI; the user is already in the test after Continue.
- [x] **Safer “Continue” without recording** — If the user has permission but session recording never started, they no longer skip into the test; they get **`test.reading.recordingNotReady`** instead of auto-confirming.
- [x] **No in-test “processing” banner** — While **`speakerVerificationStatus === "processing"`** (reading sample still verifying in the background), the light blue strip under the navbar (**“אימות קול ההורה מעובד ברקע…”** / EN equivalent) is **not rendered** during the question flow. Status and API logic are unchanged; **failed** (warning) and **success** (green) banners under the navbar still show when relevant.

### Finish test — verification gating and UX

- [x] **`completeSession` order fix** — `setImages([])` runs **only after** `ensureSpeakerVerifiedBeforeFinish` passes, so dismissing a “wait for verification” path no longer leaves the **current question images blank** until next/prev.
- [x] **While reading verify is still `"processing"` on Finish** — No `alert`. A **fullscreen overlay** (`blockFinishUntilVerifyOverlay`) blocks interaction; copy uses **`test.finish.verifyOverlayTitle`** / **`test.finish.verifyOverlayBody`**. When verify succeeds, **`pendingCompleteAfterVerifyRef`** + effect calls **`completeSession`** automatically.
- [x] **If verify fails during that overlay** — Effect sends the user to the **read-again** flow (same invalidation as manual re-sample), without the old “no server” screen.
- [x] **Re-read after Finish was blocked (`mustFinishVerification`)** — When a pending results snapshot exists, **Continue** **awaits** `performSpeakerVerification` so the user is not dropped back onto questions until verify completes; on success, session recording is resumed and **`completeSession(pr)`** runs.
- [x] **Read-again banner copy** — Single string **`test.reading.finishGateBody`** (HE/EN) explains verify-in-background → summary if OK, else read again.

### Removed “אין חיבור לשרת” / continue-without-server path

- [x] **API `null` / errors no longer open the “no backend” card** — `performSpeakerVerification` sets **`readingValidationResult(false)`** and clears **`readingRecordingBlob`** where needed so the UI never hits `(result === null && blob !== null)` for that modal.
- [x] **That modal and “המשך ללא שרת” are removed** from the voice step; failures use the same **read again / invalid-style** screen as a bad reading (plus dev skip where applicable).

### React state timing (finish / combine audio)

- [x] **`verificationAudioBlobRef` + `speakerVerificationStatusRef`** — Updated in sync with the corresponding `useState` setters (especially inside **`performSpeakerVerification`**). **`ensureSpeakerVerifiedBeforeFinish`**, the **finish overlay auto-complete** effect, and **MP3 combine** in **`completeSession`** read these refs so **`completeSession` immediately after `await performSpeakerVerification`** does not see stale `verificationAudioBlob` / status and get stuck between flows.

### i18n (`i18n.js`)

- [x] **`test.reading.recordingNotReady`**, **`test.finish.verifyPending`** (still available if reused), **`test.finish.verifyOverlayTitle`**, **`test.finish.verifyOverlayBody`**, **`test.reading.finishGateBody`**.

## Comprehension auto-scoring (no traffic popup) + expression hint rules + incomplete finish (`test.js`, `i18n.js`)

### Comprehension — no parent traffic-light step

- [x] **Traffic popup is not used for comprehension** — Answers are scored automatically from taps; **`showContinue` no longer opens the popup for `questionType === "C"`** (effect only opens it when **`showContinue && questionType === "E"`**). Comprehension never relies on **`showContinue`** for grading.
- [x] **Advance after score** — **`finalizeComprehensionResult`** / **`finalizeComprehensionSuccess`** call **`handleContinue`** with **`success` / `partial` / `failure`** (same bucket strings as before: correct / partly / wrong). **Success** waits **~2.4s** after confetti before advancing so the animation can finish.

### Per-format comprehension rules (`handleClick`, `answerType`)

- [x] **Mask (`answer === "A"`)** — First correct tap with **no hint** → **correct** (confetti). First **non-green** tap → second chance (hint auto-opens only if not already open); second tap **green** → **partly**; second tap **not green** → **wrong**. If the **hint was opened first**, first **green** → **partly**; first **non-green** still gets the **same second chance** (not instant **wrong**); only **two non-greens** ends **wrong**.
- [x] **Single (one correct image)** — First correct with **no hint** → **correct**. First **wrong** → hint auto + one retry (or retry only if hint was already open); second **correct** → **partly**; second **wrong** → **wrong**. If **hint was opened first**, first **correct** → **partly**; first **wrong** → **same one retry** as the no-hint path (not instant **wrong**).
- [x] **Multi (comma / `|min`)** — **`x` = `correctTargetCount`** (min correct picks). Tracks **wrong taps**. After **`x`** attempts without a full pass, **hint** auto-opens if not already open. **Still incomplete after `x+1` attempts** → **wrong**. **Correct**: **correct** only with **no hint**, **no wrong taps**, and **exactly `x` taps**; otherwise **partly** when all correct is reached on or before the **`x+1`**-th tap (with hint and/or wrong taps).
- [x] **Ordered (exactly two steps, e.g. cat→dog)** — **Perfect order with no hint** → **correct** (confetti). **Any hint** (bulb at any time) caps a perfect order at **partly**. **Wrong first image** (e.g. dog first) → **hint auto**. **Same wrong image twice** (dog, dog) → **wrong** immediately. **Wrong pair** (e.g. dog then cat) → **hint** + **one rescue tap** on the **correct second** image; correct → **partly**, wrong → **wrong**. **Correct first image twice** (cat, cat) → **hint** + same **one rescue** on the **second** image. **Questions with more than two ordered picks** keep a simpler legacy path (full sequence must match; hint anywhere → at best partly).
- [x] **Two-image single comprehension** (not `A`, not multi, not ordered; **exactly two** images; normal **single** answer) — **One tap only**: correct with **no hint** → **correct**; correct **after** a hint → **partly**; **wrong** → **wrong** (no second tap / no retry).

### Expression — traffic popup when a hint was used

- [x] If **`hintWasUsedThisQuestion`** is true on an **expression** question, the traffic popup **omits the green “Succeeded” option**; only **partial** and **did not succeed** remain. Hint toggles call **`registerHintOpened()`** when opening the hint (comprehension + expression).

### Finish / last question — not every question answered

- [x] **`handleContinue`** on the **last** question calls **`completeSession`** only if the **number of unique answered question numbers** (deduped **`questionResults`**) **≥ total questions**; otherwise **`incompleteSummaryConfirmOpen`** shows a **confirm dialog** (stay vs finish anyway).
- [x] **Navbar Finish** uses **`requestFinishTest()`** instead of calling **`completeSession`** directly — same incomplete check before summary.
- [x] **Strings** — **`test.incompleteSummary.*`** in **`i18n.js`** (HE/EN).

## Notes

- Scope is currently `frontend_demo` (including `test.js`, `welcome.js`, `navbar.js`, `apiToMongo.js`, `css/styles.css`, `i18n.js` as listed above).
- This log can be extended with validation notes and follow-up polish items in the next steps.
