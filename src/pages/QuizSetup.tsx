import { TreeNode } from "../components/Tree";
import { useLiveQuery } from "dexie-react-hooks";
import { notify } from "../components/Dialog";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db, questionChapterIndex } from "../lib/db";
import { buildPool, createSession, emptyFilter, type PoolFilter, type QuestionStatus } from "../lib/quiz";
import type { Difficulty, QuestionFormat, QuizMode } from "../lib/types";

const MODES: { id: QuizMode; label: string; desc: string }[] = [
  { id: "tutor", label: "Tutor", desc: "Answer shown immediately after each question, with explanation." },
  { id: "timed", label: "Timed exam", desc: "Countdown timer, results and explanations only at the end." },
  { id: "exam", label: "Untimed exam", desc: "No feedback until you finish – simulate test conditions without a clock." },
  { id: "review", label: "Read / review", desc: "Browse questions with answers and explanations visible. Doesn't affect stats." }
];

const FORMATS: [QuestionFormat, string][] = [
  ["single", "Single best answer"],
  ["multi", "Multiple answers"],
  ["truefalse", "True/False statements"],
  ["matching", "Extended matching (EMI)"],
  ["ordering", "Ordering / sequence"],
  ["text", "Typed answer / cloze"],
  ["hotspot", "Image hotspot"],
  ["sct", "Script concordance"]
];

const pref = (k: string) => {
  try {
    return localStorage.getItem(`neuroquiz.setup.${k}`) === "1";
  } catch {
    return false;
  }
};
const savePref = (k: string, v: boolean) => {
  try {
    localStorage.setItem(`neuroquiz.setup.${k}`, v ? "1" : "0");
  } catch {
    /* private mode */
  }
};

const STATUSES: { id: QuestionStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unused", label: "Unused" },
  { id: "incorrect", label: "Incorrect" },
  { id: "correct", label: "Correct" },
  { id: "flagged", label: "Flagged" },
  { id: "due", label: "Due for revision" },
  { id: "unsure", label: "Right but unsure" },
  { id: "reported", label: "Reported problems" }
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
  const [recall, setRecall] = useState(() => pref("recall"));
  const [askConf, setAskConf] = useState(() => pref("confidence"));
  const [secPerQ, setSecPerQ] = useState(90);
  const [available, setAvailable] = useState<number | null>(null);

  const lib = useLiveQuery(async () => {
    const [books, chapters, anns, qs] = await Promise.all([
      db.books.orderBy("title").toArray(),
      db.chapters.orderBy("order").toArray(),
      db.annotations.where("kind").equals("question").toArray(),
      questionChapterIndex()
    ]);
    const perChapter = new Map<string, number>();
    for (const chapterId of qs.values()) perChapter.set(chapterId, (perChapter.get(chapterId) ?? 0) + 1);
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
    if (!pool.length) return void notify("No questions match these filters.");
    const s = await createSession(pool, {
      mode,
      title: preset.title ?? `${MODES.find((m) => m.id === mode)!.label} – ${new Date().toLocaleDateString()}`,
      count: mode === "review" ? 0 : count,
      shuffleQuestions: mode === "review" ? false : shuffleQ,
      shuffleOptions: shuffleO,
      recall: mode !== "review" && recall,
      askConfidence: mode !== "review" && askConf,
      secondsPerQuestion: secPerQ
    });
    nav(`/quiz/${s.id}`);
  };

  return (
    <div>
      <h1>Create a test</h1>

      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>Mode</h2>
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
          <h2 className="card-title" style={{ marginTop: 0 }}>Books & chapters</h2>
          <div className="tree">
            {lib.books.map((b) => {
              const chs = lib.chapters.filter((c) => c.bookId === b.id);
              return (
                <TreeNode
                  key={b.id}
                  name={b.title}
                  label={
                    <label className="check">
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
                  }
                >
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
                </TreeNode>
              );
            })}
          </div>
          <p className="small muted">Nothing ticked = all books. Ticking chapters narrows to those chapters.</p>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>Topics</h2>
        {topicList.length === 0 && <p className="muted small">Run tagging to filter by topic.</p>}
        <div className="tree">
          {topicList.map(([topic, subs]) => (
            <TreeNode
              key={topic}
              name={topic}
              label={
                <label className="check">
                  <input type="checkbox" checked={filter.topics.includes(topic)} onChange={() => toggle("topics", topic)} />
                  {topic} <span className="muted small">({Array.from(subs.values()).reduce((a, b) => a + b, 0)})</span>
                </label>
              }
            >
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
            </TreeNode>
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
        <h2 className="card-title" style={{ margin: 0 }}>Question status</h2>
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
        <div className="row">
          <span className="small muted">Question types:</span>
          {FORMATS.map(([id, label]) => (
            <label className="check small" key={id}>
              <input
                type="checkbox"
                checked={!!filter.formats?.includes(id)}
                onChange={() => {
                  const cur = filter.formats ?? [];
                  setFilter({ ...filter, formats: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
                }}
              />{" "}
              {label}
            </label>
          ))}
          {!filter.formats?.length && <span className="small muted">(all)</span>}
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
        {mode !== "review" && (
          <div className="stack" style={{ gap: 4 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={recall}
                onChange={(e) => {
                  setRecall(e.target.checked);
                  savePref("recall", e.target.checked);
                }}
              />{" "}
              Recall mode – hide the options until I have an answer in mind
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={askConf}
                onChange={(e) => {
                  setAskConf(e.target.checked);
                  savePref("confidence", e.target.checked);
                }}
              />{" "}
              Rate my confidence (guess / unsure / sure) – lucky guesses come back sooner
            </label>
          </div>
        )}
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
