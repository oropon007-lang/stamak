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
  "遅刻には神罰を下す": { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true, preserveText: true },
  // 残業中世 / 残業ドラゴン: 白い吹き出し (背景は dark/colorful) が rembg に背景判定
  // されて穴が空く。restoreEnclosedWhite + keepOnlyNearAnchors:false で救う。
  // trimWhite は白の縁が消えるので無効化。
  "残業中世":     { engine: "ai", model: "birefnet-general", alphaT: 30, preserveText: true, restoreEnclosedWhite: { maxDist: 80 }, keepOnlyNearAnchors: false },
  "残業ドラゴン_1": { engine: "ai", model: "birefnet-general", alphaT: 30, preserveText: true, restoreEnclosedWhite: { maxDist: 80 }, keepOnlyNearAnchors: false },
  "残業ドラゴン_2": { engine: "ai", model: "birefnet-general", alphaT: 30, preserveText: true, restoreEnclosedWhite: { maxDist: 80 }, keepOnlyNearAnchors: false },
  "絶景":         { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true },
  // birefnet が一番マシ (一部キャプションを保持)。isnet-anime は全消し、isnet-general も
  // 全消しで使えない。残ったキャプション欠落は preserveText で「元 crop の暗ピクセル」を
  // 強制保持してカバー (きゃわいいは白背景 + 黒文字なので前提が成立)。
  // きゃわいい: 白服・白いお腹を保護
  "きゃわいいタイガタウルス": { engine: "ai", model: "birefnet-general", alphaT: 30, preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  // ゆるタイガー / タイガタウルス: 各 cell に黒文字キャプション + 色エフェクト
  // (ハート、ドロップ等)。rembg がそれらを「キャラ以外 = 背景」と判定して消す
  // ことがあるため preserveText で救う。topCrop は使わない方針。
  // タイガー系: 白いお腹・白いシャツ部分が rembg に背景判定されないように
  // restoreEnclosedWhite (4 方向 anchor 囲み判定) + keepOnlyNearAnchors:false。
  // whiteHoleMaxSize: 600 — キャラの脚の隙間等に閉じ込められた bg-white が
  // fillInteriorHoles で埋め戻されて「白残り」になる現象の抑制。目の白・歯の白等
  // (~100 px 以下) は埋まり、ベリーの白は restoreEnclosedWhite が個別に救う。
  "ゆるタイガー_1": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "ゆるタイガー_2": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "ゆるタイガー_3": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "タイガタウルス_1": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "タイガタウルス_2": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "下半身タイガー_1": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  "下半身タイガー_2": { preserveText: true, restoreEnclosedWhite: { maxDist: 60 }, keepOnlyNearAnchors: false, whiteHoleMaxSize: 600 },
  // ゴブリン: 目の白・歯等の小さな白に加え、_2 の布団・タオル・毛布等の大きな白い
  // 装備品を救う。maxDist 80 + requiredDirs 3 で、ファブリック内部の anchor が
  // 疎な場所まで restore が届くようにする。
  "ゴブリン_1": { preserveText: true, restoreEnclosedWhite: { maxDist: 80, requiredDirs: 3 }, whiteHoleMaxSize: 600 },
  "ゴブリン_2": { preserveText: true, restoreEnclosedWhite: { maxDist: 80, requiredDirs: 3 }, whiteHoleMaxSize: 600 },
  // 新規シート (2026-05): 白背景 + テキストを含むものは preserveText で text crisp 化
  "Slackでもつかえそう": { preserveText: true },
  "Slackでもつかえそう２": { preserveText: true },
  // 実写・イラスト系サラリーマン: 人物専用 u2net_human_seg で AI が人体全体 (白シャ
  // ツ含む) を認識。keepOnlyNearAnchors はオフ (シャツ中央は anchor から遠いので
  // 同機能だとシャツが透過化されてしまう)。preserveText でキャプション crisp 化。
  "うざサラリーマン":       { model: "u2net_human_seg", preserveText: true, keepOnlyNearAnchors: false },
  "おどるサラリーマン":     { model: "u2net_human_seg", preserveText: true, keepOnlyNearAnchors: false },
  "にちゃりサラリーマン_1": { model: "u2net_human_seg", preserveText: true, keepOnlyNearAnchors: false },
  "にちゃりサラリーマン_2": { model: "u2net_human_seg", preserveText: true, keepOnlyNearAnchors: false },
  // 必殺技: 暗背景 + ダメージ数字 + 必殺技イラスト。birefnet で本体抽出、テキスト保持。
  "必殺技": { engine: "ai", model: "birefnet-general", alphaT: 30, trimWhite: true, preserveText: true },
};
// fillHoles はデフォルト ON。rembg が目・歯等の白部を抜く問題を防ぐ。
// outline はデフォルト ON で白縁 4px。LINE のチャット背景に乗せた時の視認性向上と
// 「シール感」演出。文字 (キャプション) も alpha が立っていれば同じ縁取りが付く。
// removeFragments もデフォルト ON。隣接 sticker の切れ端 (尻尾の先、体の一部等)
// を透過化。ignoreLargestN: 2 で本体 + キャプションは保護、3 番目以降の小成分
// で外周接触のものだけ落とす。除去後の余白は trim() + resize() で詰める。
// keepOnlyNearAnchors: dark (文字輪郭) / saturated (キャラ色) ピクセルから maxDist
// ピクセル以内に届かない opaque を全て透過化。背景に薄く残る灰色 (煙・もや・
// テクスチャ等) を一掃する。preserveText が ON でキャラ色を確保できているシート
// で効果大。
const DEFAULT_OPTS = {
  engine: "ai",
  model: "isnet-general-use",
  alphaT: 128,
  bg: "white",
  fillHoles: true,
  outline: { thickness: 4, color: [255, 255, 255] },
  removeFragments: { maxFragmentRatio: 0.15, ignoreLargestN: 2 },
  keepOnlyNearAnchors: { maxDist: 8 },
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

// 「dark/saturated anchor」から maxDist ピクセル以内に到達できない opaque ピクセル
// を透過化する。背景にうっすら残る灰色装飾 (煙・もや・スパークル・薄い背景トーン
// など) はキャラから距離が空いている → 落ちる。キャラ本体の影 / 縁 / 内部は anchor
// に隣接しているので残る。
//   anchor = 元 crop ピクセルが
//     dark      (R,G,B 全て < 100)、または
//     saturated (max - min > 40)
//   その他の opaque ピクセル (中間灰色含む) は anchor からの BFS で到達できれば残す。
function keepOnlyNearAnchors(data, cropData, w, h, maxDist = 12) {
  if (!cropData) return 0;
  const total = w * h;
  const dist = new Uint8Array(total); // 0 = 未到達、1.. = anchor からの距離
  const queue = [];
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const cr = cropData[i * 4], cg = cropData[i * 4 + 1], cb = cropData[i * 4 + 2];
    const maxC = Math.max(cr, cg, cb);
    const minC = Math.min(cr, cg, cb);
    const isDark = cr < 100 && cg < 100 && cb < 100;
    const isSat = (maxC - minC) > 40;
    if (isDark || isSat) {
      dist[i] = 1;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const d = dist[idx];
    if (d >= maxDist) continue;
    const y = (idx / w) | 0;
    const x = idx - y * w;
    const ns = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ];
    for (const ni of ns) {
      if (ni < 0) continue;
      if (dist[ni] > 0) continue;
      if (data[ni * 4 + 3] === 0) continue;
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }
  let dropped = 0;
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] > 0 && dist[i] === 0) {
      data[i * 4 + 3] = 0;
      dropped++;
    }
  }
  return dropped;
}

// 「白い服 / 白い小物」など、rembg が背景と誤判定して透過にした白ピクセルを
// 救う処理。dark or saturated な anchor ピクセルが指定方向数以上から
// maxDist ピクセル以内に存在する白ピクセル (= キャラの中に「囲まれた」白) を
// 元 crop の RGB + opaque で復元する。
// 引数:
//   maxDist:      anchor までの最大距離 (px)
//   requiredDirs: 4 方向 (上下左右) のうち何方向に anchor が必要か (デフォルト 4 = 全方向)
//   whiteFloor:   元 crop の min(R,G,B) がこれ以上のピクセルだけ対象 (薄灰も拾うなら下げる)
function restoreEnclosedWhite(data, cropData, w, h, maxDist = 24, requiredDirs = 4, whiteFloor = 200) {
  if (!cropData) return 0;
  const total = w * h;
  // anchor: 元 crop が dark or saturated
  const isAnchor = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const ci = i * 4;
    const cr = cropData[ci], cg = cropData[ci + 1], cb = cropData[ci + 2];
    const maxC = Math.max(cr, cg, cb);
    const minC = Math.min(cr, cg, cb);
    if ((cr < 100 && cg < 100 && cb < 100) || (maxC - minC) > 40) isAnchor[i] = 1;
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let restored = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] !== 0) continue; // 既に opaque はスキップ
      const ci = i * 4;
      const cr = cropData[ci], cg = cropData[ci + 1], cb = cropData[ci + 2];
      if (Math.min(cr, cg, cb) < whiteFloor) continue; // 白系のみ対象
      // 4 方向で anchor の存在を確認
      let foundDirs = 0;
      for (const [dx, dy] of dirs) {
        for (let k = 1; k <= maxDist; k++) {
          const nx = x + dx * k, ny = y + dy * k;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
          if (isAnchor[ny * w + nx]) { foundDirs++; break; }
        }
      }
      if (foundDirs >= requiredDirs) {
        data[ci] = cr; data[ci + 1] = cg; data[ci + 2] = cb;
        data[ci + 3] = 255;
        restored++;
      }
    }
  }
  return restored;
}

// 外周に接していて、メイン本体より十分小さい連結成分 ("切れ端") を透過化する。
// 隣接 sticker のはみ出し残骸 (尻尾の先、体の一部、文字の端等) を除去する用途。
// 削除後は sharp の trim() で余白が落ちて、resize() で拡大されるので最終出力に
// 空きスペースは残らない。
//   maxFragmentRatio: 最大成分に対するサイズ比 (これ以下は切れ端候補)
//   ignoreLargestN:   保護する最大成分数 (デフォルト 1)。キャプションが主体と
//                     別成分の場合に 2-3 にしたいケースもある。
function removeEdgeFragments(data, w, h, maxFragmentRatio = 0.15, ignoreLargestN = 1) {
  const total = w * h;
  const label = new Int32Array(total);
  const sizes = [0]; // index 0 unused, components start at 1
  const touchesEdge = [false];
  let nextId = 1;

  for (let i = 0; i < total; i++) {
    if (label[i] !== 0) continue;
    if (data[i * 4 + 3] === 0) continue;
    // BFS flood-fill
    const stack = [i];
    label[i] = nextId;
    let size = 0;
    let edge = false;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const y = (idx / w) | 0;
      const x = idx - y * w;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) edge = true;
      const ns = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const ni of ns) {
        if (ni < 0) continue;
        if (label[ni] !== 0) continue;
        if (data[ni * 4 + 3] === 0) continue;
        label[ni] = nextId;
        stack.push(ni);
      }
    }
    sizes.push(size);
    touchesEdge.push(edge);
    nextId++;
  }

  if (nextId <= 1) return 0;

  // 大きい順の id を割り出す。最大 ignoreLargestN 個は無条件で保護。
  const ids = Array.from({ length: nextId - 1 }, (_, k) => k + 1).sort((a, b) => sizes[b] - sizes[a]);
  const maxSize = sizes[ids[0]];
  const protectedIds = new Set(ids.slice(0, ignoreLargestN));
  const sizeThreshold = maxSize * maxFragmentRatio;
  const toRemove = new Set();
  for (const id of ids) {
    if (protectedIds.has(id)) continue;
    if (touchesEdge[id] && sizes[id] < sizeThreshold) {
      toRemove.add(id);
    }
  }
  if (toRemove.size === 0) return 0;
  for (let i = 0; i < total; i++) {
    if (toRemove.has(label[i])) {
      data[i * 4 + 3] = 0;
    }
  }
  return toRemove.size;
}

// 外周から到達できない透過領域 (= 内部に出来た「孔」) を opaque に戻す。
// rembg が「目の白部」「歯の白部」等を背景白と誤判定して透過化する問題への対策。
// maxHoleSize: 1 孔あたりこのピクセル数以下のものだけを埋める。それを超える大きい
// 「穴」(例: ケーブル束の隙間、背景の大きな隙間) は元の透明のまま残す。
// cropData: 元 crop の RGBA。指定があればこちらの RGB を使って孔を埋める
// (rembg は透過ピクセルの RGB を (0,0,0) に置換するため、そのまま alpha=255 に
//  すると孔が「黒塗り」で出てしまう)。
// whiteHoleMaxSize: crop が大半 (>= 90%) 白系の「孔」について別途の小さい閾値。
// 指定するとこのサイズ超の白孔は埋めない (キャラの脚の隙間に閉じ込められた bg-white、
// 水面・吹き出し内側の白等の「白残り」が浮き上がるのを防ぐ)。null/未指定なら無効
// (= 通常の maxHoleSize ルールのみ)。
// 目の白・歯の白等の小さい白は引き続き埋まる。大きい白の塗りつぶし (belly/シャツ等)
// は restoreEnclosedWhite が 4 方向 anchor 検査で個別ピクセル単位に復元できる。
function fillInteriorHoles(data, w, h, maxHoleSize = 800, cropData = null, whiteHoleMaxSize = null) {
  const total = w * h;
  const reachable = new Uint8Array(total);
  let stack = [];
  const seed = (idx) => {
    if (!reachable[idx] && data[idx * 4 + 3] === 0) {
      reachable[idx] = 1;
      stack.push(idx);
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + (w - 1)); }
  while (stack.length) {
    const idx = stack.pop();
    const y = (idx / w) | 0;
    const x = idx - y * w;
    if (x > 0) seed(idx - 1);
    if (x < w - 1) seed(idx + 1);
    if (y > 0) seed(idx - w);
    if (y < h - 1) seed(idx + w);
  }
  // 透過 & 外周到達不可なピクセルを「孔」として、サイズで判定:
  // 小さい孔だけ alpha=255 で埋める。
  const visited = new Uint8Array(total);
  let filled = 0;
  for (let i = 0; i < total; i++) {
    if (visited[i] || reachable[i] || data[i * 4 + 3] !== 0) continue;
    const hole = [i];
    visited[i] = 1;
    const bfs = [i];
    while (bfs.length) {
      const idx = bfs.pop();
      const y = (idx / w) | 0;
      const x = idx - y * w;
      const ns = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const ni of ns) {
        if (ni < 0) continue;
        if (visited[ni] || reachable[ni]) continue;
        if (data[ni * 4 + 3] !== 0) continue;
        visited[ni] = 1;
        hole.push(ni);
        bfs.push(ni);
      }
    }
    if (hole.length > maxHoleSize) continue;
    // 「ほぼ白い」孔判定: crop の near-white (R,G,B >= 230) ピクセル比 >= 90%。
    // whiteHoleMaxSize が指定されている時のみ判定。該当孔はその閾値超なら埋めない。
    if (whiteHoleMaxSize != null && cropData) {
      let whiteSample = 0;
      for (const idx of hole) {
        const di = idx * 4;
        if (cropData[di] >= 230 && cropData[di + 1] >= 230 && cropData[di + 2] >= 230) whiteSample++;
      }
      if (whiteSample / hole.length >= 0.9 && hole.length > whiteHoleMaxSize) continue;
    }
    for (const idx of hole) {
      const di = idx * 4;
      data[di + 3] = 255;
      if (cropData) {
        data[di]     = cropData[di];
        data[di + 1] = cropData[di + 1];
        data[di + 2] = cropData[di + 2];
      }
      filled++;
    }
  }
  return filled;
}

// アルファマスクの外側に N px の縁取りを足す (BFS で外周方向に拡張)。
// キャラクターも文字も alpha が立っているピクセル群の集合体なので、両方に同じ縁取り
// が掛かる。LINE スタンプは背景がチャット色 (青) の上に乗るため、白縁取りで視認性
// アップ + キャラ周囲に「シール感」が出る。
//
// gapScan: 別 component の outline と merge して「白い帯」になる pixel を回避する
// ためのスキャン半径 (Manhattan)。指定すると、各 outline candidate について自分の
// 最近接 component とは異なる component の opaque ピクセルが gapScan 以内に居るか
// 走査し、居る場合は outline を打たない (= 透過のまま残す)。
// 推奨値 = 2 * thickness。gap が 2*thickness 以下の隙間では outline が完全に消え、
// それ以上の隙間では outline が少し短くなって中央に透明帯が出来る。
function addOutline(data, w, h, thickness, color, gapScan = null) {
  const total = w * h;

  // 1. 不透明ピクセルの連結成分ラベル。
  const componentId = new Int32Array(total);
  let numComps = 0;
  if (gapScan != null) {
    for (let i = 0; i < total; i++) {
      if (componentId[i] !== 0 || data[i * 4 + 3] === 0) continue;
      numComps++;
      componentId[i] = numComps;
      const stack = [i];
      while (stack.length) {
        const idx = stack.pop();
        const y = (idx / w) | 0;
        const x = idx - y * w;
        const ns = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
        ];
        for (const ni of ns) {
          if (ni < 0 || componentId[ni] !== 0 || data[ni * 4 + 3] === 0) continue;
          componentId[ni] = numComps;
          stack.push(ni);
        }
      }
    }
  }

  const dist = new Int32Array(total).fill(-1);
  const srcComp = gapScan != null ? new Int32Array(total) : null;
  const queue = [];
  // 透過ピクセルが「不透明ピクセル」と直接隣接していたら距離 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] > 0) continue; // 既に opaque はスキップ
      // 上下左右に opaque があれば seed
      let isEdge = false;
      let nearOpaque = -1;
      if (x > 0 && data[(i - 1) * 4 + 3] > 0) { isEdge = true; nearOpaque = i - 1; }
      else if (x < w - 1 && data[(i + 1) * 4 + 3] > 0) { isEdge = true; nearOpaque = i + 1; }
      else if (y > 0 && data[(i - w) * 4 + 3] > 0) { isEdge = true; nearOpaque = i - w; }
      else if (y < h - 1 && data[(i + w) * 4 + 3] > 0) { isEdge = true; nearOpaque = i + w; }
      if (isEdge) {
        dist[i] = 1;
        if (srcComp) srcComp[i] = componentId[nearOpaque];
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
      if (srcComp) srcComp[ni] = srcComp[i];
      queue.push(ni);
    }
  }
  // gapScan: 各 outline candidate で「別 component の opaque が gapScan 以内」を判定
  const isGap = gapScan != null ? new Uint8Array(total) : null;
  if (isGap) {
    for (let i = 0; i < total; i++) {
      if (dist[i] <= 0 || dist[i] > thickness) continue;
      const myComp = srcComp[i];
      const y = (i / w) | 0;
      const x = i - y * w;
      const maxR = gapScan;
      let found = false;
      // L1 (Manhattan) スキャン
      for (let dy = -maxR; dy <= maxR && !found; dy++) {
        const dxR = maxR - Math.abs(dy);
        for (let dx = -dxR; dx <= dxR; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (data[ni * 4 + 3] > 0 && componentId[ni] !== myComp) { found = true; break; }
        }
      }
      if (found) isGap[i] = 1;
    }
  }
  // 拡張ピクセルを color で塗りつぶす (gap pixel はスキップ)
  const [cr, cg, cb] = color;
  for (let i = 0; i < total; i++) {
    if (dist[i] > 0 && (!isGap || !isGap[i])) {
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
  // 暗ピクセル連結成分の最大サイズ。これ以下のものだけ「テキスト/輪郭」として
  // 保持対象に、これより大きいものは「背景の暗ブロブ (床、暗い盤面、影等)」として
  // 復元対象から除外。
  const maxDarkBlobSize = ptCfg.maxDarkBlobSize ?? 1500;

  // 事前に cropData の暗ピクセル連結成分を構築 (4-connected)。
  let darkBlobId = null;
  let darkBlobSizes = null;
  if (cropData) {
    const w = info.width, h = info.height, total = w * h;
    darkBlobId = new Int32Array(total);
    darkBlobSizes = [0];
    const isDarkCrop = (idx) => {
      const ci = idx * 4;
      return cropData[ci] < darkThreshold && cropData[ci + 1] < darkThreshold && cropData[ci + 2] < darkThreshold;
    };
    let nid = 1;
    for (let i = 0; i < total; i++) {
      if (darkBlobId[i] !== 0 || !isDarkCrop(i)) continue;
      const stack = [i];
      darkBlobId[i] = nid;
      let size = 0;
      while (stack.length) {
        const idx = stack.pop();
        size++;
        const y = (idx / w) | 0;
        const x = idx - y * w;
        const ns = [x > 0 ? idx - 1 : -1, x < w - 1 ? idx + 1 : -1, y > 0 ? idx - w : -1, y < h - 1 ? idx + w : -1];
        for (const ni of ns) {
          if (ni < 0 || darkBlobId[ni] !== 0 || !isDarkCrop(ni)) continue;
          darkBlobId[ni] = nid;
          stack.push(ni);
        }
      }
      darkBlobSizes.push(size);
      nid++;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3];
    a = a >= alphaT ? 255 : 0;
    if (a > 0 && bg === "green") {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 25 && g > b + 25) a = 0;
    }
    if (cropData) {
      const cr = cropData[i], cg = cropData[i + 1], cb = cropData[i + 2];
      const maxC = Math.max(cr, cg, cb);
      const minC = Math.min(cr, cg, cb);
      const isDark = cr < darkThreshold && cg < darkThreshold && cb < darkThreshold;
      const isWhite = minC >= whiteThreshold;
      const isSaturated = !isWhite && (maxC - minC) > satThreshold;
      // 暗ピクセルは「小さい連結成分」(= テキスト・キャラ輪郭) だけ復元対象に。
      // 巨大な暗ブロブ (= 背景の床・暗い機械盤面・大きな影等) は除外。
      const pixIdx = i >> 2; // bytes -> pixel index
      const blobOk = !isDark || (darkBlobId && darkBlobSizes[darkBlobId[pixIdx]] <= maxDarkBlobSize);
      if ((isSaturated || (isDark && blobOk))) {
        data[i] = cr; data[i + 1] = cg; data[i + 2] = cb;
        a = 255;
      }
    }
    data[i + 3] = a;
  }
  if (opts.keepOnlyNearAnchors && cropData) {
    const cfg = opts.keepOnlyNearAnchors === true ? {} : opts.keepOnlyNearAnchors;
    keepOnlyNearAnchors(data, cropData, info.width, info.height, cfg.maxDist ?? 12);
  }
  if (fillHoles) fillInteriorHoles(data, info.width, info.height, 800, cropData, opts.whiteHoleMaxSize ?? null);
  if (opts.restoreEnclosedWhite && cropData) {
    const cfg = opts.restoreEnclosedWhite === true ? {} : opts.restoreEnclosedWhite;
    restoreEnclosedWhite(
      data, cropData, info.width, info.height,
      cfg.maxDist ?? 24,
      cfg.requiredDirs ?? 4,
      cfg.whiteFloor ?? 200,
    );
  }
  if (trimWhite) trimWhiteEdges(data, info.width, info.height, 0.1, 4, 4);
  if (opts.removeFragments) {
    const fc = opts.removeFragments === true ? {} : opts.removeFragments;
    removeEdgeFragments(
      data, info.width, info.height,
      fc.maxFragmentRatio ?? 0.15,
      fc.ignoreLargestN ?? 2,
    );
  }
  if (outline) {
    const cfg = outline === true ? {} : outline;
    const thickness = cfg.thickness ?? 4;
    const color = cfg.color ?? [255, 255, 255];
    // gapScan: default = 2*thickness。別 component 同士の outline が merge して
    // 「白い帯」になるのを回避。null/0 で無効化。
    const gapScan = cfg.gapScan === undefined ? thickness * 2 : cfg.gapScan;
    addOutline(data, info.width, info.height, thickness, color, gapScan || null);
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
// CLI フィルタ: 引数で指定したシート名 (basename) のみ処理する。引数なしなら全件。
// --skip-rembg: rembg を再実行せず、キャッシュされた .cache/rembg を使って finalize だけ走らせる。
const cliArgs = process.argv.slice(2);
const skipRembg = cliArgs.includes("--skip-rembg");
const onlySheets = new Set(cliArgs.filter(a => !a.startsWith("--")));
let total = 0;
for (const d of subdirs) {
  if (COMPLETE_SHEETS.has(d.name)) {
    console.log(`${d.name}: SKIP (complete)`);
    continue;
  }
  if (onlySheets.size > 0 && !onlySheets.has(d.name)) continue;
  const opts = { ...DEFAULT_OPTS, ...(SHEET_OPTS[d.name] || {}) };
  const inDir = path.join(SRC, d.name);
  const outDir = path.join(DST, d.name);
  await mkdir(outDir, { recursive: true });

  if (opts.engine === "ai") {
    if (skipRembg) {
      process.stdout.write(`${d.name}: rembg(SKIPPED), finalizing... `);
    } else {
      process.stdout.write(`${d.name}: rembg(${opts.model})... `);
      const t0 = Date.now();
      await rembgSheet(d.name, opts.model);
      process.stdout.write(`${((Date.now() - t0) / 1000).toFixed(1)}s, finalizing... `);
    }
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
