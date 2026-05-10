import { readFile, rename, access } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAP_PATH = path.join(import.meta.dirname, "rename-map.json");
const STICKERS = path.join(ROOT, "stickers");

let map;
try {
  map = JSON.parse(await readFile(MAP_PATH, "utf-8"));
} catch {
  console.log("no rename-map.json — nothing to apply");
  process.exit(0);
}

let applied = 0, missing = 0;
for (const [from, to] of Object.entries(map)) {
  const src = path.join(STICKERS, from);
  const dst = path.join(STICKERS, path.dirname(from), to);
  try {
    await access(src);
    await rename(src, dst);
    applied++;
  } catch {
    missing++;
    console.log(`skipped (source not found): ${from}`);
  }
}
console.log(`renamed ${applied} files (${missing} skipped)`);
