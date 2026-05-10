// Scans ../stickers/ and writes src/manifest.json describing each sheet.
// Run before vite build/dev so the React app knows what to render.
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SHEETS, sheetBasename } from "../../tools/sheets.config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const STICKERS = path.resolve(ROOT, "..", "stickers");
const OUT = path.resolve(ROOT, "src", "manifest.json");

// 完成扱いシートの集合 (UI で badge 表示するため manifest に含める)
const completeSet = new Set(SHEETS.filter(s => s.complete).map(sheetBasename));

const sheets = [];
const dirs = (await readdir(STICKERS, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
for (const name of dirs) {
  const files = (await readdir(path.join(STICKERS, name))).sort();
  const stickers = files.filter(
    f => f.endsWith(".png") && f !== "main.png" && f !== "tab.png" && !f.startsWith("_source."),
  );
  const hasMain = files.includes("main.png");
  const hasTab = files.includes("tab.png");
  const source = files.find(f => f.startsWith("_source.")) ?? null;
  sheets.push({
    name,
    stickers,
    main: hasMain ? "main.png" : null,
    tab: hasTab ? "tab.png" : null,
    source,
    complete: completeSet.has(name),
  });
}

await writeFile(OUT, JSON.stringify({ sheets }, null, 2));
console.log(`manifest written: ${sheets.length} sheets, ${sheets.reduce((a, s) => a + s.stickers.length, 0)} stickers, ${sheets.filter(s => s.complete).length} complete`);
