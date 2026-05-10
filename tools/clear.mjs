/**
 * 完成 (complete: true) シートを保護しつつ削除する。
 *
 *   --stickers   stickers/<basename>/ を削除 (非完成シートのみ)
 *   --cache      .cache/ 全体を削除 (常に安全、中間生成物のため)
 *   (引数なし)   両方
 */

import { rm } from "node:fs/promises";
import path from "node:path";
import { SHEETS, sheetBasename } from "./sheets.config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const STICKERS = path.join(ROOT, "stickers");
const CACHE = path.join(import.meta.dirname, ".cache");

const args = process.argv.slice(2);
const onlyStickers = args.includes("--stickers");
const onlyCache = args.includes("--cache");
const both = !onlyStickers && !onlyCache;

const completeNames = new Set(
  SHEETS.filter(s => s.complete).map(s => sheetBasename(s))
);
const removableNames = SHEETS
  .filter(s => !s.complete)
  .map(s => sheetBasename(s));

if (both || onlyStickers) {
  for (const name of removableNames) {
    await rm(path.join(STICKERS, name), { recursive: true, force: true });
  }
  if (completeNames.size > 0) {
    console.log(`stickers: kept complete (${[...completeNames].join(", ")})`);
  } else {
    console.log("stickers: cleared");
  }
}

if (both || onlyCache) {
  await rm(CACHE, { recursive: true, force: true });
  console.log("cache: cleared");
}
