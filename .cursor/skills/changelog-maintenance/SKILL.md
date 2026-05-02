---
name: changelog-maintenance
description: Maintain a running project changelog with consistent structure and accurate summaries. Use when appending changes, consolidating entries, merging date blocks, and recalculating summary bullets from main changes.
---

# Changelog Maintenance

## Purpose
Use this skill to keep the project changelog accurate, compact, and consistently structured over long editing sessions.

## When To Use
- User asks to update running changelog.
- New code/UI behavior changes were completed.
- Multiple change blocks need merging or reordering.
- Summary bullets are outdated relative to the main change list.

## Relationship To Rules
Rules enforce format constraints. This skill enforces workflow quality:
- what to include
- what to merge
- how to rewrite summary based on the full list
- how to avoid duplicate or contradictory items

## Workflow
1. Read current changelog.
2. Identify the target section/date block.
3. Normalize structure to required headings order.
4. Append or merge main change items.
5. Recompute summary bullets from the full main list.
6. Remove duplicates and contradictory wording.
7. Keep notes section updated (`None` only if truly none).

## Summary Recalculation Rules
- Keep exactly 2-3 bullets.
- Represent grouped outcomes, not line-by-line edits.
- Reflect current full main-change list (not only latest item).
- Prefer user impact wording over implementation detail.

## Main Change List Rules
- Use one numbered list.
- One concrete change per item.
- Keep wording brief and specific.
- If changes are tightly related, merge into one item.

## Consolidation Rules
- If two date blocks are requested to be merged:
  - keep one unified block
  - preserve all unique main changes
  - renumber list sequentially
  - rewrite summary for merged scope

## Quality Checks Before Finalizing
- Heading order is exact:
  - `## PR title`
  - `## Summary (2-3 bullets)`
  - `## numbered main changes`
  - `## numbered notes`
- Numbering is continuous and unique.
- Summary and main list do not conflict.
- No stale text from reverted changes.

## Common Pitfalls
- Appending new items without updating summary.
- Keeping duplicate entries after iterative UI tweaks.
- Mixing exploratory notes into main change list.
- Leaving old date block headings after consolidation.

