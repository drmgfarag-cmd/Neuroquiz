import { useLiveQuery } from "dexie-react-hooks";
import { ask, notify } from "../components/Dialog";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { exportBookZip } from "../import/exporter";
import { deleteBook } from "../import/importer";
import { saveFile } from "../lib/platform";
import { db, questionChapterIndex } from "../lib/db";
import { bundledBooks, bundledState, installBundled, type BundledBook, type BundledState } from "../lib/library";
import { clearMediaCache } from "../lib/media";
import { buildPool, createSession, emptyFilter } from "../lib/quiz";
import type { QuizMode } from "../lib/types";
import { pct } from "../lib/util";
import { auditBook } from "../lib/quality";

export default function Library() {
  const nav = useNavigate();
  const [exporting, setExporting] = useState("");
  const data = useLiveQuery(async () => {
    const [books, chapters, index, states] = await Promise.all([
      db.books.orderBy("title").toArray(),
      db.chapters.toArray(),
      questionChapterIndex(),
      db.questionStates.toArray()
    ]);
    const st = new Map(states.map((s) => [s.questionId, s]));
    const perChapter = new Map<string, { total: number; seen: number; correct: number }>();
    for (const [qid, chapterId] of index) {
      const c = perChapter.get(chapterId) ?? { total: 0, seen: 0, correct: 0 };
      c.total++;
      const s = st.get(qid);
      if (s && s.timesSeen) {
        c.seen++;
        if (s.lastCorrect) c.correct++;
      }
      perChapter.set(chapterId, c);
    }
    return { books, chapters, perChapter };
  });

  const start = async (mode: QuizMode, title: string, bookIds: string[], chapterIds: string[]) => {
    const pool = await buildPool({ ...emptyFilter(), bookIds, chapterIds }, mode === "review");
    if (!pool.length) return void notify("No questions in this selection.");
    const s = await createSession(pool, { mode, title, count: 0, shuffleQuestions: false, shuffleOptions: false, secondsPerQuestion: 90 });
    nav(`/quiz/${s.id}`);
  };

  if (!data) return null;
  if (!data.books.length)
    return (
      <div>
        <h1>Library</h1>
        <IncludedBooks />
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
      <IncludedBooks />
      <ProblemReports />
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
                <BookTitle id={b.id} title={b.title} />
                <div className="muted small">
                  {b.questionCount} questions · {b.flashcardCount} flashcards · {b.caseCount} cases · {chs.length} chapter{chs.length === 1 ? "" : "s"} · {pct(tot.seen, tot.total)} used
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
            <BookQualityReport bookId={b.id} />
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

/** Derived from the imported records, so fixing or re-importing a question updates this report. */
function BookQualityReport({ bookId }: { bookId: string }) {
  const report = useLiveQuery(async () => {
    const [questions, mediaKeys] = await Promise.all([
      db.questions.where("bookId").equals(bookId).toArray(),
      db.media.where("bookId").equals(bookId).primaryKeys()
    ]);
    return auditBook(questions, mediaKeys.map((k) => String(k).slice(bookId.length + 1)));
  }, [bookId]);
  if (!report) return null;
  const count = report.unscorable.length + report.missingImages.length + report.unreferencedImages.length + report.conflictingImageRoles.length;
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="clickable small" style={count ? { color: "var(--warn)" } : undefined}>
        Content check: {count ? `${count} item${count === 1 ? "" : "s"} to review` : "no answer-key or image-link issues detected"}
        {report.noExplanation.length ? ` · ${report.noExplanation.length} without explanation` : ""}
      </summary>
      {report.unscorable.length > 0 && <div className="small"><strong>Unresolved answers · excluded from scored tests</strong>
        {report.unscorable.map((q) => <div key={q.id}><Link to={`/question/${encodeURIComponent(q.id)}`}>Q{q.number}: {q.sourceId ?? q.stem.slice(0, 70)}</Link></div>)}
      </div>}
      {([
        ["Missing image files", report.missingImages],
        ["Images not referenced by questions", report.unreferencedImages],
        ["Question/answer image role conflicts", report.conflictingImageRoles]
      ] as [string, string[]][]).filter(([, items]) => items.length).map(([label, items]) => (
        <div key={label} className="small" style={{ marginTop: 8 }}>
          <strong>{label} ({items.length})</strong>
          <div className="muted" style={{ maxHeight: 120, overflow: "auto" }}>{items.map((item, i) => <div key={`${item}-${i}`}>{item}</div>)}</div>
        </div>
      ))}
      {report.noExplanation.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{report.noExplanation.length} question(s) have no explanation in the source.</div>}
      <p className="small muted">This check verifies links, roles and answer-key presence. It cannot establish the medical correctness of an answer or image content without its source page.</p>
    </details>
  );
}

/** Book name with an inline rename (ids don't depend on the name, so progress is kept). */
function BookTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  if (!editing)
    return (
      <div className="row" style={{ gap: 4 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="small ghost" title="Rename book" aria-label={`Rename ${title}`} onClick={() => (setDraft(title), setEditing(true))}>
          ✎
        </button>
      </div>
    );
  const save = async () => {
    const t = draft.trim();
    if (t && t !== title) await db.books.update(id, { title: t });
    setEditing(false);
  };
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input id={`rename-${id}`} type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} style={{ minWidth: 240 }} />
      <button className="small primary" type="submit">
        Save
      </button>
      <button className="small" type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

const STATE_LABEL: Record<BundledState, string> = { "not-installed": "Not in your library", installed: "In your library", update: "Updated version available" };

/** Books that ship with the app: install, update or restore them. */
function IncludedBooks() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [books, setBooks] = useState<BundledBook[] | null>(null);
  useEffect(() => {
    bundledBooks().then(setBooks);
  }, []);
  // live: re-checks when books are imported, updated or deleted
  const states = useLiveQuery(() => Promise.all((books ?? []).map(bundledState)), [books]);
  if (!books?.length || !states || states.length !== books.length) return null;
  const list = books.map((b, i) => ({ b, state: states[i] }));
  const install = async (b: BundledBook) => {
    setBusy(b.id);
    setMsg("");
    try {
      const n = await installBundled(b, setMsg);
      setMsg(`“${b.title}”: ${n} questions ready.`);
    } catch (e) {
      setMsg(`Could not import “${b.title}”: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };
  const missing = list.filter((x) => x.state !== "installed");
  return (
    <details className="card" open={missing.length > 0}>
      <summary className="clickable">
        <strong>Included books</strong>{" "}
        <span className="muted small">
          {list.length} built into the app{missing.length ? ` · ${missing.length} to import or update` : ""}
        </span>
      </summary>
      {list.map(({ b, state }) => (
        <div className="list-item" key={b.id}>
          <div style={{ flex: 1 }}>
            <div>{b.title}</div>
            <div className={`small ${state === "installed" ? "muted" : ""}`} style={state === "update" ? { color: "var(--warn)" } : undefined}>
              {STATE_LABEL[state]}
            </div>
          </div>
          <button className={`small ${state === "installed" ? "" : "primary"}`} disabled={!!busy} onClick={() => install(b)}>
            {busy === b.id ? "Importing…" : state === "not-installed" ? "Import" : state === "update" ? "Update" : "Re-import"}
          </button>
        </div>
      ))}
      {msg && <div className="small muted">{msg}</div>}
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        Updating or re-importing keeps your progress, notes and tags.
      </p>
    </details>
  );
}

/** Questions the learner reported as wrong; the list can be copied and sent for fixing. */
function ProblemReports() {
  const nav = useNavigate();
  const [copied, setCopied] = useState("");
  const [fallback, setFallback] = useState("");
  const reports = useLiveQuery(async () => {
    const states = (await db.questionStates.toArray()).filter((s) => s.issue);
    if (!states.length) return [];
    const [qs, chapters, books] = await Promise.all([db.questions.bulkGet(states.map((s) => s.questionId)), db.chapters.toArray(), db.books.toArray()]);
    const ch = new Map(chapters.map((c) => [c.id, c.title]));
    const bk = new Map(books.map((b) => [b.id, b.title]));
    return states.map((s, i) => {
      const q = qs[i];
      return { id: s.questionId, where: q ? `${bk.get(q.bookId) ?? q.bookId} › ${ch.get(q.chapterId) ?? ""} › Q${q.number}` : `(question no longer in library) ${s.questionId}`, issue: s.issue! };
    });
  });
  if (!reports?.length) return null;
  const text = reports.map((r) => `${r.where} [${r.id}]: ${r.issue}`).join("\n");
  return (
    <details className="card">
      <summary className="clickable">
        <strong>Reported problems</strong> <span className="chip warn">{reports.length}</span>
      </summary>
      {reports.map((r) => (
        <div className="list-item" key={r.id}>
          <div style={{ flex: 1 }}>
            <Link to={`/question/${encodeURIComponent(r.id)}`} className="small">
              {r.where}
            </Link>
            <div>{r.issue}</div>
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="small"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => setCopied("Copied – paste it into your message."))
              .catch(() => setFallback(text))
          }
        >
          Copy list
        </button>
        <button className="small" onClick={() => nav("/quiz", { state: { status: "reported", title: "Reported problems" } })}>
          Test these questions
        </button>
        <span className="small muted">{copied}</span>
      </div>
      {fallback && <textarea id="report-copy" readOnly value={fallback} onFocus={(e) => e.target.select()} autoFocus style={{ marginTop: 8 }} />}
    </details>
  );
}
