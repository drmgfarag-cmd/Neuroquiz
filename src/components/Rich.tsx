import { useEffect, useMemo, useRef, useState } from "react";
import { renderRich } from "../lib/markdown";
import { resolveMedia } from "../lib/media";
import type { MediaRef } from "../lib/types";

/**
 * Renders markdown/HTML text and resolves embedded images from the book's
 * media. Images open in the built-in viewer (see ImageViewer).
 */
export function Rich({ text, bookId, className, highlights, onUnhighlight }: { text: string; bookId?: string; className?: string; highlights?: string[]; onUnhighlight?: (t: string) => void }) {
  const html = useMemo(() => renderRich(text), [text]);
  const ref = useRef<HTMLDivElement>(null);

  const hlKey = (highlights ?? []).join("\u0000");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    applyHighlights(el, highlights ?? []);
  }, [html, hlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    el.querySelectorAll<HTMLImageElement>("img[data-file]").forEach((img) => {
      const file = img.dataset.file!;
      img.dataset.zoomable = "";
      if (img.alt) img.dataset.caption = img.alt;
      img.title = "Open in viewer";
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
    <div
      ref={ref}
      className={`rich ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const m = (e.target as HTMLElement).closest("mark.hl") as HTMLElement | null;
        if (m && onUnhighlight) onUnhighlight(m.dataset.text ?? m.textContent ?? "");
      }}
    />
  );
}

/** Wraps every occurrence of each snippet in <mark class="hl"> (removing old marks first). */
export function applyHighlights(root: HTMLElement, snippets: string[]): void {
  root.querySelectorAll("mark.hl").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
  for (const snip of snippets) {
    const needle = snip.trim();
    if (needle.length < 2) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(needle) && !(n.parentElement?.closest("mark.hl"))) hits.push(n as Text);
    for (const node of hits) {
      let cur: Text | null = node;
      while (cur) {
        const i = cur.data.indexOf(needle);
        if (i < 0) break;
        const match = cur.splitText(i);
        const rest = match.splitText(needle.length);
        const mark = document.createElement("mark");
        mark.className = "hl";
        mark.dataset.text = snip;
        mark.title = "Click to remove highlight";
        match.replaceWith(mark);
        mark.appendChild(match);
        cur = rest;
      }
    }
  }
}

function MediaItem({ m, bookId }: { m: MediaRef; bookId?: string }) {
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
    <figure className="media-thumb">
      <img src={url} alt={m.caption ?? m.file} data-zoomable="" data-caption={m.caption ?? ""} title="Open in viewer" />
      {m.caption && <figcaption>{m.caption}</figcaption>}
    </figure>
  );
}

export function MediaList({ media, bookId }: { media: MediaRef[]; bookId?: string }) {
  if (!media?.length) return null;
  return (
    <div className="media-row">
      {media.map((m, i) => (
        <MediaItem key={m.file + i} m={m} bookId={bookId} />
      ))}
    </div>
  );
}
