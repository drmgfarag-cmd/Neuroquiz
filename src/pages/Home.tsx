import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icons";
import { allFlashcards, db } from "../lib/db";
import { buildPool, createSession, emptyFilter } from "../lib/quiz";
import { pct } from "../lib/util";

export default function Home() {
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const now = Date.now();
    const [books, questions, states, sessions, cards, cardStates, cases, userCases] = await Promise.all([
      db.books.count(),
      db.questions.count(),
      db.questionStates.toArray(),
      db.sessions.orderBy("startedAt").reverse().limit(50).toArray(),
      allFlashcards(),
      db.cardStates.toArray(),
      db.cases.count(),
      db.userCases.count()
    ]);
    const seen = states.filter((s) => s.timesSeen > 0);
    const correct = seen.reduce((n, s) => n + s.timesCorrect, 0);
    const total = seen.reduce((n, s) => n + s.timesSeen, 0);
    const dueQ = seen.filter((s) => s.srs.due <= now).length;
    const cs = new Map(cardStates.map((c) => [c.cardId, c]));
    const dueCards = cards.filter((c) => {
      const s = cs.get(c.id);
      return !s || (!s.suspended && s.srs.due <= now);
    }).length;
    const unfinished = sessions.find((s) => !s.finishedAt);
    return { books, questions, seen: seen.length, correct, total, dueQ, dueCards, cards: cards.length, unfinished, cases: cases + userCases, flagged: states.filter((s) => s.flagged).length };
  });

  if (!data) return null;

  const quick = async (status: "due" | "incorrect" | "unused" | "flagged", title: string) => {
    const pool = await buildPool({ ...emptyFilter(), status });
    if (!pool.length) return alert("No questions match.");
    const s = await createSession(pool, { mode: "tutor", title, count: 40, shuffleQuestions: true, shuffleOptions: false, secondsPerQuestion: 90 });
    nav(`/quiz/${s.id}`);
  };

  if (!data.books) {
    return (
      <div>
        <h1>Welcome to NeuroQuiz</h1>
        <div className="card stack">
          <p>Import your extracted neurosurgery books (JSON + image files, or a ZIP) to get started.</p>
          <div className="row">
            <Link className="btn primary" to="/import">
              <Icon.upload /> Import books
            </Link>
            <Link className="btn" to="/settings">
              <Icon.settings /> Settings & sync
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      {data.unfinished && (
        <div className="card row between" style={{ borderColor: "var(--accent)" }}>
          <div>
            <strong>Resume:</strong> {data.unfinished.title}{" "}
            <span className="muted small">
              ({Object.keys(data.unfinished.answers).length}/{data.unfinished.questionIds.length} answered)
            </span>
          </div>
          <Link className="btn primary" to={`/quiz/${data.unfinished.id}`}>
            Continue
          </Link>
        </div>
      )}
      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="muted small">Question bank</div>
          <div className="stat">{data.questions.toLocaleString()}</div>
          <div className="muted small">
            {data.books} books · {data.seen.toLocaleString()} used ({pct(data.seen, data.questions)})
          </div>
        </div>
        <div className="card">
          <div className="muted small">Accuracy</div>
          <div className="stat">{pct(data.correct, data.total)}</div>
          <div className="muted small">{data.total.toLocaleString()} answers</div>
        </div>
        <div className="card">
          <div className="muted small">Due for revision</div>
          <div className="stat">{data.dueQ}</div>
          <button className="small primary" disabled={!data.dueQ} onClick={() => quick("due", "Revision – due questions")}>
            Revise now
          </button>
        </div>
        <div className="card">
          <div className="muted small">Flashcards due</div>
          <div className="stat">{data.dueCards}</div>
          <Link className="btn small primary" to="/flashcards">
            Study cards
          </Link>
        </div>
      </div>

      <h2>Quick start</h2>
      <div className="row">
        <Link className="btn primary" to="/quiz">
          <Icon.quiz /> Create a test
        </Link>
        <button onClick={() => quick("unused", "Unused questions")}>Unused questions</button>
        <button onClick={() => quick("incorrect", "Previously incorrect")}>Incorrect questions</button>
        <button disabled={!data.flagged} onClick={() => quick("flagged", "Flagged questions")}>
          <Icon.flag /> Flagged ({data.flagged})
        </button>
        <Link className="btn" to="/cases">
          <Icon.cases /> Cases ({data.cases})
        </Link>
      </div>

      <h2>All sections</h2>
      <div className="grid">
        {[
          ["/library", "Library", "Books & chapters", Icon.book],
          ["/search", "Search", "Find by topic, keyword or question", Icon.search],
          ["/tagging", "AI tagging", "Categorise questions by topic", Icon.tag],
          ["/history", "History", "Past tests & results", Icon.history],
          ["/stats", "Statistics", "Strengths and weak topics", Icon.stats],
          ["/import", "Import", "Add books, chapters & images", Icon.upload],
          ["/settings", "Settings", "API key, sync, backup, theme", Icon.settings]
        ].map(([to, label, desc, I]) => {
          const C = I as typeof Icon.book;
          return (
            <Link key={to as string} to={to as string} className="card clickable" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row">
                <C /> <strong>{label as string}</strong>
              </div>
              <div className="muted small">{desc as string}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
