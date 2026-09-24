import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notify } from "../components/Dialog";
import { db } from "../lib/db";
import { allocate, buildMockExam } from "../lib/mock";
import { createSession } from "../lib/quiz";
import type { QuestionFormat } from "../lib/types";

const FORMATS: [QuestionFormat, string][] = [
  ["single", "Single best answer"],
  ["multi", "Multiple answers"],
  ["truefalse", "True/False"],
  ["matching", "EMI"]
];

export default function MockExam() {
  const nav = useNavigate();
  const books = useLiveQuery(() => db.books.orderBy("title").toArray());
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(100);
  const [minutes, setMinutes] = useState(120);
  const [minutesTouched, setMinutesTouched] = useState(false);
  const [timed, setTimed] = useState(true);
  const [preferUnused, setPreferUnused] = useState(true);
  const [formats, setFormats] = useState<QuestionFormat[]>([]);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [busy, setBusy] = useState(false);

  // every book starts with an equal share
  useEffect(() => {
    if (books && !Object.keys(weights).length) setWeights(Object.fromEntries(books.map((b) => [b.id, 1])));
  }, [books, weights]);
  // board exams allow roughly 72 seconds per question
  useEffect(() => {
    if (!minutesTouched) setMinutes(Math.max(5, Math.round(total * 1.2)));
  }, [total, minutesTouched]);

  if (!books) return null;
  const quotas = allocate(total, weights);
  const sum = Object.values(weights).reduce((a, b) => a + (b > 0 ? b : 0), 0);

  const start = async () => {
    setBusy(true);
    try {
      const plan = await buildMockExam({ total, weights, preferUnused, formats });
      if (!plan.questions.length) return void notify("No questions match these settings.");
      const short = plan.perBook.filter((p) => p.got < p.wanted);
      if (short.length) {
        const names = new Map(books.map((b) => [b.id, b.title]));
        await notify(`Some books had fewer matching questions than requested:\n${short.map((p) => `• ${names.get(p.bookId)}: ${p.got} of ${p.wanted}`).join("\n")}\n\nThe exam has ${plan.questions.length} questions.`);
      }
      const s = await createSession(plan.questions, {
        mode: timed ? "timed" : "exam",
        title: `Mock exam – ${plan.questions.length} questions`,
        count: 0,
        shuffleQuestions: false,
        preserveOrder: true,
        shuffleOptions,
        secondsPerQuestion: 72,
        timeLimitSec: timed ? minutes * 60 : undefined
      });
      nav(`/quiz/${s.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Mock exam</h1>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          Build a board-style exam from several books. Questions are drawn at random in the proportions you set, linked questions (shared cases, EMI sets) stay
          together, and results and explanations appear at the end.
        </p>
        <div className="row">
          <label className="field">
            Questions
            <input id="mock-total" type="number" min={5} max={500} value={total} onChange={(e) => setTotal(Math.max(5, Math.min(500, Number(e.target.value) || 5)))} style={{ width: 110 }} />
          </label>
          <label className="field">
            Time (minutes)
            <input
              id="mock-minutes"
              type="number"
              min={5}
              max={600}
              value={minutes}
              disabled={!timed}
              onChange={(e) => {
                setMinutesTouched(true);
                setMinutes(Math.max(5, Number(e.target.value) || 5));
              }}
              style={{ width: 110 }}
            />
          </label>
          <label className="check small" style={{ alignSelf: "flex-end", paddingBottom: 8 }}>
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Timed
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Book mix</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Book</th>
              <th style={{ width: 120 }}>Weight</th>
              <th style={{ width: 90 }}>Share</th>
              <th style={{ width: 90 }}>Questions</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.title} <span className="muted small">({b.questionCount})</span>
                </td>
                <td>
                  <input
                    id={`mock-w-${b.id}`}
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Weight for ${b.title}`}
                    value={weights[b.id] ?? 0}
                    onChange={(e) => setWeights({ ...weights, [b.id]: Math.max(0, Number(e.target.value) || 0) })}
                    style={{ width: 80 }}
                  />
                </td>
                <td className="small" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {sum && weights[b.id] > 0 ? `${Math.round((100 * weights[b.id]) / sum)}%` : "–"}
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{quotas[b.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Set a weight to 0 to leave a book out. Weights are relative: 2 / 1 / 1 gives 50% / 25% / 25%.</p>
      </div>

      <div className="card stack">
        <label className="check">
          <input type="checkbox" checked={preferUnused} onChange={(e) => setPreferUnused(e.target.checked)} /> Prefer questions I haven't answered yet
        </label>
        <label className="check">
          <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Shuffle answer options
        </label>
        <div className="row">
          <span className="small muted">Question types:</span>
          {FORMATS.map(([id, label]) => (
            <label className="check small" key={id}>
              <input type="checkbox" checked={formats.includes(id)} onChange={() => setFormats(formats.includes(id) ? formats.filter((x) => x !== id) : [...formats, id])} /> {label}
            </label>
          ))}
          {!formats.length && <span className="small muted">(all)</span>}
        </div>
      </div>

      <div className="sticky-actions row between">
        <span>
          <strong>{total}</strong> questions{timed ? ` · ${minutes} min` : " · untimed"}
        </span>
        <button className="primary" disabled={busy || !sum} onClick={start}>
          {busy ? "Building…" : "Start mock exam"}
        </button>
      </div>
    </div>
  );
}
