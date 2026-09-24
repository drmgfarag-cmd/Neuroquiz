import { useState } from "react";
import { revertCorrection, saveCorrection } from "../lib/corrections";
import { formatOf } from "../lib/grading";
import { setIssue } from "../lib/quiz";
import type { MatchChoice, Question } from "../lib/types";
import { ask } from "./Dialog";

/**
 * Fix a question: text, options, correct answer and explanation. Saved as a
 * correction that survives book updates and syncs to your other devices.
 */
export function QuestionEditor({ q, issue, onDone }: { q: Question; issue?: string; onDone: (q: Question) => void }) {
  const f = formatOf(q);
  const [stem, setStem] = useState(q.stem);
  const [explanation, setExplanation] = useState(q.explanation);
  const [texts, setTexts] = useState<Record<string, string>>(Object.fromEntries(q.options.map((o) => [o.key, o.text])));
  const [answer, setAnswer] = useState<string[]>(q.answer);
  const [verdicts, setVerdicts] = useState<Record<string, boolean>>({ ...(q.verdicts ?? {}) });
  const [matches, setMatches] = useState<Record<string, string>>({ ...(q.matches ?? {}) });
  const [choices, setChoices] = useState<MatchChoice[]>(q.choices ? q.choices.map((c) => ({ ...c })) : []);
  const [resolve, setResolve] = useState(!!issue);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const options = q.options.map((o) => ({ ...o, text: texts[o.key] ?? o.text }));
    const next =
      f === "truefalse"
        ? { stem, explanation, options, verdicts, answer: Object.keys(verdicts).filter((k) => verdicts[k]) }
        : f === "matching"
          ? { stem, explanation, options, matches, choices }
          : { stem, explanation, options, answer };
    const updated = await saveCorrection(q, next);
    if (resolve && issue) await setIssue(q.id, "");
    setBusy(false);
    onDone(updated);
  };

  const revert = async () => {
    if (!(await ask("Discard your corrections and go back to the text from the book?", { confirmLabel: "Revert", danger: true }))) return;
    onDone(await revertCorrection(q));
  };

  return (
    <div className="card stack editor">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Edit question</h3>
        {q.edited && <span className="chip accent">Your corrections applied</span>}
      </div>
      <label className="field" htmlFor={`ed-stem-${q.id}`}>
        Question
      </label>
      <textarea id={`ed-stem-${q.id}`} value={stem} onChange={(e) => setStem(e.target.value)} rows={5} />

      <div className="field">{f === "truefalse" ? "Statements and verdicts" : f === "matching" ? "Items and their correct answer" : f === "multi" ? "Options (tick every correct one)" : "Options (choose the correct one)"}</div>
      {q.options.map((o) => (
        <div key={o.key} className="row editor-option">
          <span className="chip">{o.key}</span>
          <textarea id={`ed-opt-${q.id}-${o.key}`} aria-label={`Text of ${o.key}`} value={texts[o.key] ?? ""} onChange={(e) => setTexts({ ...texts, [o.key]: e.target.value })} rows={2} />
          {f === "single" && (
            <label className="check small">
              <input type="radio" name={`ed-ans-${q.id}`} checked={answer.includes(o.key)} onChange={() => setAnswer([o.key])} /> Correct
            </label>
          )}
          {f === "multi" && (
            <label className="check small">
              <input type="checkbox" checked={answer.includes(o.key)} onChange={() => setAnswer(answer.includes(o.key) ? answer.filter((k) => k !== o.key) : [...answer, o.key])} /> Correct
            </label>
          )}
          {f === "truefalse" && (
            <div className="tf">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" className={verdicts[o.key] === v ? "active" : ""} onClick={() => setVerdicts({ ...verdicts, [o.key]: v })}>
                  {v ? "True" : "False"}
                </button>
              ))}
            </div>
          )}
          {f === "matching" && (
            <select aria-label={`Correct answer for ${o.key}`} value={matches[o.key] ?? ""} onChange={(e) => setMatches({ ...matches, [o.key]: e.target.value })}>
              <option value="">–</option>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.key}. {c.text}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}

      {f === "matching" && (
        <>
          <div className="field">Answer list</div>
          {choices.map((c, i) => (
            <div key={c.key} className="row editor-option">
              <span className="chip">{c.key}</span>
              <input
                type="text"
                id={`ed-choice-${q.id}-${c.key}`}
                aria-label={`Answer ${c.key}`}
                value={c.text}
                onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
            </div>
          ))}
        </>
      )}

      <label className="field" htmlFor={`ed-expl-${q.id}`}>
        Explanation
      </label>
      <textarea id={`ed-expl-${q.id}`} value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={6} />
      <p className="small muted" style={{ margin: 0 }}>
        Markdown works: **bold**, lists, tables. Images from the book can be referenced as ![](file-name.png).
      </p>
      {issue && (
        <label className="check small">
          <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} /> Mark the reported problem as resolved
        </label>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={save}>
          Save correction
        </button>
        <button onClick={() => onDone(q)}>Cancel</button>
        {q.edited && (
          <button className="danger" onClick={revert}>
            Revert to original
          </button>
        )}
      </div>
    </div>
  );
}
