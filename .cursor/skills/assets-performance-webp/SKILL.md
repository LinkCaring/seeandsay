---
name: assets-performance-webp
description: Improve photo loading performance by converting PNG assets to WebP/JPEG, adjusting loader URL strategy and fallbacks, validating CDN/cache behavior, and preventing regressions in test_assets downloads. Use when users complain about slow photo loads, or when changing image formats, loader logic, or CDN/storage.
disable-model-invocation: true
---

# Assets performance (PNG → WebP/JPEG) and loader workflow

## Default recommendation
- Prefer **WebP** for most test assets (smaller + can support transparency).
- Use **JPEG** only for fully opaque photographic images when WebP is not available/desired.
- Keep **PNG** only for:
  - assets that must be lossless,
  - or where artifacts are unacceptable (rare for these tiles).

## Conversion workflow (safe)
1. Identify the largest/heaviest folders in `resources/test_assets/`.
2. Convert with consistent settings (start point):
   - WebP lossy quality 80–85
   - Ensure max dimensions match actual display size (avoid 4k images for 200px tiles).
3. Spot-check for:
   - text/line art blur
   - banding in flat colors
   - transparency artifacts

## Loader strategy decision
Choose one:
- **WebP-first** (best performance): loader uses `.webp` as primary, `.png` as fallback.
- **PNG-first** (least change): keep `.png` primary and only use `.webp` if `.png` fails (this does not reduce bytes if PNG exists).

## Cache/CDN checklist
- Confirm `Cache-Control` headers for assets:
  - long max-age for versioned immutable assets
- If you cannot version filenames, add a build/version querystring.
- Validate that repeat runs have high cache hit rate.

## Don’t convert PNG to “webm”
- WebM is video, not images; converting still images to video is usually the wrong tool here.
- If you need animation, consider WebM only for avatar clips (already used).

## “Superpowers” vs open-source tools
- Prefer “superpowers” for:
  - updating loader URL generation and fallbacks consistently
  - verifying UI layouts across image counts and devices
- Prefer open-source tools for:
  - `ffmpeg` or `cwebp` batch conversion
  - Lighthouse/WebPageTest to quantify improvements

