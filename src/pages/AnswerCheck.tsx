import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { runAnswerCheck, type CheckProgress } from "../ai/answerCheck";
import { aiUnavailableReason, describeAiError } from "../ai/claude";
import { saveCorrection } from "../lib/corrections";
import { db } from "../lib/db";
import { answerSummary, formatOf } from "../lib/grading";
import { plain } from "../lib/markdown";
import { useOnline } from "../lib/platform";
import { useSettings } from "../lib/settings";
import type { AiReview, Question } from "../lib/types";

type Show = "problems" | "all";

export default function AnswerCheck() {
  const settings = useSettings();
  const online = useOnline();
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(true);
  const [progress, setProgress] = useState<CheckProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState<Show>("problems");
  const abort = useRef<AbortController | null>(null);

  const books = useLiveQuery(() => db.books.orderBy("title").toArray());
  const chapters = useLiveQuery(() => (bookId ? db.chapters.where("bookId").equals(bookId).sortBy("order") : []), [bookId]);
  const results = useLiveQuery(async () => {
    const reviews = await db.aiReviews.toArray();
    const qs = await db.questions.bulkGet(reviews.map((r) => r.questionId));
    return reviews
      .map((r, i) => ({ r, q: qs[i] }))
      .filter((x) => x.q && (!bookId || x.q.bookId === bookId) && (!chapterId || x.q.chapterId === chapterId))
      .sort((a, b) => rank(a.r) - rank(b.r) || a.q!.order - b.q!.order);
  }, [bookId, chapterId]);

  const blocked = aiUnavailableReason();
  const run = async () => {
    const qs = chapterId ? await db.questions.where("chapterId").equals(chapterId).sortBy("order") : bookId ? await db.questions.where("bookId").equals(bookId).sortBy("order") : [];
    if (!qs.length) return;
    setRunning(true);
    setMsg("");
    abort.current = new AbortController();
    try {
      const p = await runAnswerCheck(qs, onlyUnchecked, setProgress, abort.current.signal);
      setMsg(p.total === 0 ? "Everything here has been checked already." : `Checked ${p.done} question(s)${p.failed ? `, ${p.failed} failed – run again to retry` : ""}.`);
    } catch (e) {
      setMsg(describeAiError(e));
    } finally {
      setRunning(false);
    }
  };

  const problems = results?.filter((x) => x.r.verdict !== "agree" && !x.r.dismissed) ?? [];
  const list = show === "problems" ? problems : (results ?? []);
  const selected = chapterId ? chapters?.find((c) => c.id === chapterId)?.title : books?.find((b) => b.id === bookId)?.title;

  return (
    <div>
      <h1>AI answer check</h1>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          The AI reads each question with its answer key and explanation and flags keys that look wrong, contradict the explanation, or are garbled by OCR. Nothing
          changes until you apply a suggestion or edit the question.
        </p>
        <div className="row">
          <label className="field">
            Book
            <select
              id="check-book"
              value={bookId}
              onChange={(e) => {
                setBookId(e.target.value);
                setChapterId("");
              }}
            >
              <option value="">Choose a book…</option>
              {books?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.questionCount})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Chapter
            <select id="check-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={!bookId}>
              <option value="">Whole book</option>
              {chapters?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check small">
          <input type="checkbox" checked={onlyUnchecked} onChange={(e) => setOnlyUnchecked(e.target.checked)} /> Skip questions already checked
        </label>
        <div className="row">
          <button className="primary" disabled={running || !bookId || !!blocked || !online} onClick={run}>
            ✦ Check answers{selected ? ` in “${selected}”` : ""}
          </button>
          {running && <button onClick={() => abort.current?.abort()}>Stop</button>}
          <span className="small muted">Model: {settings.model}</span>
        </div>
        {blocked && (
          <p className="small muted" style={{ margin: 0 }}>
            {blocked} <Link to="/settings">Settings</Link>
          </p>
        )}
        {progress && (running || progress.total > 0) && (
          <div>
            <div className="progress">
              <div style={{ width: `${progress.total ? (100 * (progress.done + progress.failed)) / progress.total : 100}%` }} />
            </div>
            <div className="small muted">
              {progress.done} / {progress.total} checked{progress.failed ? `, ${progress.failed} failed` : ""}
              {progress.lastError ? ` – ${progress.lastError}` : ""}
            </div>
          </div>
        )}
        {msg && <div className="small">{msg}</div>}
      </div>

      <div className="row between" style={{ margin: "16px 0 8px" }}>
        <h2 style={{ margin: 0 }}>Results</h2>
        <div className="segmented">
          <button className={show === "problems" ? "active" : ""} onClick={() => setShow("problems")}>
            Needs attention ({problems.length})
          </button>
          <button className={show === "all" ? "active" : ""} onClick={() => setShow("all")}>
            All checked ({results?.length ?? 0})
          </button>
        </div>
      </div>
      <div className="card">
        {!list.length && <div className="muted">{results?.length ? "No disagreements – every checked answer key looks right." : "No questions checked yet."}</div>}
        {list.map(({ r, q }) => (
          <ReviewRow key={r.questionId} r={r} q={q!} />
        ))}
      </div>
    </div>
  );
}

const rank = (r: AiReview) => (r.dismissed ? 3 : r.verdict === "disagree" ? 0 : r.verdict === "unsure" ? 1 : 2);

function ReviewRow({ r, q }: { r: AiReview; q: Question }) {
  const [msg, setMsg] = useState("");
  const f = formatOf(q);
  const canApply = r.verdict === "disagree" && (f === "single" || f === "multi") && r.suggestedKeys.length > 0 && JSON.stringify([...r.suggestedKeys].sort()) !== JSON.stringify([...q.answer].sort());
  return (
    <div className="list-item">
      <div style={{ flex: 1 }} className="stack">
        <div className="row small">
          <span className={`chip ${r.verdict === "agree" ? "good" : r.verdict === "disagree" ? "bad" : "warn"}`}>{r.verdict === "agree" ? "Key looks right" : r.verdict === "disagree" ? "Key looks wrong" : "Unsure"}</span>
          {r.dismissed && <span className="chip">dismissed</span>}
          {q.edited && <span className="chip accent">edited</span>}
          <Link to={`/question/${encodeURIComponent(q.id)}`}>Q{q.number}</Link>
        </div>
        <div>{plain(q.stem, 180)}</div>
        <div className="small">
          <strong>Book key:</strong> {answerSummary(q, f === "truefalse" || f === "matching")}
        </div>
        {r.verdict !== "agree" && (
          <div className="small">
            <strong>AI:</strong> {r.suggestion}
          </div>
        )}
        <div className="small muted">{r.reason}</div>
        {r.verdict !== "agree" && !r.dismissed && (
          <div className="row">
            {canApply && (
              <button
                className="small primary"
                onClick={async () => {
                  await saveCorrection(q, { answer: r.suggestedKeys });
                  setMsg(`Answer changed to ${r.suggestedKeys.join(", ")} (Edit question → Revert to undo).`);
                }}
              >
                Use the AI's answer ({r.suggestedKeys.join(", ")})
              </button>
            )}
            <Link className="btn small" to={`/question/${encodeURIComponent(q.id)}`}>
              Open & edit
            </Link>
            <button className="small" onClick={() => db.aiReviews.update(r.questionId, { dismissed: true, updatedAt: Date.now() })}>
              Book is right – dismiss
            </button>
            {msg && <span className="small muted">{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
