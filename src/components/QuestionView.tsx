import { answerSummary, choiceLabel, formatOf, isCorrect, pairs, score } from "../lib/grading";
import type { Question } from "../lib/types";
import { MediaList, Rich } from "./Rich";

interface Props {
  q: Question;
  selected: string[];
  revealed: boolean;
  /** single/multi: option key; truefalse: value "T"/"F"; matching: chosen list key */
  onSelect?: (key: string, value?: string) => void;
  struck?: string[];
  onStrike?: (key: string) => void;
  order?: string[];
}

/** Stem + answer controls for every question format. When `revealed`, marks right and wrong. */
export function QuestionView(props: Props) {
  const { q } = props;
  const f = formatOf(q);
  return (
    <div>
      <Rich text={q.stem} bookId={q.bookId} />
      <MediaList media={q.stemMedia} bookId={q.bookId} />
      {f === "truefalse" ? <TrueFalse {...props} /> : f === "matching" ? <Matching {...props} /> : <Choices {...props} />}
    </div>
  );
}

function OptionBody({ q, text, media }: { q: Question; text: string; media: Question["options"][number]["media"] }) {
  return (
    <div className="opt-body">
      {text && <Rich text={text} bookId={q.bookId} />}
      <MediaList media={media} bookId={q.bookId} />
    </div>
  );
}

function Choices({ q, selected, revealed, onSelect, struck = [], onStrike, order }: Props) {
  const opts = order ? order.map((k) => q.options.find((o) => o.key === k)!).filter(Boolean) : q.options;
  const multi = formatOf(q) === "multi";
  return (
    <>
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
              <OptionBody q={q} text={o.text} media={o.media} />
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
    </>
  );
}

function TrueFalse({ q, selected, revealed, onSelect }: Props) {
  const p = pairs(selected);
  return (
    <>
      <div className="chip warn">Mark each statement true or false</div>
      {q.options.map((o) => {
        const mine = p[o.key];
        const right = q.verdicts?.[o.key] ? "T" : "F";
        let cls = "option item";
        if (revealed) cls += mine === right ? " correct" : mine ? " wrong" : " missed";
        return (
          <div key={o.key} className={cls}>
            <span className="key">{o.key.toLowerCase()}</span>
            <OptionBody q={q} text={o.text} media={o.media} />
            <div className="tf" role="radiogroup" aria-label={`Statement ${o.key}`}>
              {(["T", "F"] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={mine === v}
                  className={`${mine === v ? "active" : ""} ${revealed && right === v ? "is-answer" : ""}`}
                  disabled={revealed}
                  onClick={() => onSelect?.(o.key, v)}
                >
                  {v === "T" ? "True" : "False"}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Matching({ q, selected, revealed, onSelect }: Props) {
  const p = pairs(selected);
  const choices = q.choices ?? [];
  return (
    <>
      {choices.some((c) => c.text) && (
        <div className="card match-list">
          <div className="small muted">Answer list (each may be used once, more than once or not at all)</div>
          <ol>
            {choices.map((c) => (
              <li key={c.key}>
                <strong>{c.key}.</strong> {c.text}
              </li>
            ))}
          </ol>
        </div>
      )}
      {q.options.map((o) => {
        const mine = p[o.key];
        const right = q.matches?.[o.key];
        let cls = "option item";
        if (revealed) cls += mine === right ? " correct" : mine ? " wrong" : " missed";
        return (
          <div key={o.key} className={cls}>
            <span className="key">{o.key.toLowerCase()}</span>
            <div className="opt-body">
              {o.text ? <Rich text={o.text} bookId={q.bookId} /> : <span className="muted">Item {o.key.toLowerCase()} (see image)</span>}
              <MediaList media={o.media} bookId={q.bookId} />
              {revealed && mine !== right && (
                <div className="small">
                  Correct: <strong>{choiceLabel(q, right)}</strong>
                </div>
              )}
            </div>
            <select className="match-select" value={mine ?? ""} disabled={revealed} onChange={(e) => onSelect?.(o.key, e.target.value)} aria-label={`Answer for item ${o.key}`}>
              <option value="">Choose…</option>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {choiceLabel(q, c.key)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}

export function Explanation({ q, selected }: { q: Question; selected: string[] }) {
  const answered = selected.length > 0;
  const correct = answered ? isCorrect(q, selected) : null;
  const sc = score(q, selected);
  const itemised = formatOf(q) === "truefalse" || formatOf(q) === "matching";
  return (
    <div className="card explanation">
      <div className="row">
        {correct === true && <span className="chip good">Correct</span>}
        {correct === false && <span className="chip bad">{itemised ? `${sc.right} / ${sc.total} correct` : "Incorrect"}</span>}
        {correct === null && <span className="chip">Not answered</span>}
        <span>
          Answer: <strong>{answerSummary(q, itemised)}</strong>
        </span>
      </div>
      {q.explanation ? <Rich text={q.explanation} bookId={q.bookId} className="" /> : <p className="muted">No explanation in the source.</p>}
      <MediaList media={q.explanationMedia} bookId={q.bookId} />
    </div>
  );
}
