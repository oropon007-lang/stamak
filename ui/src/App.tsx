import { useEffect, useMemo, useState } from "react";
import manifest from "./manifest.json";
import { SheetCarousel } from "./ui/molecules/SheetCarousel";
import "./App.css";

type Sheet = {
  name: string;
  stickers: string[];
  main: string | null;
  tab: string | null;
  source: string | null;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const stickerSrc = (sheet: string, file: string) =>
  `${BASE}/stickers/${encodeURIComponent(sheet)}/${encodeURIComponent(file)}`;

type Background = { id: string; label: string; style: string };

// 背景プリセット。LINE のチャット背景を意識した薄ブルーを既定に。
// `style` は CSS の `background` 値そのもの。
const BACKGROUNDS: Background[] = [
  { id: "line-blue",  label: "LINE風ブルー", style: "#8CABD9" },
  { id: "line-green", label: "LINE風グリーン", style: "#A8C99B" },
  {
    id: "dots",
    label: "ドット",
    style:
      "#fafbfc url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='1.4' fill='%23000' opacity='0.10'/></svg>\")",
  },
  {
    id: "checker",
    label: "チェッカー",
    style:
      "repeating-conic-gradient(#dcdfe4 0% 25%, #f3f5f8 0% 50%) 0 / 16px 16px",
  },
  { id: "white", label: "白", style: "#ffffff" },
];

const BG_STORAGE_KEY = "stamak.bg";

function App() {
  const sheets = manifest.sheets as Sheet[];
  const [active, setActive] = useState(sheets[0]?.name ?? "");
  const [zoomed, setZoomed] = useState<{ sheet: string; file: string } | null>(null);
  const [bgId, setBgId] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(BG_STORAGE_KEY) : null;
    return BACKGROUNDS.some((b) => b.id === saved) ? (saved as string) : BACKGROUNDS[0].id;
  });

  useEffect(() => {
    localStorage.setItem(BG_STORAGE_KEY, bgId);
  }, [bgId]);

  const sheet = sheets.find((s) => s.name === active);
  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
  const bgStyle = { ["--sticker-bg" as string]: bg.style } as React.CSSProperties;

  const carouselItems = useMemo(
    () =>
      sheets.map((s) => ({
        id: s.name,
        label: s.name,
        imageSrc: s.tab ? stickerSrc(s.name, s.tab) : null,
      })),
    [sheets],
  );

  return (
    <div className="app" style={bgStyle}>
      <header className="header">
        <h1>stamak</h1>
        <span className="count">{manifest.sheets.reduce((a: number, s: Sheet) => a + s.stickers.length, 0)} stickers · {sheets.length} sheets</span>
      </header>

      <div className="bg-picker" role="radiogroup" aria-label="背景">
        <span className="bg-picker__label">背景</span>
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            role="radio"
            aria-checked={bgId === b.id}
            className={`bg-chip ${bgId === b.id ? "bg-chip--active" : ""}`}
            onClick={() => setBgId(b.id)}
            title={b.label}
          >
            <span className="bg-chip__swatch" style={{ background: b.style }} />
            <span className="bg-chip__name">{b.label}</span>
          </button>
        ))}
      </div>

      <SheetCarousel
        items={carouselItems}
        activeId={active}
        onSelect={setActive}
        sticky
        stickyTop={0}
        className="mb-3"
      />


      {sheet && (
        <main className="main">
          <div className="sheet-header">
            {sheet.main && <img className="sheet-cover" src={stickerSrc(sheet.name, sheet.main)} alt="" />}
            <div>
              <h2>{sheet.name}</h2>
              <p>{sheet.stickers.length} stickers</p>
            </div>
          </div>

          <details className="sheet-meta">
            <summary>シートの構成 (main / tab / source)</summary>
            <div className="sheet-meta__grid">
              {sheet.main && (
                <button
                  type="button"
                  className="meta-tile"
                  onClick={() => setZoomed({ sheet: sheet.name, file: sheet.main! })}
                  title={`main (${sheet.main})`}
                >
                  <img src={stickerSrc(sheet.name, sheet.main)} alt="" />
                  <span className="meta-tile__label">main <small>240×240</small></span>
                </button>
              )}
              {sheet.tab && (
                <button
                  type="button"
                  className="meta-tile"
                  onClick={() => setZoomed({ sheet: sheet.name, file: sheet.tab! })}
                  title={`tab (${sheet.tab})`}
                >
                  <img src={stickerSrc(sheet.name, sheet.tab)} alt="" />
                  <span className="meta-tile__label">tab <small>96×74</small></span>
                </button>
              )}
              {sheet.source && (
                <button
                  type="button"
                  className="meta-tile meta-tile--wide"
                  onClick={() => setZoomed({ sheet: sheet.name, file: sheet.source! })}
                  title={`source (${sheet.source})`}
                >
                  <img src={stickerSrc(sheet.name, sheet.source)} alt="" />
                  <span className="meta-tile__label">source <small>元一枚絵</small></span>
                </button>
              )}
            </div>
          </details>

          <div className="grid">
            {sheet.stickers.map((file) => (
              <div key={file} className="sticker-tile">
                <button
                  className="sticker"
                  onClick={() => setZoomed({ sheet: sheet.name, file })}
                  title={file}
                >
                  <img src={stickerSrc(sheet.name, file)} alt={file} loading="lazy" />
                </button>
                <a
                  className="sticker__download"
                  href={stickerSrc(sheet.name, file)}
                  download={file}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${file} をダウンロード`}
                  title="ダウンロード"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v12" />
                    <polyline points="6 12 12 18 18 12" />
                    <line x1="4" y1="20" x2="20" y2="20" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </main>
      )}

      {zoomed && (
        <div className="zoom" onClick={() => setZoomed(null)} role="dialog" aria-modal="true">
          <div className="zoom__frame">
            <img src={stickerSrc(zoomed.sheet, zoomed.file)} alt={zoomed.file} />
          </div>
          <div className="zoom__caption">{zoomed.sheet} / {zoomed.file}</div>
        </div>
      )}
    </div>
  );
}

export default App;
