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
  complete: boolean;
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

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setZoomed(null); return; }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const z = sheets.find((s) => s.name === zoomed.sheet);
      if (!z) return;
      const isMeta = zoomed.file === z.main || zoomed.file === z.tab || zoomed.file === z.source;
      const list = isMeta
        ? ([z.main, z.tab, z.source].filter(Boolean) as string[])
        : z.stickers;
      const idx = list.indexOf(zoomed.file);
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const ni = idx + delta;
      if (ni >= 0 && ni < list.length) {
        e.preventDefault();
        setZoomed({ sheet: zoomed.sheet, file: list[ni] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, sheets]);

  const sheet = sheets.find((s) => s.name === active);
  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
  const bgStyle = { ["--sticker-bg" as string]: bg.style } as React.CSSProperties;

  const carouselItems = useMemo(
    () =>
      sheets.map((s) => ({
        id: s.name,
        label: s.name,
        imageSrc: s.tab ? stickerSrc(s.name, s.tab) : null,
        complete: s.complete,
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
        <main className={`main ${sheet.complete ? "main--complete" : ""}`}>
          <div className="sheet-header">
            {sheet.main && <img className="sheet-cover" src={stickerSrc(sheet.name, sheet.main)} alt="" />}
            <div>
              <h2>
                {sheet.name}
                {sheet.complete && <span className="badge-complete" title="完成: パイプラインで再処理されません">✓ 完成</span>}
              </h2>
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

      {zoomed && (() => {
        const zSheet = sheets.find((s) => s.name === zoomed.sheet);
        if (!zSheet) return null;
        const isMeta = zoomed.file === zSheet.main || zoomed.file === zSheet.tab || zoomed.file === zSheet.source;
        const list = isMeta
          ? ([zSheet.main, zSheet.tab, zSheet.source].filter(Boolean) as string[])
          : zSheet.stickers;
        const idx = list.indexOf(zoomed.file);
        const go = (delta: -1 | 1) => {
          const ni = idx + delta;
          if (ni >= 0 && ni < list.length) setZoomed({ sheet: zoomed.sheet, file: list[ni] });
        };
        const stop = (e: React.MouseEvent) => e.stopPropagation();
        return (
          <div className="zoom" onClick={() => setZoomed(null)} role="dialog" aria-modal="true">
            <button
              type="button"
              className="zoom__nav zoom__nav--prev"
              onClick={(e) => { stop(e); go(-1); }}
              disabled={idx <= 0}
              aria-label="前へ"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="zoom__frame" onClick={stop}>
              <img src={stickerSrc(zoomed.sheet, zoomed.file)} alt={zoomed.file} />
              <a
                className="zoom__download"
                href={stickerSrc(zoomed.sheet, zoomed.file)}
                download={zoomed.file}
                onClick={stop}
                aria-label="ダウンロード"
                title="ダウンロード"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v12" />
                  <polyline points="6 12 12 18 18 12" />
                  <line x1="4" y1="20" x2="20" y2="20" />
                </svg>
              </a>
            </div>
            <button
              type="button"
              className="zoom__nav zoom__nav--next"
              onClick={(e) => { stop(e); go(1); }}
              disabled={idx >= list.length - 1}
              aria-label="次へ"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <div className="zoom__caption">{zoomed.sheet} / {zoomed.file} <span className="zoom__counter">({idx + 1}/{list.length})</span></div>
            <div className="zoom__strip" onClick={stop}>
              {list.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`zoom__thumb ${f === zoomed.file ? "zoom__thumb--active" : ""}`}
                  onClick={() => setZoomed({ sheet: zoomed.sheet, file: f })}
                  title={f}
                >
                  <img src={stickerSrc(zoomed.sheet, f)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
