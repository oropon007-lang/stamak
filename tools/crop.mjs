import sharp from "sharp";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Source images live in BoxSync (synced for backup); program lives outside it
// so it doesn't get reverted by sync events.
const ROOT = process.env.STAMAK_SOURCE_DIR || "/home/sasakiy/BoxSync/tool/stamak";
const OUT = path.resolve(import.meta.dirname, ".cache", "cropped");

// 切り出し設定。シートは下記いずれかで指定する:
//   - cols × rows + 任意の topCrop: 等間隔グリッド。topCrop は各セル上端から N px 削る (キャプション帯を除去)
//   - cells: [{left, top, width, height}, ...]: 個別セル (不規則レイアウト用)
// 共通オプション:
//   - file: ソースファイル名 (STAMAK_SOURCE_DIR 内)
//   - name: 出力サブディレクトリ名 (省略時はファイル basename)
const SHEETS = [
  { file: "ゴブリン_1.jpg",                cols: 6, rows: 4 },
  { file: "ゴブリン_2.jpg",                cols: 6, rows: 4 },
  { file: "下半身タイガー_1.jpg",          cols: 4, rows: 4 },
  { file: "下半身タイガー_2.jpg",          cols: 4, rows: 4 },
  { file: "ゆるタイガー_1.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "ゆるタイガー_2.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "ゆるタイガー_3.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "タイガタウルス_1.jpg",          cols: 4, rows: 4, topCrop: 80 },
  { file: "タイガタウルス_2.jpg",          cols: 4, rows: 4, topCrop: 80 },
  // 実体は 4列×5行=20枚 (rows:6 だと最下行に半端な切れ端が出る)。キャプションは
  // デザインの一部 (好き / ありがとう 等) なので topCrop しない。
  { file: "きゃわいいタイガタウルス.png",  cols: 4, rows: 5 },
  { file: "目の錯覚.jpg",                  cols: 3, rows: 3 },
  { file: "絶景.jpg",                      cols: 3, rows: 3 },
  { file: "遅刻には神罰を下す.jpg",        cols: 3, rows: 3 },
  { file: "ドット霊夢.png",                cols: 5, rows: 2, topCrop: 80 },
  { file: "ドット万理沙.png",              cols: 5, rows: 2, topCrop: 80 },
  // 残業.jpg: 1536×1024 の不規則 4+2+3 レイアウト。各セルを概算で指定 (rembg
  // が背景除去するので少し余裕を持たせる)。
  {
    file: "残業.jpg",
    cells: [
      { left: 0,    top: 0,   width: 384, height: 341 }, // NO残業!!
      { left: 384,  top: 0,   width: 384, height: 341 }, // 定時で帰る!
      { left: 768,  top: 0,   width: 384, height: 341 }, // 残業 (折れた斧)
      { left: 1152, top: 0,   width: 384, height: 341 }, // 断る!
      { left: 0,    top: 341, width: 768, height: 341 }, // 帰還する!! (馬上の騎士)
      { left: 768,  top: 341, width: 768, height: 341 }, // 残業バリア!! (魔法使い)
      { left: 0,    top: 682, width: 512, height: 342 }, // 仕事を砕け!! (OVERTIME)
      { left: 512,  top: 682, width: 512, height: 342 }, // こっそり退散
      { left: 1024, top: 682, width: 512, height: 342 }, // 自由を求めて!!
    ],
  },
];

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
  const { file, name } = sheet;
  const src = path.join(ROOT, file);
  const base = name || path.basename(file, path.extname(file)).replace(/[()]/g, "");
  const subdir = path.join(OUT, base);
  await mkdir(subdir, { recursive: true });

  const meta = await sharp(src).metadata();

  // 元画像のコピーをキャッシュに置く。postprocess が stickers/<sheet>/_source.<ext>
  // へ転送する。BoxSync 側の元 jpg/png をそのまま使うのではなく、リポジトリ内に
  // 持ち込むことで stamak だけ git clone しても UI が完結するようにする狙い。
  const sourceExt = path.extname(file);
  await copyFile(src, path.join(subdir, `_source${sourceExt}`));

  const cells = sheet.cells
    ? sheet.cells
    : gridToCells(meta, sheet.cols, sheet.rows, sheet.topCrop ?? 0);

  let n = 0;
  for (const { left, top, width, height } of cells) {
    n++;
    const idx = String(n).padStart(2, "0");
    const out = path.join(subdir, `${base}_${idx}.png`);
    await sharp(src).extract({ left, top, width, height }).png().toFile(out);
  }

  const layoutDesc = sheet.cells
    ? `cells×${cells.length}`
    : `${sheet.cols}x${sheet.rows} = ${sheet.cols * sheet.rows} stickers`;
  console.log(`${file}: ${layoutDesc} -> ${path.relative(ROOT, subdir)}/`);
}
