/**
 * 白背景のシート画像から、各 sticker の cell 座標を自動検出する。
 *
 * ロジック:
 *   1. ピクセル毎に「content (非白)」を判定
 *   2. 各 y 行の content ピクセル数 (rowDensity) を集計
 *   3. rowDensity がしきい値未満の連続区間 = 行ギャップ。これで行領域を分割
 *   4. 各行領域について、その範囲内で各 x 列の content ピクセル数 (colDensity) を集計
 *   5. colDensity の低密度区間 = 列ギャップ。これで列領域を分割
 *   6. 各 (行領域 × 列領域) について content ピクセルの tight bbox を計算
 *   7. tight bbox を sticker cell として返す
 *
 * これにより:
 *   - キャプション幅やキャラ幅が cell ごとに異なっても、tight bbox で完全に追従
 *   - 行/列の境界も手測定不要
 *
 * 非白背景シート (絶景、残業 等) には不向き。
 */

import sharp from "sharp";

/**
 * @param {string} srcPath
 * @param {object} opts
 * @param {number} [opts.whiteThreshold=240]  R,G,B >= これで「白」扱い
 * @param {number} [opts.rowMinGap=5]         行ギャップとして認める最小連続行数
 * @param {number} [opts.colMinGap=5]         列ギャップとして認める最小連続列数
 * @param {number} [opts.rowDensityRatio=0.05] 1行あたり content ピクセル < 全幅 × これ → 空行扱い
 * @param {number} [opts.colDensityRatio=0.05] 1列あたり content ピクセル < 行高 × これ → 空列扱い
 * @param {number} [opts.bboxPad=4]            tight bbox の四方向にこの px ぶん余裕を付ける
 * @param {number} [opts.minCellWidth=40]      これ未満の幅の cell は破棄 (ノイズ)
 * @param {number} [opts.minCellHeight=40]
 * @returns {Promise<{left,top,width,height}[]>}
 */
export async function autoDetectCellsByWhiteBg(srcPath, opts = {}) {
  const {
    whiteThreshold = 240,
    rowMinGap = 5,
    colMinGap = 5,
    rowDensityRatio = 0.05,
    colDensityRatio = 0.05,
    bboxPad = 4,
    minCellWidth = 40,
    minCellHeight = 40,
  } = opts;

  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  const isContent = (i) =>
    !(data[i] >= whiteThreshold && data[i + 1] >= whiteThreshold && data[i + 2] >= whiteThreshold);

  // 行密度
  const rowDensity = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const yw4 = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (isContent(yw4 + x * 4)) c++;
    }
    rowDensity[y] = c;
  }

  const rowRegions = splitByGaps(rowDensity, w * rowDensityRatio, rowMinGap);

  // 列の境界は「行ごとに」検出する。同じ行内でも、長いキャプション (例「無理しないで」)
  // が伸びていれば その行だけ col 2 cell が広めに取られる、という挙動になる。
  const cells = [];
  for (const { start: yStart, end: yEnd } of rowRegions) {
    const rowH = yEnd - yStart + 1;
    const colDensity = new Array(w).fill(0);
    for (let y = yStart; y <= yEnd; y++) {
      const yw4 = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (isContent(yw4 + x * 4)) colDensity[x]++;
      }
    }
    const colRegions = splitByGaps(colDensity, rowH * colDensityRatio, colMinGap);

    for (const { start: xStart, end: xEnd } of colRegions) {
      const bbox = tightBbox(data, w, xStart, xEnd, yStart, yEnd, isContent);
      if (!bbox) continue;
      const left = Math.max(0, bbox.minX - bboxPad);
      const top = Math.max(0, bbox.minY - bboxPad);
      const width = Math.min(w - left, bbox.maxX - bbox.minX + 1 + 2 * bboxPad);
      const height = Math.min(h - top, bbox.maxY - bbox.minY + 1 + 2 * bboxPad);
      if (width < minCellWidth || height < minCellHeight) continue; // ノイズ除去
      cells.push({ left, top, width, height });
    }
  }

  return cells;
}

/**
 * density 配列を「低密度ギャップ」で区切って、content 領域の {start, end} 配列を返す。
 */
function splitByGaps(density, lowThreshold, minGapLen) {
  const regions = [];
  let regionStart = -1;
  let lowRunStart = -1;
  for (let i = 0; i < density.length; i++) {
    const low = density[i] <= lowThreshold;
    if (!low) {
      if (regionStart < 0) regionStart = i;
      if (lowRunStart >= 0 && (i - lowRunStart) >= minGapLen) {
        // 直前の領域を確定
        if (regionStart < lowRunStart) regions.push({ start: regionStart, end: lowRunStart - 1 });
        regionStart = i;
      }
      lowRunStart = -1;
    } else {
      if (lowRunStart < 0) lowRunStart = i;
    }
  }
  // 末尾処理
  if (regionStart >= 0) {
    let end = density.length - 1;
    if (lowRunStart >= 0) end = lowRunStart - 1;
    if (regionStart <= end) regions.push({ start: regionStart, end });
  }
  return regions;
}

function tightBbox(data, w, x0, x1, y0, y1, isContent) {
  let minX = x1, maxX = x0, minY = y1, maxY = y0, found = false;
  for (let y = y0; y <= y1; y++) {
    const yw4 = y * w * 4;
    for (let x = x0; x <= x1; x++) {
      if (isContent(yw4 + x * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }
  return found ? { minX, maxX, minY, maxY } : null;
}
