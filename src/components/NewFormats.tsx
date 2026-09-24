import { useEffect, useState } from "react";
import { formatOf, inRegion, parsePoint, SCT_SCALE, textMatches } from "../lib/grading";
import { resolveMedia } from "../lib/media";
import type { HotspotRegion, Question } from "../lib/types";
import { Rich } from "./Rich";

interface Props {
  q: Question;
  selected: string[];
  revealed: boolean;
  onSelect?: (key: string, value?: string) => void;
  order?: string[];
}

/** Put the options in sequence: drag (mouse) or the ↑ ↓ buttons (touch, keyboard). */
export function Ordering({ q, selected, revealed, onSelect, order }: Props) {
  const base = order?.length === q.options.length ? order : q.options.map((o) => o.key);
  const current = selected.length === q.options.length ? selected : base;
  const [drag, setDrag] = useState<number | null>(null);
  const set = (keys: string[]) => onSelect?.("order", keys.join(","));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= current.length || from === to) return;
    const next = current.slice();
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    set(next);
  };
  return (
    <>
      <div className="chip warn">Put the items in the correct order (drag, or use the arrows)</div>
      <ol className="ordering" aria-label="Your order">
        {current.map((k, i) => {
          const o = q.options.find((x) => x.key === k);
          const right = q.answer[i] === k;
          let cls = "option item order-item";
          if (revealed) cls += right ? " correct" : " wrong";
          if (drag === i) cls += " dragging";
          return (
            <li
              key={k}
              className={cls}
              draggable={!revealed}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null) move(drag, i);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <span className="key">{i + 1}</span>
              <div className="opt-body">
                <Rich text={o?.text ?? k} bookId={q.bookId} />
                {revealed && !right && (
                  <div className="small">
                    Belongs at position <strong>{q.answer.indexOf(k) + 1}</strong>
                  </div>
                )}
              </div>
              {!revealed && (
                <span className="order-buttons">
                  <button className="small" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    ↑
                  </button>
                  <button className="small" aria-label={`Move item ${i + 1} down`} disabled={i === current.length - 1} onClick={() => move(i, i + 1)}>
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!revealed && selected.length !== q.options.length && (
        <button className="small" onClick={() => set(current)}>
          This order is my answer
        </button>
      )}
    </>
  );
}

/** Typed (cloze / short) answer. */
export function TextAnswer({ q, selected, revealed, onSelect }: Props) {
  const [v, setV] = useState(selected[0] ?? "");
  useEffect(() => setV(selected[0] ?? ""), [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = selected[0] ?? "";
  const ok = textMatches(typed, q.accepted ?? []);
  return (
    <div className={`option item text-answer ${revealed ? (ok ? "correct" : "wrong") : ""}`}>
      <label className="field" style={{ flex: 1 }}>
        Your answer
        <input
          type="text"
          value={revealed ? typed : v}
          disabled={revealed}
          autoComplete="off"
          spellCheck={false}
          placeholder="Type your answer…"
          onChange={(e) => {
            setV(e.target.value);
            onSelect?.("text", e.target.value);
          }}
        />
      </label>
      {revealed && (
        <div className="small" style={{ width: "100%" }}>
          {ok ? "✓ Accepted." : "✗ Not accepted."} Accepted answer{(q.accepted?.length ?? 0) > 1 ? "s" : ""}: <strong>{(q.accepted ?? []).join(" / ") || "–"}</strong>
        </div>
      )}
    </div>
  );
}

function RegionShape({ r, cls }: { r: HotspotRegion; cls: string }) {
  const style: React.CSSProperties =
    "r" in r
      ? // r is a fraction of each side, like the hit test
        { left: `${(r.x - r.r) * 100}%`, top: `${(r.y - r.r) * 100}%`, width: `${r.r * 200}%`, height: `${r.r * 200}%`, borderRadius: "50%" }
      : { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` };
  return (
    <span className={`hs-region ${cls}`} style={style}>
      {r.label && <span className="hs-label">{r.label}</span>}
    </span>
  );
}

/** Click on the image. The first question image is the target. */
export function Hotspot({ q, selected, revealed, onSelect }: Props) {
  const file = q.stemMedia[0]?.file;
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (file) resolveMedia(q.bookId, file).then((u) => live && setUrl(u));
    else setUrl(null);
    return () => {
      live = false;
    };
  }, [file, q.bookId]);
  const p = parsePoint(selected[0]);
  const hit = !!p && (q.regions ?? []).some((r) => inRegion(p[0], p[1], r));
  if (!url) return <div className="media-missing">{url === undefined ? "Loading image…" : `Missing image for this question${file ? `: ${file}` : ""}`}</div>;
  return (
    <>
      <div className="chip warn">Click on the image to mark your answer</div>
      <div className="hotspot">
        <img
          src={url}
          alt={q.stemMedia[0]?.caption ?? "Question image"}
          draggable={false}
          onClick={(e) => {
            if (revealed) return;
            const b = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - b.left) / b.width;
            const y = (e.clientY - b.top) / b.height;
            onSelect?.("point", `${x.toFixed(4)},${y.toFixed(4)}`);
          }}
        />
        {revealed && (q.regions ?? []).map((r, i) => <RegionShape key={i} r={r} cls="answer" />)}
        {p && <span className={`hs-marker ${revealed ? (hit ? "good" : "bad") : ""}`} style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }} aria-label="Your mark" />}
      </div>
      {revealed && <div className="small">{hit ? "✓ Your mark is on the target." : p ? "✗ Your mark missed the target (outlined)." : "No mark placed."}</div>}
    </>
  );
}

/** Script concordance: how does the new information change the hypothesis? */
export function Sct({ q, selected, revealed, onSelect }: Props) {
  const opts = q.options.length ? q.options : SCT_SCALE.map((x) => ({ ...x, media: [] }));
  const panel = q.panel ?? {};
  const votes = Object.values(panel).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(panel));
  return (
    <>
      <div className="chip warn">Rate the effect of the new information</div>
      <div role="radiogroup" className="sct-scale">
        {opts.map((o) => {
          const isSel = selected.includes(o.key);
          const credit = max ? (panel[o.key] ?? 0) / max : 0;
          let cls = "option";
          if (revealed) cls += credit === 1 ? " correct" : isSel ? (credit > 0 ? " partial" : " wrong") : "";
          else if (isSel) cls += " selected";
          return (
            <div key={o.key} className={cls} role="radio" aria-checked={isSel} tabIndex={0} onClick={() => !revealed && onSelect?.(o.key)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !revealed && onSelect?.(o.key)}>
              <span className="key">{o.key}</span>
              <div className="opt-body">{o.text}</div>
              {revealed && votes > 0 && (
                <span className="small muted" title="Expert panel">
                  {Math.round((100 * (panel[o.key] ?? 0)) / votes)}% of panel · {Math.round(credit * 100)}% credit
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export const isNewFormat = (q: Question) => ["ordering", "text", "hotspot", "sct"].includes(formatOf(q));
