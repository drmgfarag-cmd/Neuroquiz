import { useLiveQuery } from "dexie-react-hooks";
import { ask } from "../components/Dialog";
import { Link } from "react-router-dom";
import { db, deleteSynced } from "../lib/db";
import { pct } from "../lib/util";

export default function History() {
  const sessions = useLiveQuery(() => db.sessions.orderBy("startedAt").reverse().toArray());
  if (!sessions) return null;
  return (
    <div>
      <h1>Test history</h1>
      <div className="card">
        {!sessions.length && <div className="muted">No tests yet.</div>}
        {sessions.map((s) => {
          const answered = Object.values(s.answers).filter((a) => a.selected.length).length;
          return (
            <div className="list-item" key={s.id}>
              <div style={{ flex: 1 }}>
                <div>{s.title}</div>
                <div className="muted small">
                  {new Date(s.startedAt).toLocaleString()} · {s.mode} · {s.questionIds.length} questions
                  {s.finishedAt ? ` · score ${pct(s.score ?? 0, s.questionIds.length)}` : ` · in progress (${answered} answered)`}
                </div>
              </div>
              <div className="row">
                {s.finishedAt && s.mode !== "review" ? (
                  <Link className="btn small" to={`/results/${s.id}`}>
                    Results
                  </Link>
                ) : (
                  <Link className="btn small primary" to={`/quiz/${s.id}`}>
                    {s.mode === "review" ? "Open" : "Resume"}
                  </Link>
                )}
                <button className="small ghost" onClick={async () => (await ask("Delete this test from history?", { confirmLabel: "Delete", danger: true })) && deleteSynced("sessions", s.id)}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
