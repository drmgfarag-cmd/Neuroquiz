import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Flashcard } from "../lib/types";
import { topicHue } from "../lib/colors";
import { MediaList, Rich } from "./Rich";

interface Props {
  card: Flashcard;
  flipped: boolean;
  onFlip: () => void;
  /** after flipping: swipe right = good, left = again */
  onSwipe?: (dir: "left" | "right") => void;
  topic?: string;
  footer?: ReactNode;
}

/**
 * A real flash card: the front turns over (3D) to show the back. Each face
 * scrolls inside the card, so long answers, tables and images stay within it.
 */
export function FlipCard({ card, flipped, onFlip, onSwipe, topic, footer }: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  useEffect(() => setDx(0), [card.id]);

  // clicks on images (viewer), links and buttons shouldn't turn the card
  const interactive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest("img, a, button, input, textarea, select, mark");

  const hue = topicHue(topic);
  return (
    <div
      className={`flip-stage ${flipped ? "is-flipped" : ""}`}
      style={{ ["--card-hue" as string]: hue, transform: dx ? `translateX(${dx}px) rotate(${dx / 25}deg)` : undefined }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || !flipped || !onSwipe) return;
        const x = e.clientX - s.x;
        const y = e.clientY - s.y;
        // horizontal drags only; vertical ones scroll the card
        if (!moved.current && Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) moved.current = true;
        if (moved.current) setDx(x);
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (moved.current && onSwipe && Math.abs(dx) > 90) {
          onSwipe(dx > 0 ? "right" : "left");
          return;
        }
        setDx(0);
        if (!moved.current && s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8 && !interactive(e.target) && !window.getSelection()?.toString()) onFlip();
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    >
      {dx !== 0 && <div className={`swipe-hint ${dx > 0 ? "good" : "again"}`}>{dx > 0 ? "Good ✓" : "Again ↺"}</div>}
      <div className="flip-inner">
        <section className="flip-face front" aria-hidden={flipped} data-gallery="">
          <header className="face-head">
            <span className="face-label">Question</span>
            {topic && <span className="chip topic-chip">{topic}</span>}
          </header>
          <div className="face-body">
            <Rich text={card.front} bookId={card.bookId} />
            <MediaList media={card.frontMedia} bookId={card.bookId} />
          </div>
          <footer className="face-foot">Tap the card or press Space to turn it over</footer>
        </section>
        <section className="flip-face back" aria-hidden={!flipped} data-gallery="">
          <header className="face-head">
            <span className="face-label">Answer</span>
            {topic && <span className="chip topic-chip">{topic}</span>}
          </header>
          <div className="face-body">
            <Rich text={card.back} bookId={card.bookId} />
            <MediaList media={card.backMedia} bookId={card.bookId} />
          </div>
          <footer className="face-foot">{footer ?? "Tap to see the question again"}</footer>
        </section>
      </div>
    </div>
  );
}
