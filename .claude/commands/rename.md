---
description: Rename stickers in a sheet from numbered (e.g. 80316_01.png) to descriptive names based on the visible text/emotion in each image
allowed-tools: Bash, Read
argument-hint: "<sheet name>"
---

Rename the stickers in `stickers/$ARGUMENTS/` based on the visible text or emotion in each image.

**Procedure:**
1. List all PNG files in `stickers/$ARGUMENTS/` sorted by name.
2. Read each file with the Read tool to actually look at it.
3. Extract the most prominent label or emotion shown in the sticker (e.g. "むり", "OK", "ねむい", "通常", "笑顔"). Prefer Japanese text exactly as written when present; fall back to a 1–3 word emotion description if there is no text.
4. Convert to a safe filename: keep Japanese characters but strip punctuation and whitespace; if a name collides with an existing one, append `_2`, `_3`, etc.
5. Rename the file in place using `mv`. Keep the original numeric prefix in case the user wants to revert — produce final names like `01_むり.png`, `02_OK.png`, ... so sort order is preserved.

**Before renaming:** show the user the proposed full mapping (old → new) and wait for confirmation before running any `mv` commands. After confirmation, do all renames in one batched Bash command.

**After renaming:** persist the mapping to `tools/rename-map.json` so it survives `/retry`. The file is a flat JSON object keyed by `sheetName/oldFilename.png` with the new filename as the value:

```json
{
  "$ARGUMENTS/$ARGUMENTS_01.png": "01_むり.png",
  "$ARGUMENTS/$ARGUMENTS_02.png": "02_OK.png"
}
```

Read the existing file first if present, merge in the new entries (don't drop entries from other sheets), then write it back. The npm `build` script auto-applies this map after each rebuild.

If the sheet was processed with `transparent: false` (white bg), still process normally — text is visible either way.
