import sharp from "sharp";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SHEETS, sheetBasename } from "./sheets.config.mjs";
import { autoDetectCellsByWhiteBg } from "./auto-cells.mjs";

// Source images live in BoxSync (synced for backup); program lives outside it
// so it doesn't get reverted by sync events.
const ROOT = process.env.STAMAK_SOURCE_DIR || "/home/sasakiy/BoxSync/tool/stamak";
const OUT = path.resolve(import.meta.dirname, ".cache", "cropped");

await mkdir(OUT, { recursive: true });

// cols×rows + topCrop からセル配列を生成。
function gridToCells(meta, cols, rows, topCrop) {
  const cellW = Math.floor(meta.width / cols);
  const cellH = Math.floor(meta.height / rows);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = c * cellW;
      const top = r * cellH + topCrop;
      const width = c === cols - 1 ? meta.width - left : cellW;
      const height = (r === rows - 1 ? meta.height - r * cellH : cellH) - topCrop;
      cells.push({ left, top, width, height });
    }
  }
  return cells;
}

for (const sheet of SHEETS) {
  const base = sheetBasename(sheet);
  if (sheet.complete) {
    console.log(`${sheet.file}: SKIP (complete)`);
    continue;
  }

  const src = path.join(ROOT, sheet.file);
  const subdir = path.join(OUT, base);
  await mkdir(subdir, { recursive: true });

  const meta = await sharp(src).metadata();

  // 元画像のコピーをキャッシュに置く。postprocess が stickers/<sheet>/_source.<ext>
  // へ転送する。BoxSync 側の元 jpg/png をそのまま使うのではなく、リポジトリ内に
  // 持ち込むことで stamak だけ git clone しても UI が完結するようにする狙い。
  const sourceExt = path.extname(sheet.file);
  await copyFile(src, path.join(subdir, `_source${sourceExt}`));

  let cells, layoutDesc;
  if (sheet.autoCells === "white-bg") {
    cells = await autoDetectCellsByWhiteBg(src, sheet.autoCellsOpts || {});
    layoutDesc = `auto-cells (white-bg) × ${cells.length}`;
  } else if (sheet.cells) {
    cells = sheet.cells;
    layoutDesc = `cells×${cells.length}`;
  } else {
    cells = gridToCells(meta, sheet.cols, sheet.rows, sheet.topCrop ?? 0);
    layoutDesc = `${sheet.cols}x${sheet.rows} = ${sheet.cols * sheet.rows} stickers`;
  }

  let n = 0;
  for (const { left, top, width, height } of cells) {
    n++;
    const idx = String(n).padStart(2, "0");
    const out = path.join(subdir, `${base}_${idx}.png`);
    await sharp(src).extract({ left, top, width, height }).png().toFile(out);
  }
  console.log(`${sheet.file}: ${layoutDesc} -> ${path.relative(ROOT, subdir)}/`);
}
