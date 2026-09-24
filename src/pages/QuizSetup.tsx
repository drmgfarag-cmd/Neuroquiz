import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../lib/db";
import { buildPool, createSession, emptyFilter, type PoolFilter, type QuestionStatus } from "../lib/quiz";
import type { Difficulty, QuizMode } from "../lib/types";

const MODES: { id: QuizMode; label: string; desc: string }[] = [
  { id: "tutor", label: "Tutor", desc: "Answer shown immediately after each question, with explanation." },
  { id: "timed", label: "Timed exam", desc: "Countdown timer, results and explanations only at the end." },
  { id: "exam", label: "Untimed exam", desc: "No feedback until you finish – simulate test conditions without a clock." },
  { id: "review", label: "Read / review", desc: "Browse questions with answers and explanations visible. Doesn't affect stats." }
];

const STATUSES: { id: QuestionStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unused", label: "Unused" },
  { id: "incorrect", label: "Incorrect" },
  { id: "correct", label: "Correct" },
  { id: "flagged", label: "Flagged" },
  { id: "due", label: "Due for revision" }
];

export default function QuizSetup() {
  const nav = useNavigate();
  const loc = useLocation();
  const preset = (loc.state ?? {}) as Partial<PoolFilter> & { title?: string };

  const [mode, setMode] = useState<QuizMode>("tutor");
  const [filter, setFilter] = useState<PoolFilter>({ ...emptyFilter(), ...preset });
  const [count, setCount] = useState(40);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(false);
  const [secPerQ, setSecPerQ] = useState(90);
  const [available, setAvailable] = useState<number | null>(null);

  const lib = useLiveQuery(async () => {
    const [books, chapters, anns, qs] = await Promise.all([
      db.books.orderBy("title").toArray(),
      db.chapters.orderBy("order").toArray(),
      db.annotations.where("kind").equals("question").toArray(),
      db.questions.toArray()
    ]);
    const perChapter = new Map<string, number>();
    qs.forEach((q) => perChapter.set(q.chapterId, (perChapter.get(q.chapterId) ?? 0) + 1));
    const topics = new Map<string, Map<string, number>>();
    for (const a of anns) {
      if (!topics.has(a.topic)) topics.set(a.topic, new Map());
      const m = topics.get(a.topic)!;
      m.set(a.subtopic || "(general)", (m.get(a.subtopic || "(general)") ?? 0) + 1);
    }
    return { books, chapters, perChapter, topics };
  });

  useEffect(() => {
    let live = true;
    buildPool(filter).then((p) => live && setAvailable(p.length));
    return () => {
      live = false;
    };
  }, [filter]);

  const topicList = useMemo(() => (lib ? Array.from(lib.topics.entries()).sort((a, b) => a[0].localeCompare(b[0])) : []), [lib]);

  if (!lib) return null;

  const toggle = <K extends keyof PoolFilter>(key: K, value: string) => {
    const arr = filter[key] as string[];
    setFilter({ ...filter, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] });
  };

  const start = async () => {
    const pool = await buildPool(filter);
    if (!pool.length) return alert("No questions match these filters.");
    const s = await createSession(pool, {
      mode,
      title: preset.title ?? `${MODES.find((m) => m.id === mode)!.label} – ${new Date().toLocaleDateString()}`,
      count: mode === "review" ? 0 : count,
      shuffleQuestions: mode === "review" ? false : shuffleQ,
      shuffleOptions: shuffleO,
      secondsPerQuestion: secPerQ
    });
    nav(`/quiz/${s.id}`);
  };

  return (
    <div>
      <h1>Create a test</h1>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mode</h3>
        <div className="grid">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? "active" : ""} style={{ flexDirection: "column", alignItems: "flex-start", textAlign: "left" }} onClick={() => setMode(m.id)}>
              <strong>{m.label}</strong>
              <span className="small muted">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {filter.ids?.length ? (
        <div className="card row between">
          <span>
            Using <strong>{filter.ids.length}</strong> questions from your search.
          </span>
          <button className="small" onClick={() => setFilter({ ...filter, ids: undefined })}>
            Use whole bank instead
          </button>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Books & chapters</h3>
          <div className="tree">
            {lib.books.map((b) => {
              const chs = lib.chapters.filter((c) => c.bookId === b.id);
              return (
                <details key={b.id}>
                  <summary>
                    <label className="check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={filter.bookIds.includes(b.id)}
                        onChange={() => {
                          const on = !filter.bookIds.includes(b.id);
                          setFilter({
                            ...filter,
                            bookIds: on ? [...filter.bookIds, b.id] : filter.bookIds.filter((x) => x !== b.id),
                            chapterIds: filter.chapterIds.filter((id) => !chs.some((c) => c.id === id))
                          });
                        }}
                      />
                      {b.title} <span className="muted small">({b.questionCount})</span>
                    </label>
                  </summary>
                  <div className="children">
                    {chs.map((c) => (
                      <div key={c.id}>
                        <label className="check small">
                          <input
                            type="checkbox"
                            checked={filter.chapterIds.includes(c.id)}
                            onChange={() => {
                              toggle("chapterIds", c.id);
                            }}
                          />
                          {c.title} <span className="muted">({lib.perChapter.get(c.id) ?? 0})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          <p className="small muted">Nothing ticked = all books. Ticking chapters narrows to those chapters.</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Topics</h3>
        {topicList.length === 0 && <p className="muted small">Run tagging to filter by topic.</p>}
        <div className="tree">
          {topicList.map(([topic, subs]) => (
            <details key={topic}>
              <summary>
                <label className="check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={filter.topics.includes(topic)} onChange={() => toggle("topics", topic)} />
                  {topic} <span className="muted small">({Array.from(subs.values()).reduce((a, b) => a + b, 0)})</span>
                </label>
              </summary>
              <div className="children">
                {Array.from(subs.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([sub, n]) => (
                    <div key={sub}>
                      <label className="check small">
                        <input type="checkbox" checked={filter.subtopics.includes(sub)} onChange={() => toggle("subtopics", sub)} />
                        {sub} <span className="muted">({n})</span>
                      </label>
                    </div>
                  ))}
              </div>
            </details>
          ))}
        </div>
        {filter.tags.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            Tags:{" "}
            {filter.tags.map((t) => (
              <button key={t} className="chip accent" onClick={() => toggle("tags", t)}>
                {t} ×
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Question status</h3>
        <div className="segmented">
          {STATUSES.map((s) => (
            <button key={s.id} className={filter.status === s.id ? "active" : ""} onClick={() => setFilter({ ...filter, status: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="row">
          <span className="small muted">Difficulty (AI-tagged):</span>
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <label className="check small" key={d}>
              <input type="checkbox" checked={filter.difficulties.includes(d)} onChange={() => toggle("difficulties", d)} /> {d}
            </label>
          ))}
          <label className="check small">
            <input type="checkbox" checked={filter.highYieldOnly} onChange={(e) => setFilter({ ...filter, highYieldOnly: e.target.checked })} /> High-yield only
          </label>
          <label className="check small">
            <input type="checkbox" checked={!!filter.withImagesOnly} onChange={(e) => setFilter({ ...filter, withImagesOnly: e.target.checked })} /> Only questions with images (radiology/figures)
          </label>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          {mode !== "review" && (
            <label className="field">
              Number of questions
              <input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} style={{ width: 110 }} />
            </label>
          )}
          {mode === "timed" && (
            <label className="field">
              Seconds per question
              <input type="number" min={10} max={600} value={secPerQ} onChange={(e) => setSecPerQ(Math.max(10, Number(e.target.value) || 90))} style={{ width: 110 }} />
            </label>
          )}
        </div>
        <div className="row">
          {mode !== "review" && (
            <label className="check">
              <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} /> Random order
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={shuffleO} onChange={(e) => setShuffleO(e.target.checked)} /> Shuffle answer options
          </label>
        </div>
      </div>

      <div className="sticky-actions row between">
        <span>
          <strong>{available ?? "…"}</strong> matching question(s)
          {mode !== "review" && available ? ` · test will use ${Math.min(count, available)}` : ""}
        </span>
        <button className="primary" disabled={!available} onClick={start}>
          Start
        </button>
      </div>
    </div>
  );
}
