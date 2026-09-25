import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../lib/db";
import { resolveMedia } from "../lib/media";
import type { AtlasEntry, CaseScenario, Question } from "../lib/types";
import { normaliseFileName } from "../lib/util";

type Role = "question" | "answer" | "reference" | "case";
interface AtlasItem {
  key: string;
  file: string;
  caption?: string;
  roles: Set<Role>;
  questions: { id: string; number: string; chapterId: string }[];
  cases: { id: string; title: string }[];
  chapterIds: string[];
  title?: string;
  tags: string[];
  kind?: string;
  description?: string;
}

const PAGE = 48;
const inline = (text: string) => [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g), ...text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);

/** Every image of a book with the questions that use it. */
function collect(questions: Question[], cases: CaseScenario[], atlas: AtlasEntry[]): AtlasItem[] {
  const items = new Map<string, AtlasItem>();
  const add = (file: string, role: Role, q: Question, caption?: string) => {
    const key = normaliseFileName(file);
    const it = items.get(key) ?? { key, file, caption, roles: new Set<Role>(), questions: [], cases: [], chapterIds: [], tags: [] };
    it.roles.add(role);
    if (caption && !it.caption) it.caption = caption;
    if (!it.questions.some((x) => x.id === q.id)) it.questions.push({ id: q.id, number: q.number, chapterId: q.chapterId });
    if (!it.chapterIds.includes(q.chapterId)) it.chapterIds.push(q.chapterId);
    items.set(key, it);
  };
  for (const q of questions) {
    q.stemMedia.forEach((m) => add(m.file, "question", q, m.caption));
    q.options.forEach((o) => o.media.forEach((m) => add(m.file, "question", q, m.caption)));
    [q.stem, ...q.options.map((o) => o.text)].flatMap(inline).forEach((f) => add(f, "question", q));
    q.explanationMedia.forEach((m) => add(m.file, "answer", q, m.caption));
    inline(q.explanation).forEach((f) => add(f, "answer", q));
  }
  const addCase = (file: string, c: CaseScenario, caption?: string) => {
    const key = normaliseFileName(file);
    const it = items.get(key) ?? { key, file, caption, roles: new Set<Role>(), questions: [], cases: [], chapterIds: [], tags: [] };
    it.roles.add("case");
    if (!it.caption) it.caption = caption;
    if (!it.cases.some((x) => x.id === c.id)) it.cases.push({ id: c.id, title: c.title });
    if (c.chapterId && !it.chapterIds.includes(c.chapterId)) it.chapterIds.push(c.chapterId);
    items.set(key, it);
  };
  for (const c of cases) {
    c.presentationMedia.forEach((m) => addCase(m.file, c, m.caption));
    c.stages.forEach((s) => {
      s.media.forEach((m) => addCase(m.file, c, m.caption));
      (s.answerMedia ?? []).forEach((m) => addCase(m.file, c, m.caption));
    });
  }
  for (const a of atlas) {
    const key = normaliseFileName(a.file);
    const it = items.get(key) ?? { key, file: a.file, roles: new Set<Role>(), questions: [], cases: [], chapterIds: [], tags: [] };
    it.roles.add("reference");
    it.title = a.title;
    it.caption = a.title;
    it.kind = a.kind;
    it.description = a.description;
    it.tags = a.sourceTags;
    if (!it.chapterIds.includes(a.chapterId)) it.chapterIds.push(a.chapterId);
    items.set(key, it);
  }
  return Array.from(items.values());
}

export default function ImageAtlas() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const books = useLiveQuery(() => db.books.orderBy("title").toArray());
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  // start on the first book that has images
  const imageCounts = useLiveQuery(async () => {
    const out: Record<string, number> = {};
    await db.media.orderBy("bookId").eachKey((k) => (out[String(k)] = (out[String(k)] ?? 0) + 1));
    return out;
  });
  useEffect(() => {
    const selected = params.get("book");
    if (selected && books?.some((b) => b.id === selected) && bookId !== selected) setBookId(selected);
    else if (!bookId && books && imageCounts) setBookId(books.find((b) => imageCounts[b.id])?.id ?? books[0]?.id ?? "");
  }, [books, imageCounts, bookId, params]);

  const chapters = useLiveQuery(() => (bookId ? db.chapters.where("bookId").equals(bookId).sortBy("order") : []), [bookId]);
  const all = useLiveQuery(async () => {
    if (!bookId) return [];
    const [questions, cases, atlas] = await Promise.all([
      db.questions.where("bookId").equals(bookId).sortBy("order"),
      db.cases.where("bookId").equals(bookId).toArray(),
      db.atlas.where("bookId").equals(bookId).toArray()
    ]);
    return collect(questions, cases, atlas);
  }, [bookId]);
  const chapterTitle = useMemo(() => new Map((chapters ?? []).map((c) => [c.id, c.title])), [chapters]);

  const items = (all ?? []).filter((it) => (role === "all" || it.roles.has(role))
    && (!chapterId || it.chapterIds.includes(chapterId))
    && (!query.trim() || [it.title, it.caption, it.description, it.kind, ...it.tags, ...it.chapterIds.map((id) => chapterTitle.get(id))]
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))));
  useEffect(() => setShown(PAGE), [bookId, chapterId, role, query]);

  const testIds = Array.from(new Set(items.filter((it) => it.roles.has("question")).flatMap((it) => it.questions.map((q) => q.id))));

  return (
    <div>
      <h1>Image atlas</h1>
      <div className="card stack">
        <div className="row">
          <label className="field">
            Book
            <select
              id="atlas-book"
              value={bookId}
              onChange={(e) => {
                setBookId(e.target.value);
                setParams({ book: e.target.value });
                setChapterId("");
              }}
            >
              {books?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({imageCounts?.[b.id] ?? 0} images)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Chapter
            <select id="atlas-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              <option value="">All chapters</option>
              {chapters?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row between">
          <div className="segmented">
            {(["all", "reference", "case", "question", "answer"] as const).map((r) => (
              <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
                {r === "all" ? "All images" : r === "reference" ? "Reference atlas" : r === "case" ? "Case images" : r === "question" ? "Shown with question" : "Answer images"}
              </button>
            ))}
          </div>
          <button className="primary small" disabled={!testIds.length} onClick={() => nav("/quiz", { state: { ids: testIds, title: "Image questions" } })}>
            Test me on these ({testIds.length} questions)
          </button>
        </div>
        <label className="field">Search titles, topics and tags
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. hydrocephalus, anatomy, vascular" />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {items.length} image(s). Tap an image to open the viewer and swipe through them all.
        </p>
      </div>

      <div className="atlas" data-gallery="">
        {items.slice(0, shown).map((it) => (
          <figure className="card atlas-item" key={it.key}>
            <Thumb bookId={bookId} file={it.file} caption={it.caption ?? `${it.questions.map((q) => `Q${q.number}`).join(", ")}`} />
            <figcaption className="small">
              <div className="row" style={{ gap: 4 }}>
                <span className={`chip ${it.roles.has("answer") && !it.roles.has("question") ? "warn" : ""}`}>
                  {it.roles.has("reference") ? it.kind ?? "reference" : it.roles.has("case") ? "case" : it.roles.has("answer") && !it.roles.has("question") ? "answer" : "question"}
                </span>
                {it.questions.slice(0, 3).map((q) => (
                  <Link key={q.id} to={`/question/${encodeURIComponent(q.id)}`}>
                    Q{q.number}
                  </Link>
                ))}
                {it.questions.length > 3 && <span className="muted">+{it.questions.length - 3}</span>}
                {it.cases.slice(0, 2).map((c) => <Link key={c.id} to={`/cases/${encodeURIComponent(c.id)}`}>{c.title}</Link>)}
              </div>
              <div className="muted atlas-chapter">{it.chapterIds.map((id) => chapterTitle.get(id)).filter(Boolean).join(" · ")}</div>
              {(it.title || it.caption) && <div>{it.title || it.caption}</div>}
              {it.description && <div className="muted">{it.description}</div>}
              {!!it.tags.length && <div className="muted">{it.tags.join(" · ")}</div>}
            </figcaption>
          </figure>
        ))}
      </div>
      {shown < items.length && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button onClick={() => setShown(shown + PAGE)}>Show more ({items.length - shown} left)</button>
        </div>
      )}
      {all && !items.length && <div className="card muted">No images in this selection.</div>}
    </div>
  );
}

function Thumb({ bookId, file, caption }: { bookId: string; file: string; caption: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    resolveMedia(bookId, file).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [bookId, file]);
  if (url === undefined) return <div className="atlas-thumb media-missing">Loading…</div>;
  if (url === null) return <div className="atlas-thumb media-missing">Missing: {file}</div>;
  return <img className="atlas-thumb" src={url} alt={caption} data-zoomable="" data-caption={caption} loading="lazy" />;
}
