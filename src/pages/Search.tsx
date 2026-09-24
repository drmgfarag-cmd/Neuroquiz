import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { aiAvailable, aiSearchPlan, describeAiError, type AiSearchPlan } from "../ai/claude";
import { allCases, allFlashcards, db } from "../lib/db";
import { plain } from "../lib/markdown";
import { useOnline } from "../lib/platform";
import { search, type SearchHit } from "../lib/search";
import type { Annotation } from "../lib/types";

interface Row {
  id: string;
  kind: Annotation["kind"];
  text: string;
  topic: string;
  subtopic: string;
  score: number;
}

const KINDS: Annotation["kind"][] = ["question", "flashcard", "case"];

async function hydrate(hits: { id: string; kind: Annotation["kind"]; score: number }[]): Promise<Row[]> {
  const ids = hits.map((h) => h.id);
  const [qs, fcs, cs, anns] = await Promise.all([db.questions.bulkGet(ids), allFlashcards(), allCases(), db.annotations.bulkGet(ids)]);
  const fm = new Map(fcs.map((f) => [f.id, f]));
  const cm = new Map(cs.map((c) => [c.id, c]));
  return hits.map((h, i) => {
    const text = h.kind === "question" ? qs[i]?.stem ?? "" : h.kind === "flashcard" ? fm.get(h.id)?.front ?? "" : cm.get(h.id)?.title ?? "";
    return { id: h.id, kind: h.kind, text: plain(text, 220), topic: anns[i]?.topic ?? "", subtopic: anns[i]?.subtopic ?? "", score: h.score };
  });
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kinds, setKinds] = useState<Annotation["kind"][]>(KINDS);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AiSearchPlan | null>(null);
  const [error, setError] = useState("");
  const topicParam = params.get("topic");
  const online = useOnline();

  const topics = useLiveQuery(async () => {
    const anns = await db.annotations.toArray();
    const m = new Map<string, number>();
    anns.forEach((a) => m.set(a.topic, (m.get(a.topic) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  });

  const runText = async (text: string) => {
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      let hits: SearchHit[] = await search(text, { kinds });
      if (!hits.length) hits = await search(text, { kinds, combineWith: "OR" });
      setRows(await hydrate(hits.slice(0, 500)));
    } finally {
      setBusy(false);
    }
  };

  const runTopic = async (topic: string) => {
    setBusy(true);
    setPlan(null);
    const anns = await db.annotations.where("topic").equals(topic).toArray();
    setRows(await hydrate(anns.filter((a) => kinds.includes(a.kind)).map((a) => ({ id: a.id, kind: a.kind, score: 1 }))));
    setBusy(false);
  };

  const runAi = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      const anns = await db.annotations.toArray();
      const known = Array.from(new Set(anns.flatMap((a) => a.tags))).slice(0, 300);
      const p = await aiSearchPlan(q, known);
      setPlan(p);
      const hits = await search(p.terms.concat(p.subtopics).join(" "), { kinds, combineWith: "OR" });
      // boost items whose annotation matches the suggested topics
      const annMap = new Map(anns.map((a) => [a.id, a]));
      const boosted = hits
        .map((h) => {
          const a = annMap.get(h.id);
          let score = h.score;
          if (a && p.subtopics.includes(a.subtopic)) score *= 2;
          else if (a && p.topics.includes(a.topic)) score *= 1.4;
          return { ...h, score };
        })
        .sort((a, b) => b.score - a.score);
      setRows(await hydrate(boosted.slice(0, 300)));
    } catch (e) {
      setError(describeAiError(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const pq = params.get("q");
    if (topicParam) runTopic(topicParam);
    else if (pq) {
      setQ(pq);
      runText(pq);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const questionIds = rows?.filter((r) => r.kind === "question").map((r) => r.id) ?? [];

  return (
    <div>
      <h1>Search</h1>
      <div className="card stack">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(q ? { q } : {});
          }}
        >
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder='e.g. "vasospasm", "Spetzler-Martin", "posterior fossa tumours in children"' style={{ flex: 1, minWidth: 200 }} />
          <button className="primary" type="submit" disabled={busy}>
            Search
          </button>
          <button type="button" disabled={busy || !q.trim() || !aiAvailable() || !online} onClick={runAi} title={!online ? "Offline – normal search still works" : aiAvailable() ? "Let Claude interpret the request" : "Add an API key in Settings"}>
            ✦ Smart search
          </button>
        </form>
        <div className="row small">
          {KINDS.map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} /> {k}s
            </label>
          ))}
        </div>
        {plan && (
          <div className="small muted">
            {plan.explanation} <br />
            {plan.topics.map((t) => (
              <span key={t} className="chip accent">
                {t}
              </span>
            ))}{" "}
            {plan.terms.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        )}
        {error && <div className="error small">{error}</div>}
      </div>

      {rows === null && topics && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Browse by topic</h3>
          <div className="row">
            {topics.map(([t, n]) => (
              <Link key={t} className="chip accent" to={`/search?topic=${encodeURIComponent(t)}`}>
                {t} ({n})
              </Link>
            ))}
          </div>
          {!topics.length && <p className="muted small">No tags yet – run tagging.</p>}
        </div>
      )}

      {rows && (
        <div className="card">
          <div className="row between">
            <strong>
              {rows.length} result(s){topicParam ? ` in ${topicParam}` : ""}
            </strong>
            <button className="primary small" disabled={!questionIds.length} onClick={() => nav("/quiz", { state: { ids: questionIds, title: `Search: ${q || topicParam}` } })}>
              Make a test from {questionIds.length} questions
            </button>
          </div>
          {busy && <div className="muted">Searching…</div>}
          {rows.map((r) => (
            <Link
              key={r.id}
              to={r.kind === "question" ? `/question/${encodeURIComponent(r.id)}` : r.kind === "case" ? `/cases/${encodeURIComponent(r.id)}` : `/flashcards?card=${encodeURIComponent(r.id)}`}
              className="list-item clickable"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="chip">{r.kind}</span>
              <div style={{ flex: 1 }}>
                <div>{r.text}</div>
                {r.topic && (
                  <div className="small muted">
                    {r.topic}
                    {r.subtopic ? ` › ${r.subtopic}` : ""}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
