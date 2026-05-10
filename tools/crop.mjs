import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Source images live in BoxSync (synced for backup); program lives outside it
// so it doesn't get reverted by sync events.
const ROOT = process.env.STAMAK_SOURCE_DIR || "/home/sasakiy/BoxSync/tool/stamak";
const OUT = path.resolve(import.meta.dirname, ".cache", "cropped");

// cols x rows for each source sheet. Optional `name` sets the output subdirectory
// (defaults to the file basename). Optional `topCrop` shaves N pixels off the top
// of each cell (useful when a sheet has labels above each sticker).
const SHEETS = [
  { file: "ゴブリン_1.jpg",          cols: 6, rows: 4 },
  { file: "ゴブリン_2.jpg",          cols: 6, rows: 4 },
  { file: "下半身タイガー_0.jpg",    cols: 4, rows: 4 },
  { file: "下半身タイガー_1.jpg",    cols: 4, rows: 4 },
  { file: "ゆる下半身タイガー.jpg",  cols: 4, rows: 4 },
  { file: "ゆるタイガー_0.jpg",      cols: 4, rows: 4 },
  { file: "ゆるタイガー_1.jpg",      cols: 4, rows: 4 },
  { file: "ゆるタイガー_2.jpg",      cols: 4, rows: 4 },
  { file: "ゆるタイガー_3.jpg",      cols: 4, rows: 4 },
  { file: "目の錯覚.jpg",            cols: 3, rows: 3 },
  { file: "絶景.jpg",                cols: 3, rows: 3 },
  { file: "遅刻神.jpg",              cols: 3, rows: 3 },
  { file: "ドット霊夢.png",          cols: 5, rows: 2, topCrop: 80 },
  { file: "ドット万理沙.png",        cols: 5, rows: 2, topCrop: 80 },
];

await mkdir(OUT, { recursive: true });

for (const { file, cols, rows, name, topCrop = 0 } of SHEETS) {
  const src = path.join(ROOT, file);
  const base = name || path.basename(file, path.extname(file)).replace(/[()]/g, "");
  const subdir = path.join(OUT, base);
  await mkdir(subdir, { recursive: true });

  const meta = await sharp(src).metadata();
  const cellW = Math.floor(meta.width / cols);
  const cellH = Math.floor(meta.height / rows);

  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      const left = c * cellW;
      const top = r * cellH + topCrop;
      const w = c === cols - 1 ? meta.width - left : cellW;
      const h = (r === rows - 1 ? meta.height - r * cellH : cellH) - topCrop;
      const idx = String(n).padStart(2, "0");
      const out = path.join(subdir, `${base}_${idx}.png`);
      await sharp(src).extract({ left, top, width: w, height: h }).png().toFile(out);
    }
  }
  console.log(`${file}: ${cols}x${rows} = ${cols * rows} stickers -> ${path.relative(ROOT, subdir)}/`);
}
