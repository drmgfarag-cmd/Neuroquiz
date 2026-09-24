import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { describeAiError } from "../ai/claude";
import { questionText } from "../ai/tagger";
import { AiChat } from "../components/AiChat";
import { Annotations } from "../components/Annotations";
import { QuestionEditor } from "../components/QuestionEditor";
import { ReportIssue } from "../components/ReportIssue";
import { Explanation, QuestionView } from "../components/QuestionView";
import { addAiCards, addQuestionCard } from "../lib/cards";
import { db } from "../lib/db";
import { applyChoice } from "../lib/grading";
import { setFlag } from "../lib/quiz";
import { useOnline } from "../lib/platform";
import { pct } from "../lib/util";

export default function QuestionPage() {
  const { id } = useParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [msg, setMsg] = useState("");
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const data = useLiveQuery(async () => {
    const q = await db.questions.get(id!);
    if (!q) return null;
    const [st, book, ch] = await Promise.all([db.questionStates.get(q.id), db.books.get(q.bookId), db.chapters.get(q.chapterId)]);
    return { q, st, book, ch };
  }, [id]);
  if (data === undefined) return null;
  if (data === null) return <div className="card">Question not found.</div>;
  const { q, st, book, ch } = data;
  return (
    <div>
      <div className="muted small">
        {book?.title} › {ch?.title} › Q{q.number}
      </div>
      <div data-gallery="">
      <div className="card" style={{ marginTop: 8 }}>
        <QuestionView q={q} selected={selected} revealed={revealed} onSelect={(k, v) => setSelected(applyChoice(q, selected, k, v))} />
        <div className="row" style={{ marginTop: 10 }}>
          {!revealed && (
            <button className="primary" onClick={() => setRevealed(true)}>
              Show answer
            </button>
          )}
          <button className={st?.flagged ? "active" : ""} onClick={() => setFlag(q.id, !st?.flagged)}>
            {st?.flagged ? "Flagged" : "Flag"}
          </button>
          {st && (
            <span className="small muted">
              Seen {st.timesSeen}× · {pct(st.timesCorrect, st.timesSeen)} correct
            </span>
          )}
        </div>
      </div>
      {revealed && <Explanation q={q} selected={selected} />}
      </div>
      <Annotations id={q.id} kind="question" extraTags={q.sourceTags} />
      {st?.note && (
        <div className="card small">
          <strong>My note:</strong> {st.note}
        </div>
      )}
      <div className="card stack">
        {editing && <QuestionEditor q={q} issue={st?.issue} onDone={() => setEditing(false)} />}
        <div className="row">
          <button className="small" onClick={() => setEditing(!editing)}>
            ✎ Edit question{q.edited ? " (edited)" : ""}
          </button>
          <ReportIssue questionId={q.id} issue={st?.issue} />
          <button className="small" onClick={async () => (await addQuestionCard(q), setMsg("Added to flashcards."))}>
            + Flashcard
          </button>
          <button
            className="small"
            disabled={!online}
            onClick={async () => {
              setMsg("Generating…");
              try {
                setMsg(`Added ${await addAiCards(q)} AI flashcards.`);
              } catch (e) {
                setMsg(describeAiError(e));
              }
            }}
          >
            + AI flashcards
          </button>
          <span className="small muted">{msg}</span>
        </div>
        <h3 style={{ margin: 0 }}>AI tutor</h3>
        <AiChat context={questionText(q)} starters={["Explain this question in depth", "Why are the other options wrong?", "Related high-yield facts"]} />
      </div>
    </div>
  );
}
