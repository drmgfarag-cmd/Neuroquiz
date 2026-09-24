/**
 * Built-in image viewer for radiology images, figures, tables and crops.
 *
 * Any <img data-zoomable> opens it. All zoomable images inside the nearest
 * [data-gallery] container (e.g. one question with its options and
 * explanation) become the navigable set.
 *
 * Zoom: wheel, pinch, double-click/tap, +/- keys, buttons.  Pan: drag.
 * Navigate: ←/→, swipe (when not zoomed), thumbnails.
 * Adjust: brightness/contrast sliders or window/level drag, invert, rotate,
 * flip.  "Dock" keeps the viewer open beside the question on wide screens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface ViewerItem {
  src: string;
  caption?: string;
}

interface ViewerApi {
  open: (items: ViewerItem[], index: number) => void;
  close: () => void;
  /** When docked, reload the image set from a container (call after the question changes). */
  refreshDocked: (root: HTMLElement | null) => void;
  isOpen: boolean;
  docked: boolean;
}

/** Lets non-React code (Android back button) close an open viewer. */
let closeActive: (() => void) | null = null;
export function closeOpenViewer(): boolean {
  if (!closeActive) return false;
  closeActive();
  return true;
}

const ViewerContext = createContext<ViewerApi>({ open: () => {}, close: () => {}, refreshDocked: () => {}, isOpen: false, docked: false });
export const useViewer = () => useContext(ViewerContext);

/** Collect viewer items from zoomable images inside a container, in DOM order. */
export function collectImages(root: ParentNode): ViewerItem[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img[data-zoomable]"))
    .filter((img, i, all) => !!img.getAttribute("src") && all.findIndex((x) => x.src === img.src) === i)
    .map((img) => ({ src: img.src, caption: img.dataset.caption || undefined }));
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ViewerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [openState, setOpen] = useState(false);
  const [docked, setDocked] = useState(false);

  const open = useCallback((list: ViewerItem[], i: number) => {
    if (!list.length) return;
    setItems(list);
    setIndex(Math.max(0, Math.min(i, list.length - 1)));
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setDocked(false);
  }, []);
  const refreshDocked = useCallback(
    (root: HTMLElement | null) => {
      if (!docked || !root) return;
      const list = collectImages(root);
      if (!list.length) return; // keep the last images visible
      setItems((prev) => (prev.length === list.length && prev.every((p, i) => p.src === list[i].src) ? prev : list));
      setIndex((i) => (i < list.length ? i : 0));
    },
    [docked]
  );

  // One delegated click handler for every zoomable image in the app.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest?.("img[data-zoomable]") as HTMLImageElement | null;
      if (!img || !img.getAttribute("src")) return;
      e.preventDefault();
      const root = img.closest("[data-gallery]") ?? img.parentElement!;
      const list = collectImages(root);
      const i = list.findIndex((x) => x.src === img.src);
      open(list.length ? list : [{ src: img.src, caption: img.dataset.caption }], Math.max(0, i));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  useEffect(() => {
    closeActive = openState ? close : null;
    document.body.classList.toggle("viewer-docked", openState && docked);
    document.body.classList.toggle("viewer-modal", openState && !docked);
  }, [openState, docked, close]);

  const api = useMemo(() => ({ open, close, refreshDocked, isOpen: openState, docked }), [open, close, refreshDocked, openState, docked]);

  return (
    <ViewerContext.Provider value={api}>
      {children}
      {openState && items.length > 0 && (
        <Viewer items={items} index={index} setIndex={setIndex} docked={docked} setDocked={setDocked} onClose={close} />
      )}
    </ViewerContext.Provider>
  );
}

// ---------------------------------------------------------------------------

interface View {
  scale: number;
  x: number;
  y: number;
  rotate: number;
  flip: boolean;
  brightness: number; // 1 = unchanged
  contrast: number;
  invert: boolean;
}

const DEFAULT_VIEW: View = { scale: 1, x: 0, y: 0, rotate: 0, flip: false, brightness: 1, contrast: 1, invert: false };
const MIN_SCALE = 1;
const MAX_SCALE = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Viewer({
  items,
  index,
  setIndex,
  docked,
  setDocked,
  onClose
}: {
  items: ViewerItem[];
  index: number;
  setIndex: (i: number) => void;
  docked: boolean;
  setDocked: (d: boolean) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [tool, setTool] = useState<"pan" | "wl">("pan");
  const [showAdjust, setShowAdjust] = useState(false);
  const [loaded, setLoaded] = useState<{ src: string; w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; view: View; dist?: number; mid?: { x: number; y: number }; moved: boolean; t: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const item = items[index];
  const natural = loaded && loaded.src === item.src ? loaded : null;
  const canDock = typeof window !== "undefined" && window.innerWidth >= 1000;

  // new image → reset geometry but keep brightness/contrast/invert (handy for a series)
  useEffect(() => {
    setView((v) => ({ ...DEFAULT_VIEW, brightness: v.brightness, contrast: v.contrast, invert: v.invert }));
  }, [item.src]);

  const go = useCallback((d: number) => setIndex((index + d + items.length) % items.length), [index, items.length, setIndex]);

  /** Zoom to `next` keeping the stage point (px, py) (relative to stage centre) fixed. */
  const zoomAt = useCallback((next: number, px = 0, py = 0) => {
    setView((v) => {
      const s = clamp(next, MIN_SCALE, MAX_SCALE);
      if (s === 1) return { ...v, scale: 1, x: 0, y: 0 };
      const k = s / v.scale;
      return { ...v, scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const stagePoint = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  /** Scale at which the image is shown at its native pixel size. */
  const nativeScale = () => {
    const img = imgRef.current;
    if (!img || !natural) return 2;
    const shown = img.getBoundingClientRect().width / view.scale;
    return shown ? natural.w / shown : 2;
  };

  // keyboard (captured so the page underneath doesn't also react)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !/^(range|checkbox|radio|button)$/.test((t as HTMLInputElement).type));
      if (typing && e.key !== "Escape") return;
      const map: Record<string, () => void> = {
        Escape: onClose,
        "+": () => zoomAt(view.scale * 1.4),
        "=": () => zoomAt(view.scale * 1.4),
        "-": () => zoomAt(view.scale / 1.4),
        "0": () => setView((v) => ({ ...v, scale: 1, x: 0, y: 0 })),
        i: () => setView((v) => ({ ...v, invert: !v.invert })),
        r: () => setView((v) => ({ ...v, rotate: (v.rotate + 90) % 360 }))
      };
      // arrows belong to the question navigator while docked
      if (!docked) {
        map.ArrowRight = () => go(1);
        map.ArrowLeft = () => go(-1);
        if (view.scale > 1) {
          map.ArrowUp = () => setView((v) => ({ ...v, y: v.y + 60 }));
          map.ArrowDown = () => setView((v) => ({ ...v, y: v.y - 60 }));
        }
      }
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fn();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [docked, go, onClose, view.scale, zoomAt]);

  // wheel zoom needs a non-passive listener
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = stagePoint(e.clientX, e.clientY);
      setView((v) => {
        const s = clamp(v.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), MIN_SCALE, MAX_SCALE);
        if (s === 1) return { ...v, scale: 1, x: 0, y: 0 };
        const k = s / v.scale;
        return { ...v, scale: s, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { startX: 0, startY: 0, view, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2), moved: true, t: Date.now() };
    } else if (pts.length === 1) {
      gesture.current = { startX: e.clientX, startY: e.clientY, view, moved: false, t: Date.now() };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = Array.from(pointers.current.values());
    if (pts.length >= 2 && g.dist && g.mid) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = clamp(g.view.scale * (dist / g.dist), MIN_SCALE, MAX_SCALE);
      const k = s / g.view.scale;
      setView({ ...g.view, scale: s, x: mid.x - (g.mid.x - g.view.x) * k, y: mid.y - (g.mid.y - g.view.y) * k });
      return;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (tool === "wl" || e.buttons === 2) {
      // window/level: horizontal = contrast, vertical = brightness
      setView({ ...g.view, contrast: clamp(g.view.contrast * Math.exp(dx / 250), 0.2, 5), brightness: clamp(g.view.brightness * Math.exp(-dy / 250), 0.2, 4) });
    } else if (g.view.scale > 1) {
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1 && g) {
      // one finger lifted after a pinch → continue as a pan from here
      const [p] = Array.from(pointers.current.values());
      gesture.current = { startX: p.x, startY: p.y, view, moved: true, t: Date.now() };
      return;
    }
    if (pointers.current.size > 0 || !g) return;
    gesture.current = null;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    // swipe to navigate when not zoomed
    if (tool === "pan" && g.view.scale <= 1.01 && Math.abs(dx) > 60 && Math.abs(dy) < 80 && items.length > 1) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    // double tap / double click toggles zoom at that point
    if (!g.moved && tool === "pan") {
      const now = Date.now();
      const lt = lastTap.current;
      if (lt && now - lt.t < 320 && Math.hypot(lt.x - e.clientX, lt.y - e.clientY) < 30) {
        const p = stagePoint(e.clientX, e.clientY);
        zoomAt(view.scale > 1.05 ? 1 : 2.5, p.x, p.y);
        lastTap.current = null;
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const adjusted = view.brightness !== 1 || view.contrast !== 1 || view.invert;
  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotate}deg) scaleX(${view.flip ? -1 : 1})`;
  const filter = `brightness(${view.brightness}) contrast(${view.contrast})${view.invert ? " invert(1)" : ""}`;

  return (
    <div ref={rootRef} className={`viewer ${docked ? "docked" : "modal"}`} role="dialog" aria-label="Image viewer" aria-modal={!docked}>
      <div className="viewer-bar">
        <span className="viewer-count">
          {index + 1} / {items.length}
        </span>
        <button className="vbtn" onClick={() => zoomAt(view.scale / 1.4)} title="Zoom out (−)" aria-label="Zoom out">
          −
        </button>
        <span className="viewer-zoom">{Math.round(view.scale * 100)}%</span>
        <button className="vbtn" onClick={() => zoomAt(view.scale * 1.4)} title="Zoom in (+)" aria-label="Zoom in">
          +
        </button>
        <button className="vbtn" onClick={() => setView((v) => ({ ...v, scale: 1, x: 0, y: 0 }))} title="Fit (0)">
          Fit
        </button>
        <button className="vbtn" onClick={() => zoomAt(nativeScale())} title="Actual pixels">
          1:1
        </button>
        <span className="viewer-sep" />
        <button className={`vbtn ${tool === "wl" ? "on" : ""}`} onClick={() => setTool(tool === "wl" ? "pan" : "wl")} title="Window/level: drag left-right for contrast, up-down for brightness (or right-drag any time)">
          W/L
        </button>
        <button className={`vbtn ${showAdjust ? "on" : ""}`} onClick={() => setShowAdjust(!showAdjust)} title="Brightness & contrast">
          ☀
        </button>
        <button className={`vbtn ${view.invert ? "on" : ""}`} onClick={() => setView((v) => ({ ...v, invert: !v.invert }))} title="Invert (I)">
          Inv
        </button>
        <button className="vbtn" onClick={() => setView((v) => ({ ...v, rotate: (v.rotate + 90) % 360 }))} title="Rotate (R)">
          ⟳
        </button>
        <button className={`vbtn ${view.flip ? "on" : ""}`} onClick={() => setView((v) => ({ ...v, flip: !v.flip }))} title="Flip horizontally">
          ⇋
        </button>
        <button className="vbtn" onClick={() => setView(DEFAULT_VIEW)} title="Reset all" disabled={!adjusted && view.scale === 1 && !view.rotate && !view.flip}>
          Reset
        </button>
        <span className="viewer-spacer" />
        {canDock && (
          <button className={`vbtn ${docked ? "on" : ""}`} onClick={() => setDocked(!docked)} title={docked ? "Undock (full view)" : "Dock beside the question"}>
            {docked ? "Undock" : "Dock"}
          </button>
        )}
        {!docked && (
          <button className="vbtn" onClick={toggleFullscreen} title="Full screen">
            ⛶
          </button>
        )}
        <button className="vbtn" onClick={onClose} title="Close (Esc)" aria-label="Close viewer">
          ✕
        </button>
      </div>

      {showAdjust && (
        <div className="viewer-adjust">
          <label>
            Brightness
            <input type="range" min={0.2} max={3} step={0.05} value={view.brightness} onChange={(e) => setView((v) => ({ ...v, brightness: Number(e.target.value) }))} />
          </label>
          <label>
            Contrast
            <input type="range" min={0.2} max={4} step={0.05} value={view.contrast} onChange={(e) => setView((v) => ({ ...v, contrast: Number(e.target.value) }))} />
          </label>
          <button className="vbtn" onClick={() => setView((v) => ({ ...v, brightness: 1, contrast: 1, invert: false }))}>
            Normal
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className={`viewer-stage ${tool === "wl" ? "wl" : view.scale > 1 ? "can-pan" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          ref={imgRef}
          src={item.src}
          alt={item.caption ?? ""}
          draggable={false}
          onLoad={(e) => setLoaded({ src: item.src, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ transform, filter }}
        />
        {items.length > 1 && (
          <>
            <button className="viewer-nav prev" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} aria-label="Previous image">
              ‹
            </button>
            <button className="viewer-nav next" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} aria-label="Next image">
              ›
            </button>
          </>
        )}
      </div>

      {(item.caption || natural) && (
        <div className="viewer-caption">
          {item.caption}
          {natural && (
            <span className="viewer-dim">
              {" "}
              {natural.w}×{natural.h}px
            </span>
          )}
        </div>
      )}

      {items.length > 1 && (
        <div className="viewer-thumbs">
          {items.map((it, i) => (
            <button key={it.src + i} className={i === index ? "on" : ""} onClick={() => setIndex(i)} aria-label={`Image ${i + 1}`}>
              <img src={it.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
