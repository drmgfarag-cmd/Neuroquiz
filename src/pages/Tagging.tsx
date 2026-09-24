import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { aiAvailable, describeAiError } from "../ai/claude";
import { runAiTagging, runLocalTagging, type AiTagProgress, type ItemKind, type TagScope } from "../ai/tagger";
import { TreeNode } from "../components/Tree";
import { db } from "../lib/db";
import { useOnline } from "../lib/platform";
import { useSettings } from "../lib/settings";

export default function Tagging() {
  const settings = useSettings();
  const nav = useNavigate();
  const [kinds, setKinds] = useState<ItemKind[]>(["question", "flashcard", "case"]);
  const [books, setBooks] = useState<string[]>([]);
  const [scope, setScope] = useState<TagScope>("local-only");
  const [progress, setProgress] = useState<AiTagProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const abort = useRef<AbortController | null>(null);
  const online = useOnline();

  const stats = useLiveQuery(async () => {
    const [anns, qCount, bookList] = await Promise.all([db.annotations.toArray(), db.questions.count(), db.books.orderBy("title").toArray()]);
    const bySource = { ai: 0, local: 0, manual: 0 };
    const topics = new Map<string, Map<string, number>>();
    anns.forEach((a) => {
      bySource[a.source]++;
      if (a.kind !== "question") return;
      if (!topics.has(a.topic)) topics.set(a.topic, new Map());
      const m = topics.get(a.topic)!;
      m.set(a.subtopic || "(general)", (m.get(a.subtopic || "(general)") ?? 0) + 1);
    });
    return { total: anns.length, qCount, bySource, topics, bookList };
  });

  const runAi = async () => {
    setRunning(true);
    setMsg("");
    abort.current = new AbortController();
    try {
      const p = await runAiTagging(kinds, books.length ? books : null, scope, setProgress, abort.current.signal);
      setMsg(p.failed ? `Finished with ${p.failed} item(s) not tagged. ${p.lastError ?? ""}` : `Tagged ${p.done} item(s).`);
    } catch (e) {
      setMsg(describeAiError(e));
    } finally {
      setRunning(false);
    }
  };

  if (!stats) return null;

  return (
    <div>
      <h1>AI tagging & categorisation</h1>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          Claude reads each question together with its answer and explanation, then assigns a topic and subtopic from a neurosurgery taxonomy, concept tags, search keywords/synonyms, difficulty,
          high-yield flag and a one-line teaching point. Tags power Search, topic filters in tests and statistics. The offline keyword tagger runs automatically on import as a rough first pass.
        </p>
        <div className="row small">
          <span className="chip accent">{stats.bySource.ai} AI</span>
          <span className="chip">{stats.bySource.local} keyword</span>
          <span className="chip">{stats.bySource.manual} manual</span>
          <span className="muted">of {stats.qCount} questions (+ cards/cases)</span>
        </div>
        <div className="row">
          <span className="small muted">Items:</span>
          {(["question", "flashcard", "case"] as ItemKind[]).map((k) => (
            <label className="check small" key={k}>
              <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} /> {k}s
            </label>
          ))}
        </div>
        <div className="row">
          <span className="small muted">Books:</span>
          {stats.bookList.map((b) => (
            <label className="check small" key={b.id}>
              <input type="checkbox" checked={books.includes(b.id)} onChange={() => setBooks(books.includes(b.id) ? books.filter((x) => x !== b.id) : [...books, b.id])} /> {b.title}
            </label>
          ))}
          {!books.length && <span className="small muted">(all)</span>}
        </div>
        <label className="field">
          Which items
          <select value={scope} onChange={(e) => setScope(e.target.value as TagScope)}>
            <option value="local-only">Untagged + keyword-tagged only (recommended)</option>
            <option value="untagged">Untagged only</option>
            <option value="all">Everything (re-tag, overwrites manual edits)</option>
          </select>
        </label>
        <div className="row">
          <button className="primary" disabled={running || !aiAvailable() || !kinds.length || !online} onClick={runAi} title={online ? "" : "Offline – run it later; the offline keyword tagger works now"}>
            ✦ Run AI tagging
          </button>
          {running && <button onClick={() => abort.current?.abort()}>Stop</button>}
          <button
            disabled={running}
            onClick={async () => {
              const n = await runLocalTagging(kinds, books.length ? books : null, scope === "all" ? "all" : "untagged");
              setMsg(`Keyword-tagged ${n} item(s).`);
            }}
          >
            Run offline keyword tagger
          </button>
        </div>
        {!aiAvailable() && (
          <p className="small muted" style={{ margin: 0 }}>
            Add your Anthropic API key in <Link to="/settings">Settings</Link> to enable AI tagging. Model: <code>{settings.model}</code>.
          </p>
        )}
        {progress && (
          <div>
            <div className="progress">
              <div style={{ width: `${progress.total ? (100 * (progress.done + progress.failed)) / progress.total : 100}%` }} />
            </div>
            <div className="small muted">
              {progress.done} / {progress.total} tagged{progress.failed ? `, ${progress.failed} failed` : ""}
              {progress.lastError ? ` – ${progress.lastError}` : ""}
            </div>
          </div>
        )}
        {msg && <div className="small">{msg}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          Runs in batches of 12 with the taxonomy prompt cached. You can stop and resume at any time – finished items are saved immediately, and tags sync to your other devices.
        </p>
      </div>

      <h2>Topic map</h2>
      <div className="card tree">
        {Array.from(stats.topics.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([topic, subs]) => (
            <TreeNode
              key={topic}
              name={topic}
              label={
                <>
                <strong>{topic}</strong> <span className="muted small">({Array.from(subs.values()).reduce((a, b) => a + b, 0)})</span>{" "}
                <button className="small ghost" onClick={() => nav("/quiz", { state: { topics: [topic], title: topic } })}>
                  Test →
                </button>
                </>
              }
            >
                {Array.from(subs.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => (
                    <div key={s} className="row small">
                      <Link to={`/search?q=${encodeURIComponent(s)}`}>{s}</Link> <span className="muted">({n})</span>
                      <button className="small ghost" onClick={() => nav("/quiz", { state: { subtopics: [s], title: s } })}>
                        Test →
                      </button>
                    </div>
                  ))}
            </TreeNode>
          ))}
        {!stats.topics.size && <span className="muted">No tags yet.</span>}
      </div>
    </div>
  );
}
