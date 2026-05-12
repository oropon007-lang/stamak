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
  // 全消しで使えない。残ったキャプション欠落は preserveText で「元 crop の暗ピクセル」を
  // 強制保持してカバー (きゃわいいは白背景 + 黒文字なので前提が成立)。
  "きゃわいいタイガタウルス": { engine: "ai", model: "birefnet-general", alphaT: 30, preserveText: true },
  // タイガタウルス_2: キャプションが各 cell で違う位置 (上部 / 縦書き側面) にあり、
  // topCrop で機械的に削れない。preserveText で AI が消したキャプションを救う。
  "タイガタウルス_2": { preserveText: true },
};
// fillHoles はデフォルト ON。rembg が目・歯等の白部を抜く問題を防ぐ。
// outline はデフォルト ON で白縁 4px。LINE のチャット背景に乗せた時の視認性向上と
// 「シール感」演出。文字 (キャプション) も alpha が立っていれば同じ縁取りが付く。
const DEFAULT_OPTS = {
  engine: "ai",
  model: "isnet-general-use",
  alphaT: 128,
  bg: "white",
  fillHoles: true,
  outline: { thickness: 4, color: [255, 255, 255] },
};

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

// 各エッジから走査し、白い縁として透過化する。
//
// 単純な「比率閾値で stop」だと白残りが不連続だった場合 (例: 遅刻 Zeus は y=314 で
// 14% → 停止、その後 y=316,318 で再び 20-28% 残る) に取りこぼす。
//   → 「過去 M 行のうち、いずれかが threshold 以上なら継続」とする粘り強い走査に。
//   → さらに edge から N 行以内は常に走査範囲 (連続して低比率でも継続)。
function trimWhiteEdges(data, w, h, threshold = 0.1, persistRows = 4, minDepth = 4) {
  // R,G,B が全て 220 以上 = 視覚的に「白〜薄灰」。これより上を rembg が背景白の
  // 残骸として残してくるケースが多い。下げすぎると本来の白いハイライトを削るので
  // 220 で実験。
  const isNearWhite = (i) => data[i] >= 220 && data[i + 1] >= 220 && data[i + 2] >= 220;
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

  // 1 方向走査: from..to は inclusive、step は +1 / -1
  const scanRows = (from, to, step) => {
    const recent = [];
    let depth = 0;
    for (let y = from; step > 0 ? y <= to : y >= to; y += step, depth++) {
      const ratio = rowWhiteRatio(y);
      if (ratio >= threshold) stripRow(y);
      recent.push(ratio);
      if (recent.length > persistRows) recent.shift();
      // 最低 minDepth 行は強制継続。それ以降は、直近 persistRows がすべて threshold 未満なら停止。
      if (depth >= minDepth && recent.every(r => r < threshold)) break;
    }
  };
  const scanCols = (from, to, step) => {
    const recent = [];
    let depth = 0;
    for (let x = from; step > 0 ? x <= to : x >= to; x += step, depth++) {
      const ratio = colWhiteRatio(x);
      if (ratio >= threshold) stripCol(x);
      recent.push(ratio);
      if (recent.length > persistRows) recent.shift();
      if (depth >= minDepth && recent.every(r => r < threshold)) break;
    }
  };

  scanRows(0, h - 1, 1);
  scanRows(h - 1, 0, -1);
  scanCols(0, w - 1, 1);
  scanCols(w - 1, 0, -1);
}

// 外周から到達できない透過領域 (= 内部に出来た「孔」) を opaque に戻す。
// rembg が「目の白部」「歯の白部」等を背景白と誤判定して透過化する問題への対策。
function fillInteriorHoles(data, w, h) {
  const total = w * h;
  const reachable = new Uint8Array(total);
  const stack = [];
  const seed = (idx) => {
    if (!reachable[idx] && data[idx * 4 + 3] === 0) {
      reachable[idx] = 1;
      stack.push(idx);
    }
  };
  // 4 辺すべての透過ピクセルを seed
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + (w - 1)); }
  // BFS で外周から到達可能な透過領域を全て塗る
  while (stack.length) {
    const idx = stack.pop();
    const y = (idx / w) | 0;
    const x = idx - y * w;
    if (x > 0) seed(idx - 1);
    if (x < w - 1) seed(idx + 1);
    if (y > 0) seed(idx - w);
    if (y < h - 1) seed(idx + w);
  }
  // 透過なのに外周から到達できない = 内部の孔。alpha を 255 に。
  let filled = 0;
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] === 0 && !reachable[i]) {
      data[i * 4 + 3] = 255;
      filled++;
    }
  }
  return filled;
}

// アルファマスクの外側に N px の縁取りを足す (BFS で外周方向に拡張)。
// キャラクターも文字も alpha が立っているピクセル群の集合体なので、両方に同じ縁取り
// が掛かる。LINE スタンプは背景がチャット色 (青) の上に乗るため、白縁取りで視認性
// アップ + キャラ周囲に「シール感」が出る。
function addOutline(data, w, h, thickness, color) {
  const total = w * h;
  const dist = new Int32Array(total).fill(-1);
  const queue = [];
  // 透過ピクセルが「不透明ピクセル」と直接隣接していたら距離 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] > 0) continue; // 既に opaque はスキップ
      // 上下左右に opaque があれば seed
      let isEdge = false;
      if (x > 0 && data[(i - 1) * 4 + 3] > 0) isEdge = true;
      else if (x < w - 1 && data[(i + 1) * 4 + 3] > 0) isEdge = true;
      else if (y > 0 && data[(i - w) * 4 + 3] > 0) isEdge = true;
      else if (y < h - 1 && data[(i + w) * 4 + 3] > 0) isEdge = true;
      if (isEdge) {
        dist[i] = 1;
        queue.push(i);
      }
    }
  }
  // BFS で thickness まで広げる
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= thickness) continue;
    const y = (i / w) | 0;
    const x = i - y * w;
    const neighbors = [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y < h - 1 ? i + w : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0) continue;
      if (dist[ni] >= 0) continue;
      if (data[ni * 4 + 3] > 0) continue;
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }
  // 拡張ピクセルを color で塗りつぶす
  const [cr, cg, cb] = color;
  for (let i = 0; i < total; i++) {
    if (dist[i] > 0) {
      data[i * 4] = cr;
      data[i * 4 + 1] = cg;
      data[i * 4 + 2] = cb;
      data[i * 4 + 3] = 255;
    }
  }
}

async function finalizeSticker(srcPath, dstPath, opts, cropPath) {
  const { alphaT, bg, trimWhite, fillHoles, outline, preserveText } = opts;
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // preserveText: 元 crop の「文字 + エフェクト」相当ピクセルを強制的に opaque 保持。
  // rembg が「キャラ以外 = 背景」と判定して消してしまう、文字 (黒) と装飾エフェクト
  // (ハート♥、星✦、吹き出し等の色付き要素) の救済。
  //   - 暗ピクセル (R,G,B < darkThreshold)        → 黒文字
  //   - 彩度の高いピクセル (max-min > satThreshold) → 色付きエフェクト (ハート/星/吹き出し)
  // 白背景 (max,min とも >= whiteThreshold) は対象外。
  let cropData = null;
  if (preserveText) {
    const cropped = await sharp(cropPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (cropped.info.width === info.width && cropped.info.height === info.height) {
      cropData = cropped.data;
    }
  }
  const ptCfg = preserveText === true ? {} : (preserveText || {});
  const darkThreshold = ptCfg.darkThreshold ?? 100;
  const satThreshold = ptCfg.satThreshold ?? 40;
  const whiteThreshold = ptCfg.whiteThreshold ?? 240;

  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3];
    a = a >= alphaT ? 255 : 0;
    if (a > 0 && bg === "green") {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 25 && g > b + 25) a = 0;
    }
    if (a === 0 && cropData) {
      const cr = cropData[i], cg = cropData[i + 1], cb = cropData[i + 2];
      const maxC = Math.max(cr, cg, cb);
      const minC = Math.min(cr, cg, cb);
      const isDark = cr < darkThreshold && cg < darkThreshold && cb < darkThreshold;
      const isWhite = minC >= whiteThreshold;
      const isSaturated = !isWhite && (maxC - minC) > satThreshold;
      if (isDark || isSaturated) {
        data[i] = cr; data[i + 1] = cg; data[i + 2] = cb;
        a = 255;
      }
    }
    data[i + 3] = a;
  }
  if (fillHoles) fillInteriorHoles(data, info.width, info.height);
  if (trimWhite) trimWhiteEdges(data, info.width, info.height, 0.1, 4, 4);
  if (outline) {
    const cfg = outline === true ? {} : outline;
    const thickness = cfg.thickness ?? 4;
    const color = cfg.color ?? [255, 255, 255];
    addOutline(data, info.width, info.height, thickness, color);
  }
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
      await finalizeSticker(aiPath, dst, opts, path.join(inDir, f));
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
