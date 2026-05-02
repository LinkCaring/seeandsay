---
name: avatar-animation-workflow
description: Plan and implement avatar animation workflow for web apps. Use when working on avatar assets, Lottie/Live2D decisions, animation state mapping, runtime integration, and fallback behavior.
---

# Avatar Animation Workflow

## Purpose
Use this skill to define and execute a production-ready avatar animation pipeline for the app.

## When To Use
- User asks to add avatar animation.
- Team needs to choose between Lottie and Live2D.
- Need to preserve exact avatar look while adding animation states.
- Need frontend integration guidance (state mapping, preload, fallback).

## Inputs To Collect First
1. Target style fidelity: exact look vs stylized approximation.
2. Runtime target: web only, mobile web, or native wrappers.
3. Required states: idle, listening, talking, success, warning, paused.
4. Asset source: raster image, layered PSD, or vector design file.
5. Performance budget: expected devices and load constraints.

## Decision Tree
1. If exact raster look must be preserved -> prefer Live2D (layered rig).
2. If lightweight web delivery and UI-state animation are priority -> prefer Lottie (vector workflow).
3. If uncertain -> run a short spike:
   - One Lottie prototype state.
   - One Live2D prototype state.
   - Compare fidelity, runtime weight, and engineering complexity.

## Asset Preparation Standard
- Keep transparent background for avatar assets.
- Separate controllable parts (eyes, brows, mouth, head, torso, hair sections).
- Use consistent naming across files:
  - `avatar_idle`
  - `avatar_listen`
  - `avatar_talk`
  - `avatar_success`
  - `avatar_pause`
- Export fallback static PNG for failure/offline mode.

## Runtime Integration Checklist
- Preload avatar assets before first interaction.
- Use one avatar controller mapping app state -> animation state.
- Avoid scattering animation triggers across multiple components.
- Add a hard fallback path:
  - If animation asset fails to load, render static PNG.
- Keep logging for animation load failures and state transitions.

## State Mapping Template
Use this mapping model:

```text
app_state: "question_loaded" -> avatar_state: "listen"
app_state: "tts_playing"     -> avatar_state: "talk"
app_state: "answer_correct"  -> avatar_state: "success"
app_state: "paused"          -> avatar_state: "pause"
app_state: "idle"            -> avatar_state: "idle"
```

## Acceptance Criteria
- Avatar state transitions are deterministic and testable.
- No visible first-play lag after entering test flow.
- Fallback static avatar appears if animation fails.
- Animations do not block core test interactions.

## Common Pitfalls
- Using a single flat PNG and expecting rich facial animation.
- Missing transparent background in assets.
- Triggering animation from many independent effects (state conflicts).
- No fallback behavior for broken JSON or network failures.

