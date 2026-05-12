import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@ui-catalog/core/utils";

export interface SheetCarouselItem {
  id: string;
  label: string;
  imageSrc: string | null;
  /** 完成済 (右上に ✓ バッジ + 緑枠) */
  complete?: boolean;
}

export interface SheetCarouselProps {
  items: SheetCarouselItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  /** Sticky to top of viewport (offset = top). Default false. */
  sticky?: boolean;
  /** Top offset in px when sticky. */
  stickyTop?: number;
}

/**
 * 横スクロールのシートピッカー。
 * - scroll-snap で 1 セルずつ吸着
 * - active セルは中央に自動スクロール
 * - 左右の overflow に応じて矢印ボタン表示
 * - ←/→ キーでフォーカス移動
 * - 縦スクロール (wheel) を横に変換
 */
export function SheetCarousel({
  items,
  activeId,
  onSelect,
  className,
  sticky = false,
  stickyTop = 0,
}: SheetCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, items.length]);

  // Auto-scroll active into view (on activeId change).
  useEffect(() => {
    if (!activeId) return;
    const node = itemRefs.current.get(activeId);
    if (node) node.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // Wheel: convert vertical to horizontal so trackpad/mouse wheel scroll the strip.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  // Keyboard: ←/→ moves selection.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = items.findIndex((i) => i.id === activeId);
    if (idx < 0) return;
    const next = e.key === "ArrowRight" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (next !== idx) onSelect(items[next].id);
  };

  return (
    <div
      data-component="sheet-carousel"
      className={cn(
        "relative bg-white/80 backdrop-blur-sm",
        sticky && "sticky z-10",
        className,
      )}
      style={sticky ? { top: stickyTop } : undefined}
      role="tablist"
      aria-label="シート"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <button
        type="button"
        aria-label="前へ"
        className={cn(
          "absolute left-1 top-1/2 -translate-y-1/2 z-10",
          "h-8 w-8 rounded-full border border-gray-200 bg-white/95 shadow-sm",
          "flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-white",
          "transition-opacity",
          !canLeft && "opacity-0 pointer-events-none",
        )}
        onClick={() => scrollByPage(-1)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div
        ref={trackRef}
        className={cn(
          "flex gap-2 overflow-x-auto px-3 py-2",
          "snap-x snap-mandatory scroll-smooth",
          "[scrollbar-width:thin]",
        )}
        onWheel={onWheel}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onSelect(item.id)}
              title={item.complete ? `${item.label} (完成)` : item.label}
              className={cn(
                "relative shrink-0 snap-center w-[88px] flex flex-col items-center gap-1 px-1.5 py-2",
                "rounded-xl border-2 bg-white text-[11px] cursor-pointer",
                "transition-[background,border-color,color,transform] duration-100",
                isActive && !item.complete && "border-emerald-500 bg-emerald-50 text-gray-900",
                isActive && item.complete && "border-emerald-600 bg-emerald-100 text-gray-900",
                !isActive && item.complete && "border-emerald-400 text-gray-700",
                !isActive && !item.complete && "border-gray-200 text-gray-500 hover:bg-gray-50",
              )}
            >
              {item.complete && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm ring-2 ring-white"
                  title="完成"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
              {item.imageSrc ? (
                <img
                  src={item.imageSrc}
                  alt=""
                  className={cn(
                    "h-[50px] w-16 object-contain rounded-md",
                    isActive ? "bg-white" : "bg-gray-50",
                  )}
                />
              ) : (
                <div className="h-[50px] w-16 rounded-md bg-gray-100" />
              )}
              <span className="w-full truncate text-center">{item.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="次へ"
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 z-10",
          "h-8 w-8 rounded-full border border-gray-200 bg-white/95 shadow-sm",
          "flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-white",
          "transition-opacity",
          !canRight && "opacity-0 pointer-events-none",
        )}
        onClick={() => scrollByPage(1)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
