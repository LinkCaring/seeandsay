---
name: full-test-qa-triage
description: Run and debug full end-to-end tests, triage intermittent issues (loader stalls, last-question navigation weirdness, avatar freezes, evaluation emoji lag, first-question audio missing), and produce a reproducible bug report with logs and exact steps. Use when doing QA, debugging “only sometimes” issues, or validating a release.
disable-model-invocation: true
---

# Full test QA triage

## Goal
Turn “occasional” user reports into:
- a minimal reproducible path,
- a clear hypothesis (client vs backend vs assets vs upstream),
- and a short fix/test plan.

## Standard run matrix (keep it small but meaningful)
- Devices:
  - Desktop Chrome
  - Mobile Safari (iOS) or Chrome Android (pick whichever your users are on)
- Network:
  - Normal
  - Throttled “Fast 3G” (for loader/audio stress)
- Session:
  - Fresh (no cache)
  - Warm (cache present)

## Capture checklist (always)
- Browser console logs
- Network log for:
  - `/api/createUser`
  - `/api/addTestToUser`
  - `/api/expressionAiStatus`
  - image requests (slowest 10, failed requests)
- App state:
  - `testId` returned by backend
  - `expression_ai.status` transitions

## Symptom playbooks

### A) Photo loader delays / weird stalls
- Check for:
  - many parallel requests, large PNG sizes, cache misses
  - any repeated 404/timeout in loader
- Validate:
  - loader timeout behavior triggers recovery UI
  - active-question prioritize loads are working

### B) “Last question” weird navigation / going back before finish
- Confirm:
  - which state transition triggers it (Continue? traffic popup? completion animation?)
  - whether a delayed timer or ref is firing after completion.

### C) Avatar freeze / eval emoji click lag
- Profile:
  - main-thread long tasks around click handlers / video playback
  - excessive re-renders on click

### D) First question audio not heard on some devices
- Autoplay restrictions are device-specific.
- Verify:
  - there is a user gesture before audio play
  - audio starts only after images are ready and UI is interactive
- Add targeted logs around “autoplay pending”, “play() rejected”, and “prime media playback”.

## What “done” looks like per bug
- Repro steps + expected vs actual
- 1–2 suspected root causes
- A concrete fix candidate
- A regression test (manual or Playwright)

## “Superpowers” vs open-source tools
- Prefer “superpowers” (Cursor + internal tooling) for:
  - quickly finding state transitions/timers/refs causing late events
  - reading + editing the exact code paths in one loop
- Prefer open-source tools for:
  - Lighthouse / WebPageTest for asset bottlenecks
  - Playwright for repeatable end-to-end reproduction

