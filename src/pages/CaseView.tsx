import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { caseText } from "../ai/tagger";
import { AiChat } from "../components/AiChat";
import { Annotations } from "../components/Annotations";
import { MediaList, Rich } from "../components/Rich";
import { useViewer } from "../components/ImageViewer";
import { db } from "../lib/db";
import { resolveMedia } from "../lib/media";
import type { MediaRef } from "../lib/types";

export default function CaseView() {
  const { id } = useParams();
  const c = useLiveQuery(async () => (await db.cases.get(id!)) ?? (await db.userCases.get(id!)) ?? null, [id]);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [mine, setMine] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState(false);
  const viewer = useViewer();
  const openFigures = async (media: MediaRef[]) => {
    const urls = await Promise.all(media.map(async (m) => ({ src: await resolveMedia(c?.bookId, m.file), caption: m.caption ?? m.file })));
    const available = urls.filter((m): m is { src: string; caption: string } => !!m.src);
    if (available.length) viewer.open(available, 0);
  };
  useEffect(() => { setStep(0); setRevealed({}); setMine({}); setShowAll(false); }, [id]);

  if (c === undefined) return null;
  if (c === null) return <div className="card">Case not found.</div>;

  if (c.kind === "qa") {
    const index = Math.min(step, c.stages.length - 1);
    const item = c.stages[index];
    const reveal = !!revealed[index];
    return (
      <div className="reading-page" data-gallery="">
        <div className="row between"><Link to="/cases" className="small">← Cases & Q&A</Link><span className="chip accent">Q&A book · {c.stages.length} questions</span></div>
        <h1>{c.title}</h1>
        <div className="card reading-card">
          <div className="row between"><span className="eyebrow">Question {index + 1} of {c.stages.length}</span><strong>{item.title}</strong></div>
          <div className="progress" role="progressbar" aria-label="Reading progress" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={c.stages.length}><div style={{ width: `${(index + 1) / c.stages.length * 100}%` }} /></div>
          <div className="reading-question"><Rich text={item.question ?? ""} bookId={c.bookId} /><MediaList media={item.media} bookId={c.bookId} /></div>
          {!!item.media.length && <button type="button" onClick={() => void openFigures(item.media)}>Review question images ({item.media.length})</button>}
          {!reveal ? <button className="primary" onClick={() => setRevealed((v) => ({ ...v, [index]: true }))}>Reveal answer</button> : (
            <section className="reading-answer case-face-scroll" aria-label="Answer"><span className="eyebrow">Book answer</span><Rich text={item.answer ?? ""} bookId={c.bookId} />{!!item.answerMedia?.length && <button type="button" onClick={() => void openFigures(item.answerMedia!)}>Review answer images ({item.answerMedia.length})</button>}<MediaList media={item.answerMedia ?? []} bookId={c.bookId} /></section>
          )}
        </div>
        <div className="row between reading-controls">
          <button disabled={index === 0} onClick={() => setStep(index - 1)}>← Previous</button>
          <label className="field">Jump to question<select aria-label="Jump to question" value={index} onChange={(e) => setStep(Number(e.target.value))}>{c.stages.map((s, i) => <option value={i} key={i}>{s.title}</option>)}</select></label>
          <button className="primary" disabled={index === c.stages.length - 1} onClick={() => setStep(index + 1)}>Next →</button>
        </div>
      </div>
    );
  }

  const visible = showAll ? c.stages.length : step;
  const finished = step === c.stages.length - 1 && !!revealed[step];

  return (
    <div data-gallery="">
      <div className="row between">
        <h1 style={{ margin: 0 }}>{c.title}</h1>
        <label className="check small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all stages</label>
      </div>
      <Annotations id={c.id} kind="case" extraTags={c.sourceTags} />

      <details className="card case-presentation" open={step === 0} key={`${c.id}-${step === 0}`}>
        <summary>Patient presentation</summary>
        <div className="case-face-scroll"><Rich text={c.presentation} bookId={c.bookId} /><MediaList media={c.presentationMedia} bookId={c.bookId} /></div>
      </details>

      {!showAll && <div className="row between case-stage-nav">
        <button disabled={step === 0} onClick={() => setStep((i) => i - 1)}>← Previous</button>
        <label className="field">Case step {Math.min(step + 1, c.stages.length)} of {c.stages.length}
          <select aria-label="Jump to case step" value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {c.stages.map((s, i) => <option key={i} value={i}>{i + 1}. {s.title}</option>)}
          </select>
        </label>
        <button className="primary" disabled={step >= c.stages.length - 1} onClick={() => setStep((i) => i + 1)}>Next →</button>
      </div>}

      {c.stages.map((s, i) => ({ s, i })).filter(({ i }) => showAll || i === step).map(({ s, i }) => {
        const flipped = !!revealed[i] || showAll;
        return (
          <div className="card case-study-card" key={i} data-gallery="">
            <div className="row between"><span className="eyebrow">Step {i + 1} of {c.stages.length}</span><strong>{s.title}</strong></div>
            <div className="progress" role="progressbar" aria-label="Case progress" aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={c.stages.length}><div style={{ width: `${(i + 1) / c.stages.length * 100}%` }} /></div>
            <div className="case-face-scroll">
              {s.content && <Rich text={s.content} bookId={c.bookId} />}
              {s.question && <Rich text={s.question} bookId={c.bookId} />}
              <MediaList media={s.media} bookId={c.bookId} />
              {!!s.media.length && <button type="button" onClick={() => void openFigures(s.media)}>Review question images ({s.media.length})</button>}
              {!flipped && s.question && <textarea aria-label="Your answer" placeholder="Your answer (optional)" value={mine[i] ?? ""} onChange={(e) => setMine({ ...mine, [i]: e.target.value })} />}
              {flipped && <div className="reading-answer" aria-label="Case answer">
                {mine[i] && <p className="small muted"><strong>You wrote:</strong> {mine[i]}</p>}
                <Rich text={s.answer ?? ""} bookId={c.bookId} />
                {!!s.answerMedia?.length && <button type="button" onClick={() => void openFigures(s.answerMedia!)}>Review answer images ({s.answerMedia.length})</button>}
                <MediaList media={s.answerMedia ?? []} bookId={c.bookId} />
              </div>}
            </div>
            {!showAll && <div className="row case-flip-controls">
              <button className="primary" onClick={() => setRevealed((prev) => ({ ...prev, [i]: !prev[i] }))}>{flipped ? "Flip to question" : "Flip to answer"}</button>
              {flipped && i < c.stages.length - 1 && <button onClick={() => setStep(i + 1)}>Next step →</button>}
            </div>}
          </div>
        );
      })}

      {(finished || showAll) && c.discussion && (
        <div className="card explanation">
          <h2 className="card-title" style={{ marginTop: 0 }}>Discussion</h2>
          <Rich text={c.discussion} bookId={c.bookId} />
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>Case discussion with AI examiner</h2>
        <AiChat
          context={`Clinical case (the resident has seen up to stage ${visible} of ${c.stages.length}; do not reveal later stages unless asked):\n${caseText(c)}\n\nResident's written answers so far: ${JSON.stringify(mine)}`}
          starters={["Examine me on this case, oral-board style", "Critique my answers so far", "What are the key teaching points?", "What would change if the patient were elderly/anticoagulated?"]}
          placeholder="Answer the examiner or ask a question…"
        />
      </div>
    </div>
  );
}
