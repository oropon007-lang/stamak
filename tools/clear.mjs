/**
 * 完成 (complete: true) シート以外を削除する。
 *
 *   --stickers   stickers/ 内の "完成以外の" ディレクトリ全削除
 *                (= 現 SHEETS 設定にあって非完成 + 設定にもう無い orphan = リネーム残骸)
 *   --cache      .cache/ 全体を削除 (常に安全、中間生成物のため)
 *   (引数なし)   両方
 */

import { rm, readdir } from "node:fs/promises";
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

if (both || onlyStickers) {
  let removed = 0;
  let kept = 0;
  try {
    const entries = await readdir(STICKERS, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (completeNames.has(ent.name)) { kept++; continue; }
      await rm(path.join(STICKERS, ent.name), { recursive: true, force: true });
      removed++;
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const completeList = [...completeNames].join(", ");
  console.log(`stickers: removed ${removed} dir(s), kept ${kept} complete${completeList ? ` (${completeList})` : ""}`);
}

if (both || onlyCache) {
  await rm(CACHE, { recursive: true, force: true });
  console.log("cache: cleared");
}
