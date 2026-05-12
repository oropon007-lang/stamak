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
  // タイガタウルス_1: キャプションは全 cell 上部横書きの統一レイアウト。
  { file: "タイガタウルス_1.jpg",          cols: 4, rows: 4, topCrop: 80 },
  // タイガタウルス_2: キャプション位置が cell ごとに違う (col 1,2 は上部横書き、
  // col 3,4 は縦書き側面)。topCrop を使うと縦書きが削れるため不使用。
  // preserveText でキャプション・色エフェクトの欠落を救う。
  { file: "タイガタウルス_2.jpg",          cols: 4, rows: 4 },
  // きゃわいい: white-bg シート。auto-cells でソース画像の content (非白) ピクセル
  // 分布から行/列ギャップを検出、各セルに tight bbox を取る。padX 等の固定値は不要。
  // colDensityRatio: 0.20 — 行1で 1 体だけ大きく前にせり出すタイガーが列ギャップを
  // 埋めて来るため、列の空き判定をかなり緩めにする必要がある。
  {
    file: "きゃわいいタイガタウルス.png",
    autoCells: "white-bg",
    // bboxPad: 余白を 20 px 取る。タイトすぎる crop だと rembg がキャプションを
    // 「キャラ以外 = 背景」と判定して消してしまうため、白い余白を残して context を
    // 与える。
    autoCellsOpts: { colDensityRatio: 0.30, bboxPad: 20, minCellWidth: 80 },
  },
  { file: "目の錯覚.jpg",                  cols: 3, rows: 3, complete: true },
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
