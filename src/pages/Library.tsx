import { useLiveQuery } from "dexie-react-hooks";
import { ask, notify } from "../components/Dialog";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { exportBookZip } from "../import/exporter";
import { deleteBook } from "../import/importer";
import { saveFile } from "../lib/platform";
import { db } from "../lib/db";
import { clearMediaCache } from "../lib/media";
import { buildPool, createSession, emptyFilter } from "../lib/quiz";
import type { QuizMode } from "../lib/types";
import { pct } from "../lib/util";

export default function Library() {
  const nav = useNavigate();
  const [exporting, setExporting] = useState("");
  const data = useLiveQuery(async () => {
    const [books, chapters, questions, states] = await Promise.all([
      db.books.orderBy("title").toArray(),
      db.chapters.toArray(),
      db.questions.toArray(),
      db.questionStates.toArray()
    ]);
    const st = new Map(states.map((s) => [s.questionId, s]));
    const perChapter = new Map<string, { total: number; seen: number; correct: number }>();
    for (const q of questions) {
      const c = perChapter.get(q.chapterId) ?? { total: 0, seen: 0, correct: 0 };
      c.total++;
      const s = st.get(q.id);
      if (s && s.timesSeen) {
        c.seen++;
        if (s.lastCorrect) c.correct++;
      }
      perChapter.set(q.chapterId, c);
    }
    return { books, chapters, perChapter };
  });

  const start = async (mode: QuizMode, title: string, bookIds: string[], chapterIds: string[]) => {
    const pool = await buildPool({ ...emptyFilter(), bookIds, chapterIds });
    if (!pool.length) return void notify("No questions in this selection.");
    const s = await createSession(pool, { mode, title, count: 0, shuffleQuestions: false, shuffleOptions: false, secondsPerQuestion: 90 });
    nav(`/quiz/${s.id}`);
  };

  if (!data) return null;
  if (!data.books.length)
    return (
      <div>
        <h1>Library</h1>
        <div className="card">
          No books yet. <Link to="/import">Import a book</Link>.
        </div>
      </div>
    );

  return (
    <div>
      <div className="row between">
        <h1>Library</h1>
        <Link className="btn" to="/import">
          Import more
        </Link>
      </div>
      {data.books.map((b) => {
        const chs = data.chapters.filter((c) => c.bookId === b.id).sort((a, z) => a.order - z.order);
        const tot = chs.reduce(
          (acc, c) => {
            const p = data.perChapter.get(c.id);
            if (p) {
              acc.total += p.total;
              acc.seen += p.seen;
            }
            return acc;
          },
          { total: 0, seen: 0 }
        );
        return (
          <div className="card" key={b.id}>
            <div className="row between">
              <div>
                <h2 style={{ margin: 0 }}>{b.title}</h2>
                <div className="muted small">
                  {b.questionCount} questions · {b.flashcardCount} flashcards · {b.caseCount} cases · {chs.length} chapters · {pct(tot.seen, tot.total)} used
                </div>
              </div>
              <div className="row">
                <button className="primary small" onClick={() => start("tutor", b.title, [b.id], [])}>
                  Tutor
                </button>
                <button className="small" onClick={() => start("review", `Review – ${b.title}`, [b.id], [])}>
                  Read
                </button>
                <button
                  className="small"
                  disabled={!!exporting}
                  title="ZIP with questions, images and tags – import it on another device, no internet needed"
                  onClick={async () => {
                    setExporting(b.id);
                    try {
                      const { blob, name } = await exportBookZip(b.id);
                      await saveFile(blob, name);
                    } catch (e) {
                      notify(`Export failed: ${(e as Error).message}`);
                    } finally {
                      setExporting("");
                    }
                  }}
                >
                  {exporting === b.id ? "Exporting…" : "Export ZIP"}
                </button>
                <button
                  className="small danger"
                  onClick={async () => {
                    if (!(await ask(`Delete “${b.title}” and its images? Your progress is kept and reattaches if you re-import the book.`, { confirmLabel: "Delete book", danger: true }))) return;
                    await deleteBook(b.id);
                    clearMediaCache();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary className="clickable">Chapters</summary>
              {chs.map((c) => {
                const p = data.perChapter.get(c.id) ?? { total: 0, seen: 0, correct: 0 };
                return (
                  <div className="list-item" key={c.id}>
                    <div style={{ flex: 1 }}>
                      <div>{c.title}</div>
                      <div className="muted small">
                        {p.total} questions · {pct(p.seen, p.total)} used · {pct(p.correct, p.seen)} correct
                      </div>
                      <div className="progress" style={{ marginTop: 4 }}>
                        <div style={{ width: `${p.total ? (100 * p.seen) / p.total : 0}%` }} />
                      </div>
                    </div>
                    <div className="row">
                      <button className="small" disabled={!p.total} onClick={() => start("tutor", `${b.title} – ${c.title}`, [], [c.id])}>
                        Tutor
                      </button>
                      <button className="small" disabled={!p.total} onClick={() => start("exam", `${b.title} – ${c.title} (exam)`, [], [c.id])}>
                        Exam
                      </button>
                      <button className="small" disabled={!p.total} onClick={() => start("review", `Review – ${c.title}`, [], [c.id])}>
                        Read
                      </button>
                    </div>
                  </div>
                );
              })}
            </details>
          </div>
        );
      })}
    </div>
  );
}
