import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { caseText } from "../ai/tagger";
import { AiChat } from "../components/AiChat";
import { Annotations } from "../components/Annotations";
import { MediaList, Rich } from "../components/Rich";
import { db } from "../lib/db";

export default function CaseView() {
  const { id } = useParams();
  const c = useLiveQuery(async () => (await db.cases.get(id!)) ?? (await db.userCases.get(id!)) ?? null, [id]);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [mine, setMine] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState(false);

  if (c === undefined) return null;
  if (c === null) return <div className="card">Case not found.</div>;

  const visible = showAll ? c.stages.length : step;
  const finished = visible >= c.stages.length;

  return (
    <div>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{c.title}</h1>
        <label className="check small">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everything (review mode)
        </label>
      </div>
      <Annotations id={c.id} kind="case" extraTags={c.sourceTags} />

      <div className="card" style={{ marginTop: 10 }}>
        <div className="side-label muted small">PRESENTATION</div>
        <Rich text={c.presentation} bookId={c.bookId} />
        <MediaList media={c.presentationMedia} bookId={c.bookId} />
      </div>

      {c.stages.slice(0, visible + (finished ? 0 : 1)).map((s, i) => {
        const isCurrent = i === visible;
        if (isCurrent && !showAll)
          return (
            <div className="card" key={i}>
              <button className="primary" onClick={() => setStep(step + 1)}>
                Continue → {s.title}
              </button>
            </div>
          );
        return (
          <div className="card" key={i}>
            <h3 style={{ marginTop: 0 }}>{s.title}</h3>
            {s.content && <Rich text={s.content} bookId={c.bookId} />}
            <MediaList media={s.media} bookId={c.bookId} />
            {s.question && (
              <div className="stack" style={{ marginTop: 8 }}>
                <div>
                  <strong>Question:</strong>
                  <Rich text={s.question} bookId={c.bookId} />
                </div>
                {!revealed[i] && !showAll && (
                  <>
                    <textarea placeholder="Your answer (optional – think it through before revealing)" value={mine[i] ?? ""} onChange={(e) => setMine({ ...mine, [i]: e.target.value })} />
                    <div>
                      <button onClick={() => setRevealed({ ...revealed, [i]: true })}>Reveal answer</button>
                    </div>
                  </>
                )}
                {(revealed[i] || showAll) && s.answer && (
                  <div className="card explanation">
                    {mine[i] && (
                      <p className="small muted">
                        <strong>You wrote:</strong> {mine[i]}
                      </p>
                    )}
                    <Rich text={s.answer} bookId={c.bookId} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {(finished || showAll) && c.discussion && (
        <div className="card explanation">
          <h3 style={{ marginTop: 0 }}>Discussion</h3>
          <Rich text={c.discussion} bookId={c.bookId} />
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Case discussion with AI examiner</h3>
        <AiChat
          context={`Clinical case (the resident has seen up to stage ${visible} of ${c.stages.length}; do not reveal later stages unless asked):\n${caseText(c)}\n\nResident's written answers so far: ${JSON.stringify(mine)}`}
          starters={["Examine me on this case, oral-board style", "Critique my answers so far", "What are the key teaching points?", "What would change if the patient were elderly/anticoagulated?"]}
          placeholder="Answer the examiner or ask a question…"
        />
      </div>
    </div>
  );
}
