import { useLiveQuery } from "dexie-react-hooks";
import { ask } from "../components/Dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { describeAiError } from "../ai/claude";
import { questionText } from "../ai/tagger";
import { AiChat } from "../components/AiChat";
import { Annotations } from "../components/Annotations";
import { Icon } from "../components/Icons";
import { useViewer } from "../components/ImageViewer";
import { Explanation, QuestionView } from "../components/QuestionView";
import { addAiCards, addQuestionCard } from "../lib/cards";
import { db } from "../lib/db";
import { applyChoice, correctSelection, isComplete, isItemised, selectionSummary } from "../lib/grading";
import { useOnline } from "../lib/platform";
import { finishSession, isCorrect, recordResult, saveSession, setFlag, setNote } from "../lib/quiz";
import type { Question, QuizSession, SessionAnswer } from "../lib/types";
import { formatDuration } from "../lib/util";

export default function QuizRunner() {
  const { id } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());
  const [paused, setPaused] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [msg, setMsg] = useState("");
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
    await recordResult(current, correct);
  };

  const go = (i: number) => {
    if (i < 0 || i >= total) return;
    update({ ...ans, timeMs: ans.timeMs + spent() }, { current: i });
    setShowAi(false);
    setMsg("");
    window.scrollTo({ top: 0 });
  };

  const strike = (key: string) => {
    const struck = ans.struck ?? [];
    update({ ...ans, struck: struck.includes(key) ? struck.filter((k) => k !== key) : [...struck, key] });
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
        const n = /^[1-8]$/.test(k) ? Number(k) - 1 : /^[a-h]$/i.test(k) ? k.toUpperCase().charCodeAt(0) - 65 : -1;
        if (!itemised && n >= 0 && n < order.length) select(order[n]);
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
              </span>
              <button className={`small ${state?.flagged ? "active" : ""}`} onClick={toggleFlag} title="Flag (F)">
                <Icon.flag size={14} /> {state?.flagged ? "Flagged" : "Flag"}
              </button>
            </div>
            <QuestionView
              q={current}
              selected={review ? correctSelection(current) : ans.selected}
              revealed={revealed}
              onSelect={select}
              struck={ans.struck}
              onStrike={review || itemised ? undefined : strike}
              order={session.optionOrder?.[current.id]}
            />
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
                <div className="row">
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
