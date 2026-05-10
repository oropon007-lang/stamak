---
description: Register a new source sheet image into the pipeline (cols/rows, bg color, transparency)
allowed-tools: Bash, Read, Edit
argument-hint: "<filename or path of new sheet>"
---

Register a new source sheet for processing: $ARGUMENTS

**Procedure:**
1. Read the file (Read tool — it shows the image visually).
2. Determine grid layout: count cols × rows. If there is a label/header band above each cell, note its pixel height for `topCrop`.
3. Determine background: white (default) or green (chroma key). If the artwork uses white as a *content* color (e.g. a white character body), flag the sheet as `transparent: false`.
4. Pick a short ASCII `name` for the output subdirectory (don't use spaces or non-ASCII).
5. Edit `tools/crop.mjs` to add the entry to `SHEETS`. Include `topCrop` only if needed.
6. If the sheet needs non-default options, edit `tools/postprocess.mjs` and add an entry under `SHEET_OPTS`.
7. Run `cd ~/projects/stamak/tools && npm run build` to process.
8. Sample one or two outputs by reading their composites over magenta to visually verify.
9. Report what was added and any issues.

If the source filename has spaces or Japanese characters, leave the source filename as-is in `crop.mjs` (it accepts any string), but use the ASCII `name` for the output directory.
