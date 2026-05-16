---
name: seeandsay-responsive-layout
description: Portrait-only responsive layout for See&Say frontend_demo. Golden viewport guardrails, tier breakpoints, file map, and @media refactor protocol.
---

# See&Say Responsive Layout

**Status (16 May 2026):** Responsive refactor **complete** (plan phases **0–6** + post-closure housekeeping). Golden **390×705** and short-wide **1280×800** remain protected checkpoints. User **signed off** all four QA viewports (see **QA sign-off checklist** below). **Short-wide compact** band for low-height laptops (e.g. **1168×632**). **Tall desktop** band for common fullscreen PCs (checkpoint **1920×1080**).

## Golden viewport (DO NOT REGRESS)

| Constraint | Value |
|------------|--------|
| Orientation | Portrait only |
| Width | ≤410px |
| Height | 700–710px |
| Primary checkpoint | **390×705** DevTools |

This band is **perfect**. No visual changes unless byte-for-byte equivalent moves with identical cascade order.

## Short-wide desktop (user-approved)

| Constraint | Value |
|------------|--------|
| Media query | `@media (min-width: 721px) and (max-height: 860px)` |
| Primary checkpoint | **1280×800** DevTools |
| Purpose | Phone-like question grids, square choice tiles, summary fill |

**Do not merge** this block with golden (`max-width: 410px`) or with tall-desktop `min-height: 861px` rules.

## Short-wide compact (nested, low height)

| Constraint | Value |
|------------|--------|
| Media query | `@media (min-width: 721px) and (max-height: 700px)` |
| Primary checkpoint | **1168×632** browser window (100% zoom) |
| Purpose | Extra vertical compaction on same width family as **1280×800** when height ≤700px |

**Isolation:** **1280×800** (height 800) does **not** match `max-height: 700px`. Add overrides **after** the `721×860` block; never edit `721×860` rules to “fix” compact laptops.

**1168×632 tier logic:** width hits `721+` and `900+` short-wide width gates; height 632 &lt; 860 (short-wide) and &lt; 700 (compact); height &lt; 861 (tall desktop excluded); width 1168 **outside** lg tablet `768–1023`.

## Tall desktop (common fullscreen PC)

| Constraint | Value |
|------------|--------|
| Media query | `@media (min-width: 900px) and (min-height: 861px)` |
| Primary checkpoint | **1920×1080** browser fullscreen (100% zoom) |
| Also matches | **1536×864**, **1440×900**, **1680×1050** |
| Excludes | **1280×800**, **1168×632** (height ≤860 / ≤700), **1366×768** (768h → short-wide only) |

**Isolation:** Do **not** merge with `721×860` short-wide or golden. `--tier-content-max: min(1100px, 94vw)` set in `colors.css` at this band (and at `1024px` for width-only). Test grids/summary in `test.css` at `900×861` (replaces prior `720×861` gate).

**Polish scope:** compact header (48px logo), welcome 2-col intro + 3-col cards at `1280×861+`, onboarding 2-col S1 + large illustration + S2 login card, test wide square tiles + 3–4 col grids + side-by-side summary donuts.

## Wider / height tiers

| Tier | Media query pattern | Purpose |
|------|---------------------|---------|
| Golden | default + `max-width: 410px` portrait + `layout.css` height 700–710 | Phone portrait reference |
| Large phone (sm) | `min-width: 411px` and `max-width: 479px` portrait | Bridge above golden; tame auto-fit / padding |
| Wide phone | `min-width: 411px` (no max) | `--tier-content-max` cap (720–900px; wider at 1024px) |
| Tablet portrait (lg) | `min-width: 768px` and `max-width: 1023px` portrait | iPad-class; moderate square tiles, content cap (not short-wide density) |
| Tall desktop | `min-width: 900px` and `min-height: 861px` | Centered `min(1100px, 94vw)`; 2–3 col landing; test 3–4 col + summary side-by-side |
| Desktop content | `min-width: 720px` / `1024px` | Two-column landing; `1024px` caps content (short-wide stacks at `max-height: 860px`) |
| Short (non-golden height) | `max-height: 699px` at ≤410px | **Skipped** — golden height band must not change |
| Tall (non-golden height) | `min-height: 711px` at ≤410px | **Skipped** for test — same reason |

**Never** use bare `orientation: landscape` — product is portrait-only.

## CSS variables (`colors.css`)

- `--tier-golden-max`: 410px
- `--tier-wide-min`: 411px
- `--tier-content-min`: 720px
- `--tier-content-max`: 900px (wider at `min-width: 1024px`)
- `--tier-golden-height-min` / `--tier-golden-height-max`: 700px / 710px

Use variables only in `min-width: 411px+` (or height bands outside 700–710 at ≤410px) until a screen is explicitly refactored.

## File map

| File | Role | `@media` (16 May 2026 Phase 6) |
|------|------|-------------------------------|
| `frontend_demo/css/colors.css` | Tokens, tiers, navbar height at 600px / tall desktop 900×861 / compact 721×≤700 | 5 |
| `frontend_demo/css/layout.css` | App shell: reset, `.app-container`, golden height stretch, tall desktop + compact shell | 2 |
| `frontend_demo/css/styles.css` | Hub: `@import` + globals (header, age, voice); tall desktop header | 6 |
| `frontend_demo/css/screens/welcome.css` | Landing scroll, sm/lg tablet, tall desktop 900×861, short-wide, compact | 10 |
| `frontend_demo/css/screens/onboarding.css` | Onboarding flow, tall desktop 900×861, sm/lg tablet, 1024 / short-wide / compact | 13 |
| `frontend_demo/css/screens/test.css` | Test flow, tall desktop 900×861, short-wide 721×860, compact, sm/lg tablet | 24 |
| `frontend_demo/index.html` | Injects `colors.css` + `styles.css` (see **CSS load chain** below) | — |

**Total: 60** `@media` groups (includes `prefers-reduced-motion` in test.css; excludes hub comment line mentioning `@media`).

### CSS load chain (`index.html` → hub)

`index.html` does **not** link screen CSS directly. A boot script appends two stylesheets (cache-busted with `?v=`):

1. `css/colors.css` — tokens and tier variables (standalone).
2. `css/styles.css` — hub that `@import`s, in order:
   - `./layout.css`
   - `./screens/welcome.css`
   - `./screens/onboarding.css`
   - `./screens/test.css`

Then hub globals (header, age, voice, etc.). **Do not** add a third top-level `<link>` for screen files; extend the hub `@import` list instead.

Phase 5 ended at **48**. Phase 6 added **+6** (sm + lg tablet in welcome, onboarding, test).

Rollout: **welcome/onboarding → test flow → Phase 4 cleanup → Phase 5 cleanup → Phase 6 tablet/sm polish (16 May 2026).**

### `test.css` scope

- Question UI: `.question-section`, `.query-text`, `.replay-audio-btn`, expression layout modifiers
- Choices: `.images-container`, `.image-wrapper`, `.image`, count modifiers (`--two-col`, `--three-up`, `--five-up`, etc.)
- Evaluation: `.traffic-light`, `.traffic-popup*`
- Pre-question: `.microphone-check-screen`, `.mic-level-meter`
- Complete: `.session-complete*`, `.session-immediate-summary*`, `.pls-narrative-report`
- Portrait question layout: `@media (max-width: 600px) and (orientation: portrait)` — **three blocks** (session complete ~1.3k, navbar/dev ~1.9k, bottom-actions ~3k); **not merged** (cascade order vs intervening rules)
- Short-wide: `@media (min-width: 721px) and (max-height: 860px)` — grids, square tiles, summary layout
- Short-wide compact: `@media (min-width: 721px) and (max-height: 700px)` — nested overrides (1168×632); stacked summary, smaller image caps, compact mic
- Lg tablet: `@media (min-width: 768px) and (max-width: 1023px) and (orientation: portrait)` — `data-count` grids + square tiles (CSS-only; no `test.js` change)
- Tall desktop: `@media (min-width: 900px) and (min-height: 861px)` — wide square tiles, compact test navbar, 2-col session summary
- Wider tier: `@media (min-width: 411px)` + `@media (min-width: 720px)` landing two-column

### JS alignment (`test.js`)

- `usePhoneLikeGrid`: `(max-width: 600px) and (orientation: portrait)` **or** `(min-width: 721px) and (max-height: 860px)` — drives grid modifier classes
- `isMobile`: `(max-width: 600px)` — aligned with CSS phone band; only referenced by unused `minImgWidth` (no render effect)
- `app.js`: rotate overlay removed
- **768×1024 tablet:** layout via CSS `data-count` + lg tablet block; JS phone-like classes not required

## Plan phases (0–6) — complete

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | Tokens, `layout.css`, file split, portrait-only | Done |
| 1 | Golden height fill, onboarding flex frame | Done |
| 2 | Wider tiers `411px` / `720px`, test grids | Done |
| 3 | `1024px` + short-wide `721×860` landing/onboarding/test | Done |
| 4 | Safe `@media` merges, tier headers | Done |
| 5 | Further safe merges (52→48), `isMobile` 600px | Done |
| 6 | Lg tablet `768–1023` portrait, sm `411–479`, docs closure | Done |

## QA matrix (checkpoints)

| Viewport | Screens | Pass criteria |
|----------|---------|---------------|
| **390×705** | Welcome, onboarding S1–S3, test questions + summary | Unchanged vs golden reference; no new rules in ≤410×700–710 |
| **1280×800** | Test questions, session complete | Short-wide grids/tiles + summary 2×2; no regression |
| **1168×632** | Welcome, onboarding S1, test questions + mic + summary | Compact header; no forced `100dvh` scroll; square tiles; stacked complete summary; **must not** change **1280×800** |
| **412×915** | Welcome, onboarding, test + complete | No horizontal overflow; sm tall fill; מבט כללי labels **15px** / title **18px**; donut legend **13px** |
| **768×1024** | Welcome, onboarding, test + complete | Content capped; lg tablet tiles; stacked summary; מבט כללי title **26px** / labels **20px**; donut legend **14px**; circular donuts |
| **1920×1080** | Welcome, onboarding S1–S2, test questions + summary | Centered `min(1100px, 94vw)`; 2-col intro / 3-col cards (≥1280w); onboarding 2-col S1; test 3–4 col square tiles; stats + donuts side-by-side; **must not** change **1280×800** or **1168×632** |

Protocol: grep `orientation: landscape` (zero); grep dead `rotate-overlay` / `progress-track` / progress-bar bunny (zero — session-complete decorative bunny-carrot art is intentional); after any merge, diff **390×705**, **1280×800**, and **1168×632**.

## QA sign-off checklist (user-approved 16 May 2026)

Run in DevTools portrait. Mark pass only if criteria hold; **do not** edit golden or short-wide blocks to “fix” other tiers.

| # | Viewport | Tier | Required pass |
|---|----------|------|-----------------|
| 1 | **390×705** | Golden | Pixel-stable vs reference; no new ≤410×700–710 rules |
| 2 | **1280×800** | Short-wide `721×860` | Phone-like grids, square tiles, summary 2×2 fill |
| 3 | **412×915** | sm tall `411–479` + `min-height: 880px` | No overflow; viewport stretch; complete hero column; 2×2 מבט כללי; typography per matrix |
| 4 | **768×1024** | lg tablet `768–1023` portrait | Content cap; `data-count` grids; stacked complete summary; circular donuts; typography per matrix |

**Pre-flight grep (housekeeping):** `orientation: landscape` → 0; `rotate-overlay` / `ProgressBar` / `progress-track` → 0 in `frontend_demo/`.

## Phase 5 merges (16 May 2026)

| Merged | Files | Notes |
|--------|-------|-------|
| Three `max-width: 600px` | `test.css` | Top-of-file block: navbar, notes width, age/mic/session margins |
| Two `min-width: 601px` | `test.css` | `dev-mode-indicator` + fixed `.test-navbar` |
| Two `max-width: 600px` | `styles.css` hub | Early page-content block + responsive voice/age-adjacent rules (voice stays **before** 768px block) |

## Phase 6 (16 May 2026)

| Added | Files | Notes |
|-------|-------|-------|
| sm `411–479` portrait | welcome, onboarding, test | Padding / auto-fit bridge only; golden ≤410 untouched |
| lg tablet `768–1023` portrait | welcome, onboarding, test | Content max-width; 2-col landing; onboarding single-col S1 + taller illustration; test `data-count` 2–3 col + square tiles (taller caps than short-wide) |
| Three `600px portrait` merge | test.css | **Skipped** — blocks separated by ~600+ lines; moving rules would change cascade |

## Golden height fill (May 2026)

- Tall onboarding (`min-height: 650px` portrait): `.onboarding-frame` must use **flex column**, not `display: grid`, so `.onboarding-screen` can `flex: 1` into `calc(100dvh - 182px)` frame height.
- Golden band `700–710px` at `max-width: 410px`: `layout.css` stretches `.landing-wrapper` / `.onboarding-flow`; `test.css` flex-fills question image rows (not `.page-content` flex-fill — reverted in Phase 4).
- Scope test-only shell padding: `.app-container[data-page="test"]` in `max-width: 480px`, not bare `.app-container`.

## Consolidation rules

When merging duplicate breakpoints:

1. Prefer single `max-width: 410px` for golden-width band if cascade at 390px is unchanged.
2. Do not merge rules that target different height bands without `max-height:699` / `min-height:711` guards.
3. Re-verify **390×705** and **1280×800** after every consolidation.
4. Do not merge `600px` blocks that are far apart without a snapshot diff — cascade order across unrelated selectors can still matter (e.g. two `480px` blocks separated by a `560px` block).
5. Never merge `721px` + `max-height: 860px` with golden or with each other tier.
6. Never edit `721×860` rules for compact laptops — use nested `721×≤700` only; verify **1280×800** after compact changes.

## Responsive refactor complete — deferred (intentional)

1. **Height tiers** `max-height: 699px` / `min-height: 711px` at ≤410px for test — **skipped** (golden perfect).
2. **Three** scattered `600px portrait` blocks in `test.css` — merge only with full-file cascade diff.
3. **Two** `480px` blocks in test (session vs question shell) — do not merge (`560px` between).
4. **`test.js` `usePhoneLikeGrid` for lg tablet** — not required; CSS `data-count` covers 768×1024 without business-logic changes.
5. **md width bridge `480–767px`** (between sm `411–479` and lg `768+`) — **no dedicated tier**; `max-width: 600px` + `min-width: 601px` test rules and `411px+` caps already cover typical widths (e.g. **600×**); add rules only with explicit breakage at a named viewport.

### Post-closure housekeeping (16 May 2026)

- Dead CSS grep: no `rotate-overlay`, `progress-track`, or `ProgressBar` remnants; `session-complete__bunny` is summary decoration only.
- All four user-approved viewports signed off; no further responsive work unless a new breakpoint is requested.
