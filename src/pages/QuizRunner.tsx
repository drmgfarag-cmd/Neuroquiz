import { useLiveQuery } from "dexie-react-hooks";
import { ask } from "../components/Dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { aiChat, describeAiError } from "../ai/claude";
import { questionText } from "../ai/tagger";
import { AiChat } from "../components/AiChat";
import { Annotations } from "../components/Annotations";
import { QuestionEditor } from "../components/QuestionEditor";
import { ReportIssue } from "../components/ReportIssue";
import { Icon } from "../components/Icons";
import { ReferenceDrawer } from "../components/Reference";
import { useViewer } from "../components/ImageViewer";
import { Explanation, QuestionView } from "../components/QuestionView";
import { MediaList, Rich } from "../components/Rich";
import { addAiCards, addQuestionCard } from "../lib/cards";
import { db } from "../lib/db";
import { applyChoice, canShuffle, correctSelection, formatOf, isComplete, isItemised, pickable, selectionSummary } from "../lib/grading";
import { useOnline } from "../lib/platform";
import { finishSession, isCorrect, recordResult, saveSession, setFlag, setNote } from "../lib/quiz";
import type { Confidence, Question, QuizSession, SessionAnswer } from "../lib/types";
import { formatDuration } from "../lib/util";

export default function QuizRunner() {
  const { id } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());
  const [paused, setPaused] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const [showRef, setShowRef] = useState(false);
  const [hint, setHint] = useState("");
  const [, setTick] = useState(0);
  const qStart = useRef(Date.now());
  const finishing = useRef(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const viewer = useViewer();
  const online = useOnline();
  const lastTick = useRef(Date.now());

  useEffect(() => {
    (async () => {
      const s = await db.sessions.get(id!);
      if (!s) return;
      if (s.finishedAt && s.mode !== "review") {
        nav(`/results/${s.id}`, { replace: true });
        return;
      }
      const qs = await db.questions.bulkGet(s.questionIds);
      setQuestions(new Map(qs.filter((q): q is Question => !!q).map((q) => [q.id, q])));
      setSession(s);
    })();
  }, [id, nav]);

  const current = session ? questions.get(session.questionIds[session.current]) : undefined;
  const state = useLiveQuery(() => (current ? db.questionStates.get(current.id) : undefined), [current?.id]);

  // Active-time clock (also drives the countdown in timed mode).
  useEffect(() => {
    if (!session || paused) return;
    lastTick.current = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      setSession((s) => (s ? { ...s, elapsedMs: (s.elapsedMs ?? 0) + delta } : s));
      setTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [session?.id, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist: immediately when answers/position change, and every 5 s for
  // the clock. (A debounce on `session` never fired because the clock
  // updates it every second.)
  const sessionRef = useRef<QuizSession | null>(null);
  sessionRef.current = session;
  const answersKey = session ? JSON.stringify([session.current, session.answers]) : "";
  useEffect(() => {
    if (sessionRef.current) saveSession(sessionRef.current);
  }, [answersKey]);
  useEffect(() => {
    if (!session?.id) return;
    const t = setInterval(() => sessionRef.current && !finishing.current && saveSession(sessionRef.current), 5000);
    const flush = () => sessionRef.current && !finishing.current && saveSession(sessionRef.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [session?.id]);

  const finish = useCallback(
    async (force = false) => {
      if (!session || finishing.current) return;
      if (session.mode === "review") {
        finishing.current = true;
        viewer.close();
        await saveSession({ ...session, finishedAt: Date.now() });
        nav("/history");
        return;
      }
      const unanswered = session.questionIds.filter((qid) => !session.answers[qid]?.selected.length).length;
      if (!force && unanswered && !(await ask(`${unanswered} question(s) unanswered. Finish anyway?`, { confirmLabel: "Finish test" }))) return;
      finishing.current = true;
      viewer.close();
      const done = await finishSession(session);
      nav(`/results/${done.id}`, { replace: true });
    },
    [session, nav]
  );

  const remainingMs = session?.timeLimitSec ? session.timeLimitSec * 1000 - (session.elapsedMs ?? 0) : null;
  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && session && !session.finishedAt) finish(true);
  }, [remainingMs, session, finish]);

  // keep a docked viewer in step with the question on screen
  const revealKey = current ? `${current.id}|${session?.answers[current.id]?.correct}` : "";
  useEffect(() => {
    const t = setTimeout(() => viewer.refreshDocked(galleryRef.current), 300);
    return () => clearTimeout(t);
  }, [revealKey, viewer.docked]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeViewer = useRef(viewer.close);
  useEffect(() => () => closeViewer.current(), []);

  if (!session) return <div className="muted">Loading…</div>;
  if (!current) return <div className="card">This test's questions are no longer in the library.</div>;

  const idx = session.current;
  const total = session.questionIds.length;
  const ans: SessionAnswer = session.answers[current.id] ?? { questionId: current.id, selected: [], timeMs: 0 };
  const tutor = session.mode === "tutor";
  const review = session.mode === "review";
  const revealed = review || (tutor && ans.correct !== undefined);
  const itemised = isItemised(current);
  const fmt = formatOf(current);
  // recall mode: answer in your head first (only for questions with a list of options)
  const hideOptions = !!session.recall && !revealed && !ans.optionsShown && (fmt === "single" || fmt === "multi");

  const update = (a: SessionAnswer, patch: Partial<QuizSession> = {}) =>
    setSession((s) => (s ? { ...s, ...patch, answers: { ...s.answers, [a.questionId]: a } } : s));

  const spent = () => {
    const d = Date.now() - qStart.current;
    qStart.current = Date.now();
    return d;
  };

  const select = (key: string, value?: string) => {
    if (revealed) return;
    update({ ...ans, selected: applyChoice(current, ans.selected, key, value) });
  };
  const complete = isComplete(current, ans.selected);

  const submit = async () => {
    if (!complete) return;
    const correct = isCorrect(current, ans.selected);
    update({ ...ans, correct, timeMs: ans.timeMs + spent() });
    await recordResult(current, correct, ans.confidence);
  };

  const go = (i: number) => {
    if (i < 0 || i >= total) return;
    update({ ...ans, timeMs: ans.timeMs + spent() }, { current: i });
    setShowAi(false);
    setEditing(false);
    setMsg("");
    setHint("");
    window.scrollTo({ top: 0 });
  };

  const strike = (key: string) => {
    const struck = ans.struck ?? [];
    update({ ...ans, struck: struck.includes(key) ? struck.filter((k) => k !== key) : [...struck, key] });
  };

  const setConfidence = (c: Confidence) => update({ ...ans, confidence: ans.confidence === c ? undefined : c });

  /** Adds the text selected inside the stem as a highlight. */
  const highlight = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    const stem = galleryRef.current?.querySelector(".rich.stem");
    if (!text || text.length < 2 || !stem || !sel?.anchorNode || !stem.contains(sel.anchorNode)) {
      setMsg("Select some words in the question first, then press Highlight (H).");
      return;
    }
    // one text node per highlight: long selections across formatting are split by line
    const parts = text.split(/\n+/).filter((t) => t.length > 1);
    update({ ...ans, highlights: Array.from(new Set([...(ans.highlights ?? []), ...parts])) });
    sel.removeAllRanges();
    setMsg("");
  };
  const unhighlight = (t: string) => update({ ...ans, highlights: (ans.highlights ?? []).filter((h) => h !== t) });

  const askHint = async () => {
    setHint("…");
    const ctx = `Question (the resident has NOT answered yet):\n${current.stem}\n${current.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`;
    try {
      let out = "";
      await aiChat(ctx, [{ role: "user", content: "Give me one short hint (2 sentences at most) that points me to the key concept or the clue in the stem. Do NOT reveal or eliminate any option and do not name the answer." }], (d) => {
        out += d;
        setHint(out);
      });
    } catch (e) {
      setHint(describeAiError(e));
    }
  };

  const toggleFlag = async () => {
    const f = !(state?.flagged ?? false);
    await setFlag(current.id, f);
    update({ ...ans, flagged: f });
  };

  return (
    <KeyHandler
      onKey={(k) => {
        if (paused) return;
        const order = session.optionOrder?.[current.id] ?? current.options.map((o) => o.key);
        const n = /^[1-8]$/.test(k) ? Number(k) - 1 : /^[a-h]$/i.test(k) && k.toLowerCase() !== "f" && k.toLowerCase() !== "h" ? k.toUpperCase().charCodeAt(0) - 65 : -1;
        if (hideOptions && (k === " " || k === "Enter")) update({ ...ans, optionsShown: true });
        else if (pickable(current) && !hideOptions && n >= 0 && n < order.length) select(order[n]);
        else if (k.toLowerCase() === "h") highlight();
        else if (k === "Enter") {
          if (tutor && !revealed && complete) submit();
          else go(idx + 1);
        } else if (k === "ArrowRight") go(idx + 1);
        else if (k === "ArrowLeft") go(idx - 1);
        else if (k.toLowerCase() === "f") toggleFlag();
      }}
    >
      <div className="quiz-top">
        <strong className="quiz-title">{session.title}</strong>
        <span className="chip">{session.mode === "timed" ? "Timed" : session.mode === "exam" ? "Exam" : review ? "Review" : "Tutor"}</span>
        <span className="muted small">
          {idx + 1} / {total}
        </span>
        {remainingMs !== null ? (
          <span className={`timer ${remainingMs < 60_000 ? "low" : ""}`}>⏱ {formatDuration(remainingMs)}</span>
        ) : (
          !review && <span className="timer muted">{formatDuration(session.elapsedMs ?? 0)}</span>
        )}
        {!review && (
          <button className="small" onClick={() => setPaused(!paused)}>
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button className="small" onClick={() => setShowGrid(!showGrid)}>
          Navigator
        </button>
        <button className="small" onClick={() => setShowRef(!showRef)} title="Lab values & grading scales">
          <Icon.lab size={14} /> Lab values
        </button>
        <button className="small primary" onClick={() => finish()}>
          {review ? "Close" : "Finish"}
        </button>
      </div>
      <div className="progress" style={{ marginBottom: 12 }}>
        <div style={{ width: `${(100 * Object.values(session.answers).filter((a) => a.selected.length || review).length) / total}%` }} />
      </div>

      {showGrid && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="qgrid">
            {session.questionIds.map((qid, i) => {
              const a = session.answers[qid];
              let cls = "";
              if (a?.correct === true && (tutor || review)) cls = "ok";
              else if (a?.correct === false && (tutor || review)) cls = "no";
              else if (a?.selected.length) cls = "ans";
              if (i === idx) cls += " cur";
              if (a?.flagged) cls += " flag";
              return (
                <button key={qid} className={cls} onClick={() => go(i)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showRef && <ReferenceDrawer onClose={() => setShowRef(false)} />}
      {paused ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h2>Paused</h2>
          <button className="primary" onClick={() => setPaused(false)}>
            Resume
          </button>
        </div>
      ) : (
        <>
          <div data-gallery="" ref={galleryRef}>
          <div className="card">
            <div className="row between small muted" style={{ marginBottom: 6 }}>
              <span>
                Q{current.number} · <BookChapter q={current} />
                {current.edited && <span className="chip accent" style={{ marginLeft: 6 }}>edited</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <button className="small" onMouseDown={(e) => e.preventDefault()} onClick={highlight} title="Highlight the selected words in the question (H)">
                  🖍 Highlight
                </button>
                <button className={`small ${state?.flagged ? "active" : ""}`} onClick={toggleFlag} title="Flag (F)">
                  <Icon.flag size={14} /> {state?.flagged ? "Flagged" : "Flag"}
                </button>
              </span>
            </div>
            {hideOptions ? (
              <>
                <Rich text={current.stem} bookId={current.bookId} highlights={ans.highlights} onUnhighlight={unhighlight} className="stem" />
                <MediaList media={current.stemMedia} bookId={current.bookId} />
                <div className="card recall" style={{ textAlign: "center" }}>
                  <p className="muted" style={{ marginTop: 0 }}>Recall mode: decide on your answer before you see the options.</p>
                  <button className="primary" onClick={() => update({ ...ans, optionsShown: true })}>
                    Show options (Space)
                  </button>
                </div>
              </>
            ) : (
              <QuestionView
                q={current}
                selected={review ? correctSelection(current) : ans.selected}
                revealed={revealed}
                onSelect={select}
                struck={ans.struck}
                onStrike={review || !canShuffle(current) ? undefined : strike}
                order={session.optionOrder?.[current.id]}
                highlights={ans.highlights}
                onUnhighlight={unhighlight}
              />
            )}
            {!review && !revealed && !hideOptions && (
              <div className="confidence" role="group" aria-label="How sure are you?">
                {session.askConfidence && (
                  <>
                    <span className="small muted">How sure are you?</span>
                    {([[1, "Guess"], [2, "Unsure"], [3, "Sure"]] as const).map(([c, label]) => (
                      <button key={c} className={`small ${ans.confidence === c ? "active" : ""}`} aria-pressed={ans.confidence === c} onClick={() => setConfidence(c)}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
                {tutor && (
                  <button className="small" disabled={!online || !!hint} title={online ? "An AI nudge that doesn't give the answer away" : "Needs an internet connection"} onClick={askHint}>
                    <Icon.sparkle size={14} /> Hint
                  </button>
                )}
              </div>
            )}
            {hint && !revealed && <div className="banner small hint">💡 {hint}</div>}
          </div>

          {revealed && (
            <>
              <Explanation q={current} selected={review ? correctSelection(current) : ans.selected} />
              <Annotations id={current.id} kind="question" extraTags={current.sourceTags} />
              <div className="card stack">
                <label className="field">
                  My notes
                  <NoteBox key={current.id} initial={state?.note ?? ""} onSave={(n) => setNote(current.id, n)} />
                </label>
                {editing && (
                  <QuestionEditor
                    q={current}
                    issue={state?.issue}
                    onDone={(q) => {
                      setQuestions((m) => new Map(m).set(q.id, q));
                      setEditing(false);
                    }}
                  />
                )}
                <div className="row">
                  <button className="small" onClick={() => setEditing(!editing)}>
                    ✎ Edit question
                  </button>
                  <ReportIssue questionId={current.id} issue={state?.issue} />
                  <button className="small" onClick={() => setShowAi(!showAi)}>
                    <Icon.sparkle size={14} /> {showAi ? "Hide AI tutor" : "Ask AI tutor"}
                  </button>
                  <button
                    className="small"
                    onClick={async () => {
                      await addQuestionCard(current);
                      setMsg("Added to flashcards.");
                    }}
                  >
                    + Flashcard
                  </button>
                  <button
                    className="small"
                    disabled={!online}
                    title={online ? "" : "Needs an internet connection"}
                    onClick={async () => {
                      setMsg("Generating flashcards…");
                      try {
                        const n = await addAiCards(current);
                        setMsg(`Added ${n} AI flashcards.`);
                      } catch (e) {
                        setMsg(describeAiError(e));
                      }
                    }}
                  >
                    + AI flashcards
                  </button>
                  {msg && <span className="small muted">{msg}</span>}
                </div>
                {showAi && (
                  <AiChat
                    context={`Question the resident just answered:\n${questionText(current)}\nResident's answer: ${selectionSummary(current, ans.selected)}`}
                    starters={["Explain why each option is right or wrong", "What is the key concept and how is it examined?", "Give me a mnemonic", "Quiz me with a related question"]}
                  />
                )}
              </div>
            </>
          )}
          </div>

          <div className="sticky-actions row between">
            <button onClick={() => go(idx - 1)} disabled={idx === 0}>
              ← Prev
            </button>
            {tutor && !revealed ? (
              <button className="primary" disabled={!complete} onClick={submit} title={complete ? "" : itemised ? "Answer every item first" : ""}>
                Submit answer
              </button>
            ) : idx === total - 1 ? (
              <button className="primary" onClick={() => finish()}>
                {review ? "Close" : "Finish test"}
              </button>
            ) : (
              <button className="primary" onClick={() => go(idx + 1)}>
                Next →
              </button>
            )}
          </div>
        </>
      )}
    </KeyHandler>
  );
}

function BookChapter({ q }: { q: Question }) {
  const info = useLiveQuery(async () => {
    const [b, c] = await Promise.all([db.books.get(q.bookId), db.chapters.get(q.chapterId)]);
    return `${b?.title ?? ""} – ${c?.title ?? ""}`;
  }, [q.id]);
  return <>{info}</>;
}

function NoteBox({ initial, onSave }: { initial: string; onSave: (n: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && onSave(v)} placeholder="Personal notes for this question (synced)" />;
}

function KeyHandler({ onKey, children }: { onKey: (k: string) => void; children: React.ReactNode }) {
  const ref = useRef(onKey);
  ref.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      ref.current(e.key);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return <div>{children}</div>;
}
