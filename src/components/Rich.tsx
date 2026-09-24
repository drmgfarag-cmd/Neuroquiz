import { useEffect, useMemo, useRef, useState } from "react";
import { renderRich } from "../lib/markdown";
import { resolveMedia } from "../lib/media";
import type { MediaRef } from "../lib/types";

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image viewer">
      <img src={src} alt="" />
    </div>
  );
}

/** Renders markdown/HTML text and resolves embedded images from the book's media. */
export function Rich({ text, bookId, className }: { text: string; bookId?: string; className?: string }) {
  const html = useMemo(() => renderRich(text), [text]);
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    el.querySelectorAll<HTMLImageElement>("img[data-file]").forEach((img) => {
      const file = img.dataset.file!;
      resolveMedia(bookId, file).then((url) => {
        if (cancelled) return;
        if (url) img.src = url;
        else {
          const span = document.createElement("span");
          span.className = "media-missing";
          span.textContent = `Missing image: ${file}`;
          img.replaceWith(span);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [html, bookId]);

  return (
    <>
      <div
        ref={ref}
        className={`rich ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "IMG" && (t as HTMLImageElement).src) setZoom((t as HTMLImageElement).src);
        }}
      />
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

function MediaItem({ m, bookId, onZoom }: { m: MediaRef; bookId?: string; onZoom: (s: string) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    resolveMedia(bookId, m.file).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [m.file, bookId]);
  if (url === undefined) return <div className="media-missing">Loading {m.file}…</div>;
  if (url === null) return <div className="media-missing">Missing image: {m.file}</div>;
  return (
    <figure className="media-thumb" style={{ margin: 0 }}>
      <img src={url} alt={m.caption ?? m.file} onClick={() => onZoom(url)} />
      {m.caption && <figcaption>{m.caption}</figcaption>}
    </figure>
  );
}

export function MediaList({ media, bookId }: { media: MediaRef[]; bookId?: string }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!media?.length) return null;
  return (
    <div className="media-row">
      {media.map((m, i) => (
        <MediaItem key={m.file + i} m={m} bookId={bookId} onZoom={setZoom} />
      ))}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
