import { useState } from "react";
import manifest from "./manifest.json";
import "./App.css";

type Sheet = {
  name: string;
  stickers: string[];
  main: string | null;
  tab: string | null;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const stickerSrc = (sheet: string, file: string) =>
  `${BASE}/stickers/${encodeURIComponent(sheet)}/${encodeURIComponent(file)}`;

function App() {
  const sheets = manifest.sheets as Sheet[];
  const [active, setActive] = useState(sheets[0]?.name ?? "");
  const [zoomed, setZoomed] = useState<{ sheet: string; file: string } | null>(null);

  const sheet = sheets.find((s) => s.name === active);

  return (
    <div className="app">
      <header className="header">
        <h1>stamak</h1>
        <span className="count">{manifest.sheets.reduce((a: number, s: Sheet) => a + s.stickers.length, 0)} stickers · {sheets.length} sheets</span>
      </header>

      <nav className="tabs" role="tablist">
        {sheets.map((s) => (
          <button
            key={s.name}
            role="tab"
            aria-selected={active === s.name}
            className={`tab ${active === s.name ? "tab--active" : ""}`}
            onClick={() => setActive(s.name)}
            title={s.name}
          >
            {s.tab && <img src={stickerSrc(s.name, s.tab)} alt="" />}
            <span className="tab__name">{s.name}</span>
          </button>
        ))}
      </nav>

      {sheet && (
        <main className="main">
          <div className="sheet-header">
            {sheet.main && <img className="sheet-cover" src={stickerSrc(sheet.name, sheet.main)} alt="" />}
            <div>
              <h2>{sheet.name}</h2>
              <p>{sheet.stickers.length} stickers</p>
            </div>
          </div>
          <div className="grid">
            {sheet.stickers.map((file) => (
              <button
                key={file}
                className="sticker"
                onClick={() => setZoomed({ sheet: sheet.name, file })}
                title={file}
              >
                <img src={stickerSrc(sheet.name, file)} alt={file} loading="lazy" />
              </button>
            ))}
          </div>
        </main>
      )}

      {zoomed && (
        <div className="zoom" onClick={() => setZoomed(null)} role="dialog" aria-modal="true">
          <img src={stickerSrc(zoomed.sheet, zoomed.file)} alt={zoomed.file} />
          <div className="zoom__caption">{zoomed.sheet} / {zoomed.file}</div>
        </div>
      )}
    </div>
  );
}

export default App;
