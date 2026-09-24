import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Annotations } from "../components/Annotations";
import { MediaList, Rich } from "../components/Rich";
import { questionToCard } from "../lib/cards";
import { allFlashcards, db, deleteSynced } from "../lib/db";
import { plain } from "../lib/markdown";
import { newSrs, previewInterval, review, type Grade } from "../lib/srs";
import type { CardState, Flashcard } from "../lib/types";
import { shuffle, uid } from "../lib/util";

type Tab = "study" | "browse" | "new";

export default function Flashcards() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("card") ? "browse" : "study");
  return (
    <div>
      <h1>Flashcards</h1>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button className={tab === "study" ? "active" : ""} onClick={() => setTab("study")}>
          Study
        </button>
        <button className={tab === "browse" ? "active" : ""} onClick={() => setTab("browse")}>
          Browse
        </button>
        <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>
          Create
        </button>
      </div>
      {tab === "study" && <Study />}
      {tab === "browse" && <Browse focus={params.get("card")} />}
      {tab === "new" && <Create onDone={() => setTab("browse")} />}
    </div>
  );
}

function useDecks() {
  return useLiveQuery(async () => {
    const [cards, states, books, anns] = await Promise.all([allFlashcards(), db.cardStates.toArray(), db.books.toArray(), db.annotations.where("kind").equals("flashcard").toArray()]);
    return { cards, states: new Map(states.map((s) => [s.cardId, s])), books, anns: new Map(anns.map((a) => [a.id, a])) };
  });
}

function Study() {
  const d = useDecks();
  const [book, setBook] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<"due" | "cram">("due");
  const [newLimit, setNewLimit] = useState(20);
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const topics = useMemo(() => (d ? Array.from(new Set(Array.from(d.anns.values()).map((a) => a.topic))).sort() : []), [d]);

  const counts = useMemo(() => {
    if (!d) return { due: 0, fresh: 0, total: 0 };
    const now = Date.now();
    const deck = d.cards.filter((c) => (!book || c.bookId === book) && (!topic || d.anns.get(c.id)?.topic === topic));
    let due = 0;
    let fresh = 0;
    deck.forEach((c) => {
      const s = d.states.get(c.id);
      if (!s) fresh++;
      else if (!s.suspended && s.srs.due <= now) due++;
    });
    return { due, fresh, total: deck.length };
  }, [d, book, topic]);

  const start = () => {
    if (!d) return;
    const now = Date.now();
    const deck = d.cards.filter((c) => (!book || c.bookId === book) && (!topic || d.anns.get(c.id)?.topic === topic) && !d.states.get(c.id)?.suspended);
    let q: Flashcard[];
    if (mode === "cram") q = shuffle(deck);
    else {
      const due = deck.filter((c) => d.states.get(c.id) && d.states.get(c.id)!.srs.due <= now).sort((a, b) => d.states.get(a.id)!.srs.due - d.states.get(b.id)!.srs.due);
      const fresh = deck.filter((c) => !d.states.get(c.id)).slice(0, newLimit);
      q = [...due, ...fresh];
    }
    setDoneCount(0);
    setFlipped(false);
    setQueue(q);
  };

  const card = queue?.[0];
  const st = card && d ? d.states.get(card.id) : undefined;
  const srs = st?.srs ?? newSrs();

  const grade = async (g: Grade) => {
    if (!card || !queue) return;
    const next: CardState = { cardId: card.id, srs: review(srs, g), suspended: false, updatedAt: Date.now() };
    await db.cardStates.put(next);
    const rest = queue.slice(1);
    // "again" cards come back at the end of this session
    setQueue(g === "again" && mode === "due" ? [...rest, card] : rest);
    setFlipped(false);
    setDoneCount((n) => n + 1);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) grade((["again", "hard", "good", "easy"] as Grade[])[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!d) return null;

  if (!queue)
    return (
      <div className="card stack">
        <div className="row">
          <label className="field">
            Book
            <select value={book} onChange={(e) => setBook(e.target.value)}>
              <option value="">All books</option>
              {d.books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            New cards per session
            <input type="number" min={0} max={500} value={newLimit} onChange={(e) => setNewLimit(Number(e.target.value) || 0)} style={{ width: 100 }} />
          </label>
        </div>
        <div className="segmented">
          <button className={mode === "due" ? "active" : ""} onClick={() => setMode("due")}>
            Spaced repetition
          </button>
          <button className={mode === "cram" ? "active" : ""} onClick={() => setMode("cram")}>
            Cram (all cards, random)
          </button>
        </div>
        <div>
          <strong>{counts.due}</strong> due · <strong>{Math.min(counts.fresh, newLimit)}</strong> new of {counts.fresh} · {counts.total} in deck
        </div>
        <div className="row">
          <button className="primary" disabled={!counts.total} onClick={start}>
            Start studying
          </button>
        </div>
        {!d.cards.length && <p className="muted small">No flashcards yet. Import books with flashcards, add cards from questions (+ Flashcard after answering), or convert questions in the Create tab.</p>}
      </div>
    );

  if (!card)
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h2>Session complete</h2>
        <p>{doneCount} reviews done.</p>
        <button className="primary" onClick={() => setQueue(null)}>
          Back
        </button>
      </div>
    );

  return (
    <div>
      <div className="row between small muted" style={{ marginBottom: 8 }}>
        <span>{queue.length} left</span>
        <button className="small" onClick={() => setQueue(null)}>
          End session
        </button>
      </div>
      <div className="card flashcard" onClick={() => setFlipped(true)}>
        <div className="side-label">Front</div>
        <Rich text={card.front} bookId={card.bookId} />
        <MediaList media={card.frontMedia} bookId={card.bookId} />
        {flipped && (
          <>
            <hr />
            <div className="side-label">Back</div>
            <Rich text={card.back} bookId={card.bookId} />
            <MediaList media={card.backMedia} bookId={card.bookId} />
          </>
        )}
      </div>
      <div className="sticky-actions">
        {!flipped ? (
          <button className="primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setFlipped(true)}>
            Show answer (Space)
          </button>
        ) : (
          <div className="grade-row">
            {(["again", "hard", "good", "easy"] as Grade[]).map((g, i) => (
              <button key={g} className={g === "good" ? "primary" : g === "again" ? "danger" : ""} onClick={() => grade(g)}>
                {g[0].toUpperCase() + g.slice(1)}
                <small>
                  {mode === "due" ? previewInterval(srs, g) : ""} · {i + 1}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Browse({ focus }: { focus: string | null }) {
  const d = useDecks();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(focus);
  if (!d) return null;
  const f = filter.toLowerCase();
  const list = d.cards.filter((c) => !f || c.front.toLowerCase().includes(f) || c.back.toLowerCase().includes(f)).slice(0, 400);
  return (
    <div className="card">
      <input type="search" placeholder="Filter cards…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%" }} />
      <div className="small muted" style={{ margin: "6px 0" }}>
        {d.cards.length} cards{list.length < d.cards.length ? `, showing ${list.length}` : ""}
      </div>
      {list.map((c) => {
        const st = d.states.get(c.id);
        return (
          <div key={c.id}>
            <div className="list-item clickable" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="chip">{c.origin}</span>
              <div style={{ flex: 1 }}>{plain(c.front, 140)}</div>
              {st && <span className="small muted">{st.suspended ? "suspended" : `due ${new Date(st.srs.due).toLocaleDateString()}`}</span>}
            </div>
            {open === c.id && (
              <div className="stack" style={{ padding: "6px 0 14px" }}>
                <Rich text={c.front} bookId={c.bookId} />
                <MediaList media={c.frontMedia} bookId={c.bookId} />
                <hr style={{ margin: "4px 0" }} />
                <Rich text={c.back} bookId={c.bookId} />
                <MediaList media={c.backMedia} bookId={c.bookId} />
                <Annotations id={c.id} kind="flashcard" extraTags={c.sourceTags} />
                <div className="row">
                  <button
                    className="small"
                    onClick={() => db.cardStates.put({ cardId: c.id, srs: st?.srs ?? newSrs(), suspended: !st?.suspended, updatedAt: Date.now() })}
                  >
                    {st?.suspended ? "Unsuspend" : "Suspend"}
                  </button>
                  <button className="small" onClick={() => db.cardStates.put({ cardId: c.id, srs: newSrs(), suspended: false, updatedAt: Date.now() })}>
                    Reset schedule
                  </button>
                  {c.origin !== "imported" && (
                    <button className="small danger" onClick={() => confirm("Delete this card?") && deleteSynced("userFlashcards", c.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Create({ onDone }: { onDone: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const books = useLiveQuery(() => db.books.toArray());
  const [book, setBook] = useState("");
  const [msg, setMsg] = useState("");

  return (
    <div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>New card</h3>
        <label className="field">
          Front (markdown supported)
          <textarea value={front} onChange={(e) => setFront(e.target.value)} />
        </label>
        <label className="field">
          Back
          <textarea value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        <div className="row">
          <button
            className="primary"
            disabled={!front.trim() || !back.trim()}
            onClick={async () => {
              const now = Date.now();
              await db.userFlashcards.put({ id: uid("u_"), front, back, frontMedia: [], backMedia: [], sourceTags: [], origin: "user", createdAt: now, updatedAt: now });
              setFront("");
              setBack("");
              onDone();
            }}
          >
            Save card
          </button>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Convert questions into cards</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Creates one card per question (stem → correct answer + explanation). For concise AI-written cards use “+ AI flashcards” after answering a question.
        </p>
        <div className="row">
          <select value={book} onChange={(e) => setBook(e.target.value)}>
            <option value="">Choose a book…</option>
            {books?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <button
            disabled={!book}
            onClick={async () => {
              const qs = await db.questions.where("bookId").equals(book).toArray();
              await db.userFlashcards.bulkPut(qs.filter((q) => q.answer.length).map(questionToCard));
              setMsg(`Created ${qs.length} cards.`);
            }}
          >
            Convert
          </button>
          <span className="small muted">{msg}</span>
        </div>
      </div>
    </div>
  );
}
