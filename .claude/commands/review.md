---
description: Visually review processed stickers and report issues (halos, leaked transparency, missing text holes, etc.)
allowed-tools: Bash, Read
argument-hint: "[sheet name | empty for all]"
---

Visually inspect the processed stickers in `stickers/` (the final LINE-ready output) and identify any issues that the algorithm couldn't catch.

**Scope:** $ARGUMENTS

If no sheet name is given, sample one or two stickers from each subdirectory. If a sheet name (e.g. `ゴブリン_1`, `ドット霊夢`) is given, review every sticker in that subdirectory. Skip `main.png` and `tab.png` unless the user explicitly asks about them.

**How to inspect:**
1. Composite each sample over a magenta background (so transparency leaks and halos are visible) using a one-off node script under `tools/`. Save to `/tmp/review_*.png`.
2. Read each composite back with the Read tool to actually see the pixels.
3. Look for the following issues:
   - Visible white or grey halos around dark strokes (transparency band too tight)
   - Background bleeding through inside content (e.g. white parts of a character body becoming transparent — wrong)
   - Internal "holes" of kanji / text that should be transparent but are still opaque
   - Edges cut off (cell boundary too tight, content clipped)
   - Wrong cropping (label area still visible, neighboring sticker bleeding in)

**Reporting:**
For each issue, state: sticker file path, what's wrong, and suggested fix (e.g. "tweak SHEET_OPTS for this sheet", "increase DILATE_K", "set transparent: false"). Do not change code yet — just report.

If everything looks clean, say so explicitly.
