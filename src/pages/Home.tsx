import { useLiveQuery } from "dexie-react-hooks";
import { notify } from "../components/Dialog";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icons";
import { SECTION_HUE } from "../lib/colors";
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
    // study streak: consecutive days with answered questions or reviewed cards
    const day = (t: number) => new Date(t).toDateString();
    const active = new Set<string>();
    states.forEach((s) => s.lastSeenAt && active.add(day(s.lastSeenAt)));
    cardStates.forEach((c) => c.srs.reps + c.srs.lapses > 0 && active.add(day(c.updatedAt)));
    sessions.forEach((s) => s.finishedAt && Object.keys(s.answers).length && active.add(day(s.finishedAt)));
    let streak = 0;
    for (let d = active.has(day(now)) ? now : now - 86_400_000; active.has(day(d)); d -= 86_400_000) streak++;
    const today = states.filter((s) => s.lastSeenAt && day(s.lastSeenAt) === day(now)).length;
    return { streak, today, books, questions, seen: seen.length, correct, total, dueQ, dueCards, cards: cards.length, unfinished, cases: cases + userCases, flagged: states.filter((s) => s.flagged).length };
  });

  if (!data) return null;

  const quick = async (status: "due" | "incorrect" | "unused" | "flagged", title: string) => {
    const pool = await buildPool({ ...emptyFilter(), status });
    if (!pool.length) return void notify("No questions match.");
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const acc = data.total ? Math.round((100 * data.correct) / data.total) : 0;
  const hue = (to: string) => ({ ["--h" as string]: SECTION_HUE[to] ?? 212 });

  return (
    <div>
      <section className="hero">
        <span className="hero-kicker">YOUR STUDY DESK</span>
        <h1>{greeting}. Ready for a focused session?</h1>
        <div className="sub">
          {data.questions.toLocaleString()} questions in {data.books} books · {pct(data.seen, data.questions)} done so far
        </div>
        <div className="hero-stats">
          <span className="pill">🔥 {data.streak} day{data.streak === 1 ? "" : "s"} streak</span>
          <span className="pill">✎ {data.today} answered today</span>
          <span className="pill">⏳ {data.dueQ + data.dueCards} reviews due</span>
        </div>
        <div className="hero-progress"><div className="row between small"><span>Question bank explored</span><strong>{pct(data.seen, data.questions)}</strong></div><div className="progress"><div style={{ width: pct(data.seen, data.questions) }} /></div></div>
        <div className="row" style={{ marginTop: 14 }}>
          {data.unfinished ? (
            <Link className="btn light" to={`/quiz/${data.unfinished.id}`}>
              ▶ Resume “{data.unfinished.title}” ({Object.keys(data.unfinished.answers).length}/{data.unfinished.questionIds.length})
            </Link>
          ) : (
            <Link className="btn light" to="/quiz">
              <Icon.quiz /> Create a test
            </Link>
          )}
          {data.dueQ > 0 && (
            <button className="btn light" onClick={() => quick("due", "Revision – due questions")}>
              Revise {data.dueQ} due
            </button>
          )}
        </div>
      </section>

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="card stat-tile" style={hue("/library")}>
          <span className="badge">
            <Icon.book />
          </span>
          <div>
            <div className="muted small">Question bank</div>
            <div className="stat">{data.questions.toLocaleString()}</div>
            <div className="muted small">{data.seen.toLocaleString()} used</div>
          </div>
        </div>
        <div className="card stat-tile" style={hue("/stats")}>
          <span className="ring" style={{ ["--p" as string]: acc }}>
            {data.total ? `${acc}%` : "–"}
          </span>
          <div>
            <div className="muted small">Accuracy</div>
            <div className="stat">{pct(data.correct, data.total)}</div>
            <div className="muted small">{data.total.toLocaleString()} answers</div>
          </div>
        </div>
        <div className="card stat-tile" style={hue("/quiz")}>
          <span className="badge">
            <Icon.history />
          </span>
          <div>
            <div className="muted small">Questions due</div>
            <div className="stat">{data.dueQ}</div>
            <button className="small primary" disabled={!data.dueQ} onClick={() => quick("due", "Revision – due questions")}>
              Revise now
            </button>
          </div>
        </div>
        <div className="card stat-tile" style={hue("/flashcards")}>
          <span className="badge">
            <Icon.cards />
          </span>
          <div>
            <div className="muted small">Flashcards due</div>
            <div className="stat">{data.dueCards}</div>
            <Link className="btn small primary" to="/flashcards">
              Study cards
            </Link>
          </div>
        </div>
      </div>

      <div className="section-head"><div><span className="eyebrow">CHOOSE YOUR NEXT STEP</span><h2>Quick start</h2></div></div>
      <div className="row quick-row">
        <Link className="btn primary" to="/quiz">
          <Icon.quiz /> Create a test
        </Link>
        <button onClick={() => quick("unused", "Unused questions")}>✨ Unused questions</button>
        <button onClick={() => quick("incorrect", "Previously incorrect")}>↺ Incorrect questions</button>
        <button disabled={!data.flagged} onClick={() => quick("flagged", "Flagged questions")}>
          <Icon.flag /> Flagged ({data.flagged})
        </button>
        <Link className="btn" to="/mock">
          <Icon.timer /> Mock exam
        </Link>
        <Link className="btn" to="/cases">
          <Icon.cases /> Cases & Q&A ({data.cases})
        </Link>
      </div>

      <div className="section-head"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Explore the library</h2></div><Link to="/library" className="small">View books →</Link></div>
      <div className="grid">
        {[
          ["/library", "Library", "Books & chapters", Icon.book],
          ["/mock", "Mock exam", "Timed exam mixing several books", Icon.timer],
          ["/flashcards", "Flashcards", "Flip cards with spaced repetition", Icon.cards],
          ["/cases", "Cases & Q&A", "Clinical cases and short-answer books", Icon.cases],
          ["/atlas", "Image atlas", "Every figure and scan, with its question", Icon.image],
          ["/reference", "Lab values & scales", "Normal values and grading scales", Icon.lab],
          ["/answer-check", "Answer check", "Let the AI flag suspicious answer keys", Icon.sparkle],
          ["/search", "Search", "Find by topic, keyword or question", Icon.search],
          ["/tagging", "AI tagging", "Categorise questions by topic", Icon.tag],
          ["/history", "History", "Past tests & results", Icon.history],
          ["/stats", "Statistics", "Strengths and weak topics", Icon.stats],
          ["/import", "Import", "Add books, chapters & images", Icon.upload],
          ["/settings", "Settings", "AI provider, sync, backup, theme", Icon.settings]
        ].map(([to, label, desc, I]) => {
          const C = I as typeof Icon.book;
          return (
            <Link key={to as string} to={to as string} className="card clickable tile" style={hue(to as string)}>
              <span className="badge">
                <C />
              </span>
              <span>
                <strong>{label as string}</strong>
                <div className="muted small">{desc as string}</div>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
