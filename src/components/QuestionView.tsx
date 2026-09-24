import { plain } from "../lib/markdown";
import type { Question } from "../lib/types";
import { MediaList, Rich } from "./Rich";

interface Props {
  q: Question;
  selected: string[];
  revealed: boolean;
  onSelect?: (key: string) => void;
  struck?: string[];
  onStrike?: (key: string) => void;
  order?: string[];
}

/** Stem + options. When `revealed`, colours correct / wrong choices. */
export function QuestionView({ q, selected, revealed, onSelect, struck = [], onStrike, order }: Props) {
  const opts = order ? order.map((k) => q.options.find((o) => o.key === k)!).filter(Boolean) : q.options;
  const multi = q.answer.length > 1;
  return (
    <div>
      <Rich text={q.stem} bookId={q.bookId} />
      <MediaList media={q.stemMedia} bookId={q.bookId} />
      {multi && <div className="chip warn">Select {q.answer.length} answers</div>}
      <div role={multi ? "group" : "radiogroup"}>
        {opts.map((o, i) => {
          const isSel = selected.includes(o.key);
          const isAns = q.answer.includes(o.key);
          let cls = "option";
          if (revealed) {
            if (isAns) cls += " correct";
            else if (isSel) cls += " wrong";
          } else if (isSel) cls += " selected";
          if (struck.includes(o.key) && !revealed) cls += " struck";
          return (
            <div
              key={o.key}
              className={cls}
              role={multi ? "checkbox" : "radio"}
              aria-checked={isSel}
              tabIndex={0}
              onClick={() => !revealed && onSelect?.(o.key)}
              onContextMenu={(e) => {
                if (onStrike && !revealed) {
                  e.preventDefault();
                  onStrike(o.key);
                }
              }}
            >
              <span className="key">{order ? String.fromCharCode(65 + i) : o.key}</span>
              <div className="opt-body">
                {o.text && <Rich text={o.text} bookId={q.bookId} />}
                <MediaList media={o.media} bookId={q.bookId} />
              </div>
              {onStrike && !revealed && (
                <button
                  className="strike"
                  title="Eliminate option (or right-click)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStrike(o.key);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Explanation({ q, selected }: { q: Question; selected: string[] }) {
  const correct = selected.length ? selected.length === q.answer.length && selected.every((k) => q.answer.includes(k)) : null;
  return (
    <div className="card explanation">
      <div className="row">
        {correct === true && <span className="chip good">Correct</span>}
        {correct === false && <span className="chip bad">Incorrect</span>}
        {correct === null && <span className="chip">Not answered</span>}
        <span>
          Answer:{" "}
          <strong>
            {q.answer.length
              ? q.options
                  .filter((o) => q.answer.includes(o.key))
                  .map((o) => plain(o.text, 120) || `option ${o.key}`)
                  .join("; ")
              : "not provided in source"}
          </strong>
        </span>
      </div>
      {q.explanation ? <Rich text={q.explanation} bookId={q.bookId} className="" /> : <p className="muted">No explanation in the source.</p>}
      <MediaList media={q.explanationMedia} bookId={q.bookId} />
    </div>
  );
}
