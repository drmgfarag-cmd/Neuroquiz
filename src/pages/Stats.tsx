import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, questionChapterIndex } from "../lib/db";
import { formatDuration, pct } from "../lib/util";

export default function Stats() {
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const [index, states, anns, books, sessions, chapters] = await Promise.all([
      questionChapterIndex(),
      db.questionStates.toArray(),
      db.annotations.where("kind").equals("question").toArray(),
      db.books.toArray(),
      db.sessions.toArray(),
      db.chapters.toArray()
    ]);
    const bookOfChapter = new Map(chapters.map((c) => [c.id, c.bookId]));
    const qs = Array.from(index, ([id, chapterId]) => ({ id, bookId: bookOfChapter.get(chapterId) ?? "" }));
    const st = new Map(states.map((s) => [s.questionId, s]));
    const ann = new Map(anns.map((a) => [a.id, a]));
    const agg = () => ({ total: 0, seen: 0, correct: 0, answers: 0, right: 0 });
    const byBook = new Map<string, ReturnType<typeof agg>>();
    const byTopic = new Map<string, ReturnType<typeof agg>>();
    const bySub = new Map<string, ReturnType<typeof agg> & { topic: string }>();
    for (const q of qs) {
      const s = st.get(q.id);
      const a = ann.get(q.id);
      const buckets = [
        byBook.get(q.bookId) ?? byBook.set(q.bookId, agg()).get(q.bookId)!,
        byTopic.get(a?.topic ?? "Uncategorised") ?? byTopic.set(a?.topic ?? "Uncategorised", agg()).get(a?.topic ?? "Uncategorised")!
      ];
      if (a?.subtopic) buckets.push(bySub.get(a.subtopic) ?? bySub.set(a.subtopic, { ...agg(), topic: a.topic }).get(a.subtopic)!);
      for (const b of buckets) {
        b.total++;
        if (s?.timesSeen) {
          b.seen++;
          b.answers += s.timesSeen;
          b.right += s.timesCorrect;
          if (s.lastCorrect) b.correct++;
        }
      }
    }
    // activity per day, last 14 days (from session answers)
    const days = new Map<string, number>();
    for (let i = 13; i >= 0; i--) days.set(new Date(Date.now() - i * 86400000).toDateString(), 0);
    for (const s of states) if (s.lastSeenAt && days.has(new Date(s.lastSeenAt).toDateString())) days.set(new Date(s.lastSeenAt).toDateString(), days.get(new Date(s.lastSeenAt).toDateString())! + 1);
    const weak = Array.from(bySub.entries())
      .filter(([, v]) => v.answers >= 3)
      .sort((a, b) => a[1].right / a[1].answers - b[1].right / b[1].answers)
      .slice(0, 10);
    const now = Date.now();
    const due = states.filter((s) => s.timesSeen > 0 && s.srs.due <= now).length;
    const unsure = states.filter((s) => s.lastCorrect === true && (s.lastConfidence ?? 3) < 3).length;
    const sureWrong = states.filter((s) => s.lastCorrect === false && s.lastConfidence === 3).length;
    const times = sessions.flatMap((x) => Object.values(x.answers).map((a) => a.timeMs).filter((t) => t > 0 && t < 30 * 60_000));
    const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return { books, byBook, byTopic, weak, days, sessions: sessions.filter((s) => s.finishedAt).length, due, unsure, sureWrong, avgTime };
  });
  if (!data) return null;
  const maxDay = Math.max(1, ...data.days.values());

  const Bar = ({ label, v, onClick }: { label: string; v: { total: number; seen: number; answers: number; right: number }; onClick?: () => void }) => (
    <div className={`bar ${onClick ? "clickable" : ""}`} style={{ margin: "6px 0" }} onClick={onClick}>
      <span style={{ width: 230, flex: "none" }} className="small">
        {label}
      </span>
      <div className="progress" style={{ flex: 1 }}>
        <div style={{ width: `${v.answers ? (100 * v.right) / v.answers : 0}%`, background: !v.answers ? "transparent" : v.right / v.answers >= 0.7 ? "var(--good)" : v.right / v.answers >= 0.5 ? "var(--warn)" : "var(--bad)" }} />
      </div>
      <span className="small muted" style={{ width: 150, textAlign: "right" }}>
        {pct(v.right, v.answers)} · {pct(v.seen, v.total)} used
      </span>
    </div>
  );

  return (
    <div>
      <h1>Statistics</h1>
      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>Activity – last 14 days</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
          {Array.from(data.days.entries()).map(([d, n]) => (
            <div key={d} title={`${d}: ${n}`} style={{ flex: 1, background: "var(--accent)", opacity: n ? 1 : 0.15, height: `${Math.max(4, (100 * n) / maxDay)}%`, borderRadius: 3 }} />
          ))}
        </div>
        <div className="small muted">Questions last answered per day · {data.sessions} completed tests</div>
      </div>

      <div className="card stack">
        <h2 className="card-title" style={{ margin: 0 }}>Revision & confidence</h2>
        <div className="row" style={{ gap: 24 }}>
          <div>
            <div className="stat">{data.due}</div>
            <div className="muted small">due for revision</div>
          </div>
          <div>
            <div className="stat">{data.unsure}</div>
            <div className="muted small">right but unsure</div>
          </div>
          <div>
            <div className="stat">{data.sureWrong}</div>
            <div className="muted small">confidently wrong</div>
          </div>
          <div>
            <div className="stat">{data.avgTime ? formatDuration(data.avgTime) : "–"}</div>
            <div className="muted small">average time / question</div>
          </div>
        </div>
        <div className="row">
          <button className="small" disabled={!data.due} onClick={() => nav("/quiz", { state: { status: "due", title: "Due for revision" } })}>
            Revise due questions
          </button>
          <button className="small" disabled={!data.unsure} onClick={() => nav("/quiz", { state: { status: "unsure", title: "Right but unsure" } })}>
            Practise right-but-unsure
          </button>
        </div>
      </div>

      {data.weak.length > 0 && (
        <div className="card">
          <h2 className="card-title" style={{ marginTop: 0 }}>Weakest subtopics</h2>
          {data.weak.map(([s, v]) => (
            <Bar key={s} label={`${s}`} v={v} onClick={() => nav("/quiz", { state: { subtopics: [s], title: `Weak area: ${s}` } })} />
          ))}
          <div className="small muted">Click a row to build a test from it.</div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>By topic</h2>
        {Array.from(data.byTopic.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([t, v]) => (
            <Bar key={t} label={t} v={v} onClick={() => nav("/quiz", { state: { topics: [t], title: t } })} />
          ))}
      </div>
      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>By book</h2>
        {data.books.map((b) => data.byBook.get(b.id) && <Bar key={b.id} label={b.title} v={data.byBook.get(b.id)!} />)}
      </div>
    </div>
  );
}
