import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Explanation, QuestionView } from "../components/QuestionView";
import { db } from "../lib/db";
import { plain } from "../lib/markdown";
import { createSession } from "../lib/quiz";
import type { Question } from "../lib/types";
import { formatDuration, pct } from "../lib/util";

export default function Results() {
  const { id } = useParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState<"all" | "wrong" | "right" | "skipped">("all");
  const [open, setOpen] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const s = await db.sessions.get(id!);
    if (!s) return null;
    const qs = (await db.questions.bulkGet(s.questionIds)).filter((q): q is Question => !!q);
    const anns = await db.annotations.bulkGet(qs.map((q) => q.id));
    const byTopic = new Map<string, { n: number; ok: number }>();
    qs.forEach((q, i) => {
      const t = anns[i]?.topic || "Uncategorised";
      const r = byTopic.get(t) ?? { n: 0, ok: 0 };
      r.n++;
      if (s.answers[q.id]?.correct) r.ok++;
      byTopic.set(t, r);
    });
    return { s, qs, byTopic };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) return <div className="card">Session not found.</div>;
  const { s, qs, byTopic } = data;
  const answered = qs.filter((q) => s.answers[q.id]?.selected.length).length;
  const correct = qs.filter((q) => s.answers[q.id]?.correct).length;
  const list = qs.filter((q) => {
    const a = s.answers[q.id];
    if (filter === "wrong") return a?.correct === false;
    if (filter === "right") return a?.correct === true;
    if (filter === "skipped") return !a?.selected.length;
    return true;
  });

  const retry = async (which: Question[], title: string) => {
    if (!which.length) return;
    const ns = await createSession(which, { mode: "tutor", title, count: 0, shuffleQuestions: true, shuffleOptions: s.shuffleOptions, secondsPerQuestion: 90 });
    nav(`/quiz/${ns.id}`);
  };

  return (
    <div>
      <h1>Results</h1>
      <div className="card">
        <div className="muted small">{s.title}</div>
        <div className="row" style={{ gap: 24, marginTop: 6 }}>
          <div>
            <div className="stat">{pct(correct, qs.length)}</div>
            <div className="muted small">
              {correct} / {qs.length} correct
            </div>
          </div>
          <div>
            <div className="stat">{answered}</div>
            <div className="muted small">answered</div>
          </div>
          <div>
            <div className="stat">{formatDuration(s.elapsedMs ?? (s.finishedAt ?? Date.now()) - s.startedAt)}</div>
            <div className="muted small">time · {formatDuration((s.elapsedMs ?? 0) / Math.max(1, answered))} / question</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => retry(qs.filter((q) => s.answers[q.id]?.correct === false), `Retry incorrect – ${s.title}`)}>
            Retry incorrect
          </button>
          <button onClick={() => retry(qs, `Retake – ${s.title}`)}>Retake all</button>
          <Link className="btn" to="/quiz">
            New test
          </Link>
        </div>
      </div>

      <h2>By topic</h2>
      <div className="card">
        {Array.from(byTopic.entries())
          .sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
          .map(([t, r]) => (
            <div key={t} className="bar" style={{ margin: "6px 0" }}>
              <span style={{ width: 220, flex: "none" }} className="small">
                {t}
              </span>
              <div className="progress" style={{ flex: 1 }}>
                <div style={{ width: `${(100 * r.ok) / r.n}%`, background: r.ok / r.n >= 0.7 ? "var(--good)" : r.ok / r.n >= 0.5 ? "var(--warn)" : "var(--bad)" }} />
              </div>
              <span className="small muted" style={{ width: 70, textAlign: "right" }}>
                {r.ok}/{r.n}
              </span>
            </div>
          ))}
      </div>

      <h2>Questions</h2>
      <div className="segmented" style={{ marginBottom: 10 }}>
        {(["all", "wrong", "right", "skipped"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="card">
        {list.map((q) => {
          const a = s.answers[q.id];
          const i = s.questionIds.indexOf(q.id);
          return (
            <div key={q.id}>
              <div className="list-item clickable" onClick={() => setOpen(open === q.id ? null : q.id)}>
                <span className={`chip ${a?.correct ? "good" : a?.selected.length ? "bad" : ""}`}>{i + 1}</span>
                <div style={{ flex: 1 }}>{plain(q.stem, 160)}</div>
                <span className="small muted">{a?.selected.join(",") || "–"} / {q.answer.join(",")}</span>
              </div>
              {open === q.id && (
                <div style={{ padding: "8px 0 16px" }} data-gallery="">
                  <QuestionView q={q} selected={a?.selected ?? []} revealed />
                  <Explanation q={q} selected={a?.selected ?? []} />
                  <Link to={`/question/${encodeURIComponent(q.id)}`} className="small">
                    Open question page →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <div className="muted">Nothing here.</div>}
      </div>
    </div>
  );
}
