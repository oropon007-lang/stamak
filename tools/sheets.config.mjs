/**
 * シート設定の単一情報源 (Single Source of Truth)。
 *
 * crop.mjs / postprocess.mjs / clear.mjs / ui の build-manifest が共有する。
 *
 * 1 シートあたりのフィールド:
 *   file        ソースファイル名 (STAMAK_SOURCE_DIR 内)
 *   name?       出力サブディレクトリ名 (省略時はファイル basename)
 *   cols, rows  等間隔グリッド (cells が無い場合に必要)
 *   topCrop?    各セル上端から N px 削る (キャプション帯除去)
 *   cells?      [{left, top, width, height}, ...] — 不規則レイアウト用、cols/rows より優先
 *   complete?   true なら「完成」扱い。crop/process/clear いずれもこのシートに触らない。
 *               一度 stickers/<name>/ に出力された内容が保護される。
 */

export const SHEETS = [
  { file: "ゴブリン_1.jpg",                cols: 6, rows: 4 },
  { file: "ゴブリン_2.jpg",                cols: 6, rows: 4 },
  { file: "下半身タイガー_1.jpg",          cols: 4, rows: 4 },
  { file: "下半身タイガー_2.jpg",          cols: 4, rows: 4 },
  { file: "ゆるタイガー_1.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "ゆるタイガー_2.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "ゆるタイガー_3.jpg",            cols: 4, rows: 4, topCrop: 80 },
  { file: "タイガタウルス_1.jpg",          cols: 4, rows: 4, topCrop: 80 },
  { file: "タイガタウルス_2.jpg",          cols: 4, rows: 4, topCrop: 80 },
  // きゃわいい: 4列5行 (842×1264) だがキャプション (例「無理しないで」「おつかれさま」)
  // が 1セル 210px より広いため隣セルに食い込む。横方向に少しオーバーラップさせた
  // cells: [] を使う (各セル幅 250、開始 0/200/400/600)。隣接セル間に 50px 共有領域
  // ができるが、キャラ中心は重ならず、キャプションが切れずに残る。
  {
    file: "きゃわいいタイガタウルス.png",
    cells: (() => {
      const cells = [];
      const xs = [0, 200, 400, 600];
      const ws = [250, 250, 250, 242]; // 最右は 600+242=842
      const rowH = 253;
      const totalH = 1264;
      for (let r = 0; r < 5; r++) {
        const top = r * rowH;
        const height = r === 4 ? totalH - top : rowH;
        for (let c = 0; c < 4; c++) {
          cells.push({ left: xs[c], top, width: ws[c], height });
        }
      }
      return cells;
    })(),
  },
  { file: "目の錯覚.jpg",                  cols: 3, rows: 3 },
  { file: "絶景.jpg",                      cols: 3, rows: 3 },
  { file: "遅刻には神罰を下す.jpg",        cols: 3, rows: 3 },
  { file: "ドット霊夢.png",                cols: 5, rows: 2, topCrop: 80, complete: true },
  { file: "ドット万理沙.png",              cols: 5, rows: 2, topCrop: 80, complete: true },
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

import path from "node:path";

export function sheetBasename(sheet) {
  return sheet.name || path.basename(sheet.file, path.extname(sheet.file)).replace(/[()]/g, "");
}
