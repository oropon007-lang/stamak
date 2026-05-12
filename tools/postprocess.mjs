import sharp from "sharp";
import { readdir, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { SHEETS, sheetBasename } from "./sheets.config.mjs";

// 完成扱いのシートは「触らない」。crop が cache に置かない設計のため通常は
// この check に到達しないが、過去の cache が残っているケースを保険として弾く。
const COMPLETE_SHEETS = new Set(
  SHEETS.filter(s => s.complete).map(s => sheetBasename(s))
);

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(import.meta.dirname, ".cache", "cropped");
const AI_DIR = path.resolve(import.meta.dirname, ".cache", "rembg");
const DST = path.join(ROOT, "stickers");
const REMBG_SCRIPT = path.resolve(import.meta.dirname, "py", "rembg-batch.sh");

// Per-sheet options:
//   engine:    "ai" (default, runs rembg) or "none" (skip transparency, keep white bg)
//   model:     rembg model name
//   alphaT:    binary threshold for soft-alpha output (default 128)
//   bg:        "white" (default) or "green" — controls chroma cleanup of bg-tinted edges
//   trimWhite: true なら finalize 時に上下左右エッジから白い縁を透過化 (rembg が
//              背景白を残してしまった場合の救済)
const SHEET_OPTS = {
  "目の錯覚":     { engine: "none" },
  "ドット霊夢":   { engine: "ai", model: "isnet-anime", bg: "green" },
  "ドット万理沙": { engine: "ai", model: "isnet-anime", bg: "green" },
  "遅刻には神罰を下す": { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true },
  "残業":         { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true },
  "絶景":         { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true },
  // birefnet が一番マシ (一部キャプションを保持)。isnet-anime は全消し、isnet-general も
  // 全消しで使えない。キャプション完全保持には engine:"none" (白背景維持) が必要だが
  // LINE 青背景に白浮きが目立つのでトレードオフ。
  "きゃわいいタイガタウルス": { engine: "ai", model: "birefnet-general", alphaT: 30 },
};
const DEFAULT_OPTS = { engine: "ai", model: "isnet-general-use", alphaT: 128, bg: "white" };

// LINE sticker spec.
const MAX_W = 370;
const MAX_H = 320;
const MAIN_DIM = 240;
const TAB_W = 96;
const TAB_H = 74;

function execStream(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const ps = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    ps.stdout.on("data", () => {});
    ps.stderr.on("data", () => {});
    ps.on("close", code => code === 0 ? resolve() : reject(new Error(`${label} failed (${code})`)));
    ps.on("error", reject);
  });
}

async function rembgSheet(sheetName, model) {
  const inDir = path.join(SRC, sheetName);
  const outDir = path.join(AI_DIR, sheetName);
  await mkdir(outDir, { recursive: true });
  await execStream(REMBG_SCRIPT, [model, inDir, outDir], `rembg ${sheetName}`);
}

async function ensureEven(buf) {
  const m = await sharp(buf).metadata();
  const padR = m.width % 2 === 0 ? 0 : 1;
  const padB = m.height % 2 === 0 ? 0 : 1;
  if (padR === 0 && padB === 0) return buf;
  return await sharp(buf)
    .extend({ right: padR, bottom: padB, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function makeFixedCanvas(srcPath, outPath, width, height) {
  const inner = await sharp(srcPath)
    .resize({ width, height, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

// 各エッジから走査し、不透明ピクセルのうち「ほぼ白」(R,G,B >= 235) が threshold 以上
// の行/列は白い縁として透過化する。rembg が saliency 判定で白い背景を残してしまった
// 場合の救済用 (例: 遅刻シートの下端に白縁が残る)。
//   threshold: 0..1 (例 0.3 = 30% 以上で縁判定)
function trimWhiteEdges(data, w, h, threshold = 0.3) {
  const isNearWhite = (i) => data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235;
  const stripRow = (y) => {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0 && isNearWhite(i)) data[i + 3] = 0;
    }
  };
  const stripCol = (x) => {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0 && isNearWhite(i)) data[i + 3] = 0;
    }
  };
  const rowWhiteRatio = (y) => {
    let opaque = 0, white = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0) { opaque++; if (isNearWhite(i)) white++; }
    }
    return opaque ? white / opaque : 0;
  };
  const colWhiteRatio = (x) => {
    let opaque = 0, white = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0) { opaque++; if (isNearWhite(i)) white++; }
    }
    return opaque ? white / opaque : 0;
  };
  // top → down
  for (let y = 0; y < h; y++) { if (rowWhiteRatio(y) >= threshold) stripRow(y); else break; }
  // bottom → up
  for (let y = h - 1; y >= 0; y--) { if (rowWhiteRatio(y) >= threshold) stripRow(y); else break; }
  // left → right
  for (let x = 0; x < w; x++) { if (colWhiteRatio(x) >= threshold) stripCol(x); else break; }
  // right → left
  for (let x = w - 1; x >= 0; x--) { if (colWhiteRatio(x) >= threshold) stripCol(x); else break; }
}

async function finalizeSticker(srcPath, dstPath, alphaT, bg, trimWhite) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3];
    a = a >= alphaT ? 255 : 0;
    if (a > 0 && bg === "green") {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 25 && g > b + 25) a = 0;
    }
    data[i + 3] = a;
  }
  if (trimWhite) trimWhiteEdges(data, info.width, info.height, 0.15);
  const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(await ensureEven(buf)).toFile(dstPath);
}

async function finalizeOpaque(srcPath, dstPath) {
  const buf = await sharp(srcPath)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 15 })
    .resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(await ensureEven(buf)).toFile(dstPath);
}

await mkdir(DST, { recursive: true });
const subdirs = (await readdir(SRC, { withFileTypes: true })).filter(d => d.isDirectory());
let total = 0;
for (const d of subdirs) {
  if (COMPLETE_SHEETS.has(d.name)) {
    console.log(`${d.name}: SKIP (complete)`);
    continue;
  }
  const opts = { ...DEFAULT_OPTS, ...(SHEET_OPTS[d.name] || {}) };
  const inDir = path.join(SRC, d.name);
  const outDir = path.join(DST, d.name);
  await mkdir(outDir, { recursive: true });

  if (opts.engine === "ai") {
    process.stdout.write(`${d.name}: rembg(${opts.model})... `);
    const t0 = Date.now();
    await rembgSheet(d.name, opts.model);
    process.stdout.write(`${((Date.now() - t0) / 1000).toFixed(1)}s, finalizing... `);
  } else {
    process.stdout.write(`${d.name}: ${opts.engine}, finalizing... `);
  }

  // _source.* は sticker ではないので除外する。crop が同じディレクトリに置いている。
  const files = (await readdir(inDir)).filter(f => f.endsWith(".png") && !f.startsWith("_source.")).sort();
  for (const f of files) {
    const dst = path.join(outDir, f);
    if (opts.engine === "ai") {
      const aiPath = path.join(AI_DIR, d.name, f);
      await finalizeSticker(aiPath, dst, opts.alphaT, opts.bg, opts.trimWhite);
    } else {
      await finalizeOpaque(path.join(inDir, f), dst);
    }
    total++;
  }

  if (files.length > 0) {
    const firstOut = path.join(outDir, files[0]);
    const mainSrc = opts.mainSource ? path.join(outDir, opts.mainSource) : firstOut;
    const tabSrc = opts.tabSource ? path.join(outDir, opts.tabSource) : firstOut;
    await makeFixedCanvas(mainSrc, path.join(outDir, "main.png"), MAIN_DIM, MAIN_DIM);
    await makeFixedCanvas(tabSrc, path.join(outDir, "tab.png"), TAB_W, TAB_H);
  }

  // crop が置いた _source.* (元一枚絵のコピー) を stickers 側に転送する。
  const cacheEntries = await readdir(inDir);
  const sourceFile = cacheEntries.find(f => f.startsWith("_source."));
  if (sourceFile) {
    await copyFile(path.join(inDir, sourceFile), path.join(outDir, sourceFile));
  }

  console.log(`${files.length} stickers + main + tab${sourceFile ? " + source" : ""}`);
}
console.log(`Total: ${total} stickers -> ${path.relative(ROOT, DST)}/`);
