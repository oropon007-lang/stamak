---
description: Diagnose and fix a specific sticker issue (e.g. transparency leak, halo, miscrop) by adjusting the pipeline config
allowed-tools: Bash, Read, Edit
argument-hint: "<file path or sheet name and short description>"
---

Investigate and fix the issue described: $ARGUMENTS

**Procedure:**
1. Identify which sheet/file is involved.
2. Read the relevant source image and the processed output. Composite the output over magenta to see transparency issues clearly.
3. Determine the root cause and pick the minimal config change in `~/projects/stamak/tools/postprocess.mjs`:
   - **AI segmentation under-cuts** (only main subject, drops floating text/items) → switch model to `birefnet-general` for that sheet via `SHEET_OPTS[name].model`
   - **AI segmentation over-cuts / faint details lost** → lower `alphaT` (e.g. 30) for that sheet
   - **Background bleeds at edges (green/white halo)** → set `bg: "green"` or `bg: "white"` to enable chroma cleanup
   - **Wrong crop / cell alignment** → tune `cols`/`rows`/`topCrop` in `~/projects/stamak/tools/crop.mjs` `SHEETS`
   - **White-as-content sheet (panda etc.)** → set `engine: "none"` to keep the white background
4. Make the minimal config change. Do NOT broadly refactor.
5. Re-run: `cd ~/projects/stamak/tools && npm run rebuild:final` (uses cached rembg outputs when possible).
6. Visually verify the fix worked by reading the updated file. If not, iterate.
7. Report the diagnosis, the change made, and the verification result.
