import { useLiveQuery } from "dexie-react-hooks";
import { ask } from "../components/Dialog";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { aiAvailable, aiGenerateCase, describeAiError } from "../ai/claude";
import { questionText } from "../ai/tagger";
import { TOPICS } from "../ai/taxonomy";
import { allCases, db, deleteSynced } from "../lib/db";
import { plain } from "../lib/markdown";
import { useOnline } from "../lib/platform";
import { shuffle, uid } from "../lib/util";

export default function Cases() {
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const [cases, books, anns] = await Promise.all([allCases(), db.books.toArray(), db.annotations.where("kind").equals("case").toArray()]);
    return { cases, books: new Map(books.map((b) => [b.id, b.title])), anns: new Map(anns.map((a) => [a.id, a])) };
  });
  const [topic, setTopic] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const online = useOnline();

  const generate = async () => {
    const subject = custom.trim() || topic;
    if (!subject) return;
    setBusy(true);
    setError("");
    try {
      // ground the case in the user's own bank where possible
      const anns = topic ? await db.annotations.where("topic").equals(topic).and((a) => a.kind === "question").toArray() : [];
      const qs = (await db.questions.bulkGet(shuffle(anns).slice(0, 6).map((a) => a.id))).filter((q) => !!q);
      const c = await aiGenerateCase(subject, qs.map((q) => questionText(q!)).join("\n\n---\n\n"));
      const now = Date.now();
      const id = uid("case_");
      await db.userCases.put({
        id,
        title: c.title,
        presentation: c.presentation,
        presentationMedia: [],
        stages: c.stages.map((s) => ({ ...s, media: [] })),
        discussion: c.discussion,
        sourceTags: c.tags,
        origin: "generated",
        createdAt: now,
        updatedAt: now
      });
      await db.annotations.put({ id, kind: "case", topic: topic || "", subtopic: "", tags: c.tags, keywords: [], source: "ai", updatedAt: now });
      nav(`/cases/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(describeAiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const f = filter.toLowerCase();
  const list = data.cases.filter((c) => !f || c.title.toLowerCase().includes(f) || c.presentation.toLowerCase().includes(f) || data.anns.get(c.id)?.topic.toLowerCase().includes(f));

  return (
    <div>
      <h1>Case scenarios</h1>
      <div className="card stack">
        <h2 className="card-title" style={{ margin: 0 }}>Generate a case with AI</h2>
        <div className="row">
          <select aria-label="Case topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Topic…</option>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input type="text" placeholder="or specific subject, e.g. “ruptured PComm aneurysm with third nerve palsy”" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="primary" disabled={busy || !aiAvailable() || !online || (!topic && !custom.trim())} onClick={generate}>
            {busy ? "Writing case…" : "Generate"}
          </button>
        </div>
        {!aiAvailable() && (
          <p className="small muted" style={{ margin: 0 }}>
            Requires an API key (<Link to="/settings">Settings</Link>).
          </p>
        )}
        {error && <div className="error small">{error}</div>}
      </div>

      <div className="card">
        <input type="search" placeholder="Filter cases…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%" }} />
        {!list.length && <p className="muted">No cases yet. Import books containing cases or generate one.</p>}
        {list.map((c) => (
          <div className="list-item" key={c.id}>
            <Link to={`/cases/${encodeURIComponent(c.id)}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
              <strong>{c.title}</strong>
              <div className="small muted">
                {c.bookId ? data.books.get(c.bookId) : c.origin === "generated" ? "AI-generated" : "Custom"} · {data.anns.get(c.id)?.topic ?? ""} · {c.stages.length} stages
              </div>
              <div className="small">{plain(c.presentation, 160)}</div>
            </Link>
            {c.origin !== "imported" && (
              <button className="small ghost" onClick={async () => (await ask("Delete this case?", { confirmLabel: "Delete", danger: true })) && deleteSynced("userCases", c.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
