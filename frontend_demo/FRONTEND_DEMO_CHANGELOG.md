# Frontend demo — living changelog

What changed in `frontend_demo`. **Update this file when you ship meaningful UX or flow changes.**

---

## Summary (latest first)

**2026-04-17 — Test: comprehension scoring, hints, completion** — **`test.js`**: Comprehension (**`questionType === "C"`**) no longer uses the **traffic-light popup**; scores are **automatic** by **`answerType`**: **single** (retry + auto-hint unless **two images only** → one tap), **multi** (wrong-tap count, auto-hint at **`x`** attempts, **wrong if still incomplete after `x+1`** taps), **mask `A`** (two green chances; hint-first still gets a second miss before wrong), **ordered** two-step (wrong first → hint; wrong pair or **cat→cat** → one **rescue** tap on correct second; **dog→dog** → wrong; hint anytime → at best **partly** on success). **Expression**: if **hint was used**, traffic popup shows only **partly / wrong** (no green). **Finish**: last question or navbar **Finish** → confirm if not all questions scored; **`waitingForTranscription`** removed — **`updateUserTests`** still runs in background but UI no longer blocks or says “transcript processing”. **`i18n.js`**: **`test.incompleteSummary.*`**. Detail: **`NEW_UI_CHANGES_2026-04-17.md`**.

**2026-04-17 — Welcome** — Two screens only (**מיל"י** / MILI card + “how it works”); S1 title/subtitle/divider/**מיל"י** sizing and **(MILI)** grouping; S2 flat icons (**volume_up**, brown **hourglass_top**), **💡** like test, traffic preview with labels; hourglass **brown** `#6d4c41`. **`styles.css`** onboarding S1/S2 rules.

**2026-04-17 — Test entry & session** — After age/consent: **one mic ask**, skip standalone **mic** + **reading** screens; **continuous recording** when questions load; **finish** without **`VerifySpeaker`** unless a **separate verify clip** exists; **`?skipReading=1`** / **`?skipMic=1`** for local demos. Completion: **MP3** + **detailed results** download only (no combined); relabeled strings in **`i18n.js`**.

---

## Main changes (compact)

1. **Welcome flow** — `orderedScreens`: **`screen1`**, **`screen2`** only; screens 3–4 commented in **`welcome.js`** (restore instructions at bottom of file).

2. **Welcome S1** — Unified **`.onboarding-s1-unified-card`**: title lines (**מיל"י** + מדד… **(MILI)** / English mirror), **divider**, subtitle, **🎯** / **📊** bullets, illustration placeholder; title **`clamp`**, **`.title-line--group`** + portrait **nowrap** for Hebrew second line.

3. **Welcome S2** — Steps 1–2: **flat** Material (**`volume_up`**, **`hourglass_top`** + **`.plain-brown`**); step 3: test **💡**; step 4: mini traffic + **הצליח / חלקית·רמז / לא הצליח** (EN equivalents); single **Start** CTA (Tips commented).

4. **Test — age → questions** — **`confirmAge`** async mic + **`voiceIdentifierConfirmed`**; **`startSessionRecordingDirectFlow`**; **`ensureSpeakerVerifiedBeforeFinish`** relaxed without verify blob.

5. **Test — comprehension auto-score** — No **`showContinue`** traffic for **C**; **`finalizeComprehensionSuccess`** (confetti delay) / **`finalizeComprehensionResult`**; per-type rules in **`handleClick`** (see Summary).

6. **Test — hint rules** — **`hintEverOpenedRef`** / **`registerHintOpened`**; hint-first does **not** remove retry where applicable; expression traffic **hides green** when hint used.

7. **Test — ordered (2-step)** — **`orderedRescueActiveRef`** / **`orderedRescueTargetRef`**; **`orderedAnswers.length > 2`**: legacy full-sequence match.

8. **Test — two-image single** — **`images.length === 2`** + **`single`**: one click only; hint + correct → **partly**.

9. **Test — finish incomplete** — **`requestFinishTest`**; modal **`test.incompleteSummary.*`**; last question **`handleContinue`** checks unique answered count vs **`questions.length`**.

10. **Session complete UI** — Removed **`waitingForTranscription`**; detailed-results button always enabled; **`updateUserTests`** + optional **`transcription`** in background.

11. **i18n** — Completion download strings; **`test.incompleteSummary.*`**; traffic / hint strings as used.

12. **Babel** — **`welcome.js`**: **`React.Fragment`** instead of **`<>`** (babel-standalone v6).

---

## How to restore screens 3 & 4

1. In `welcome.js`, set `orderedScreens` back to `["screen1", "screen2", "screen3", "screen4"]`.
2. Uncomment the `screen3` and `screen4` blocks in `renderScreenBody`.
3. Remove or adjust the **screen 2** `onboarding-cta-row` if you want the old flow (Tips lived on screen 4).
