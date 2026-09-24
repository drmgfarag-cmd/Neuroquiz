import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router-dom";
import { TOPICS, subtopicsOf } from "../ai/taxonomy";
import { topicHue } from "../lib/colors";
import { db } from "../lib/db";
import type { Annotation } from "../lib/types";

/** Shows topic/tags for an item and lets the user correct them. */
export function Annotations({ id, kind, extraTags = [] }: { id: string; kind: Annotation["kind"]; extraTags?: string[] }) {
  const a = useLiveQuery(() => db.annotations.get(id), [id]);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Annotation | null>(null);

  const startEdit = () => {
    setDraft(a ?? { id, kind, topic: "", subtopic: "", tags: [], keywords: [], source: "manual", updatedAt: Date.now() });
    setEdit(true);
  };

  if (edit && draft)
    return (
      <div className="card stack">
        <div className="row">
          <label className="field">
            Topic
            <select value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value, subtopic: "" })}>
              <option value="">–</option>
              {[...TOPICS, ...(draft.topic && !TOPICS.includes(draft.topic) ? [draft.topic] : [])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Subtopic
            <input type="text" list={`subs-${id}`} value={draft.subtopic} onChange={(e) => setDraft({ ...draft, subtopic: e.target.value })} />
            <datalist id={`subs-${id}`}>
              {subtopicsOf(draft.topic).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Difficulty
            <select value={draft.difficulty ?? ""} onChange={(e) => setDraft({ ...draft, difficulty: (e.target.value || undefined) as Annotation["difficulty"] })}>
              <option value="">–</option>
              <option>easy</option>
              <option>medium</option>
              <option>hard</option>
            </select>
          </label>
        </div>
        <label className="field">
          Tags (comma separated)
          <input type="text" value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
        </label>
        <label className="check small">
          <input type="checkbox" checked={!!draft.highYield} onChange={(e) => setDraft({ ...draft, highYield: e.target.checked })} /> High-yield
        </label>
        <div className="row">
          <button
            className="primary small"
            onClick={async () => {
              await db.annotations.put({ ...draft, source: "manual", updatedAt: Date.now() });
              setEdit(false);
            }}
          >
            Save
          </button>
          <button className="small" onClick={() => setEdit(false)}>
            Cancel
          </button>
        </div>
      </div>
    );

  const tags = Array.from(new Set([...(a?.tags ?? []), ...extraTags])).filter((t) => t !== a?.topic && t !== a?.subtopic);
  return (
    <div className="row small" style={{ marginTop: 8 }}>
      {a?.topic && (
        <Link className="chip topic" style={{ ["--h" as string]: topicHue(a.topic) }} to={`/search?topic=${encodeURIComponent(a.topic)}`}>
          {a.topic}
        </Link>
      )}
      {a?.subtopic && (
        <Link className="chip topic" style={{ ["--h" as string]: topicHue(a.topic) }} to={`/search?q=${encodeURIComponent(a.subtopic)}`}>
          {a.subtopic}
        </Link>
      )}
      {tags.map((t) => (
        <Link key={t} className="chip" to={`/search?q=${encodeURIComponent(t)}`}>
          {t}
        </Link>
      ))}
      {a?.difficulty && <span className="chip">{a.difficulty}</span>}
      {a?.highYield && <span className="chip warn">high-yield</span>}
      {a && <span className="muted">({a.source === "ai" ? "AI" : a.source === "local" ? "keyword" : "manual"})</span>}
      <button className="small ghost" onClick={startEdit}>
        ✎ Edit tags
      </button>
      {a?.summary && <div className="muted" style={{ width: "100%" }}><strong>Key point:</strong> {a.summary}</div>}
    </div>
  );
}
