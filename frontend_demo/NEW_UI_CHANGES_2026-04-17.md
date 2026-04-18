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
- [x] **Green = correct** — A click counts as correct when the sampled pixel is **green** (heuristic: low red/blue, high green — e.g. R under 50, G over 200, B under 50), scaled from the displayed image rect to canvas coordinates. Correct → **`showCorrectFeedback`** (confetti / flow); non-green → **`setShowContinue(true)`** so the traffic-light step still runs like other comprehension questions.
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

## Notes

- Scope is currently `frontend_demo` (including `test.js`, `welcome.js`, `navbar.js`, `apiToMongo.js`, `css/styles.css`, `i18n.js` as listed above).
- This log can be extended with validation notes and follow-up polish items in the next steps.
