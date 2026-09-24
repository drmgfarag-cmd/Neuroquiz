import MiniSearch from "minisearch";
import { allCases, allFlashcards, db } from "./db";
import type { Annotation } from "./types";
import { caseText, flashcardText, questionText } from "../ai/tagger";

export interface SearchDoc {
  id: string;
  kind: Annotation["kind"];
  bookId: string;
  chapterId: string;
  text: string;
  tags: string;
  topic: string;
  subtopic: string;
  keywords: string;
}

let index: MiniSearch<SearchDoc> | null = null;
let signature = "";

async function currentSignature(): Promise<string> {
  const [q, f, uf, c, uc, a, last] = await Promise.all([
    db.questions.count(),
    db.flashcards.count(),
    db.userFlashcards.count(),
    db.cases.count(),
    db.userCases.count(),
    db.annotations.count(),
    db.annotations.orderBy("updatedAt").last()
  ]);
  const books = (await db.books.toArray()).map((b) => b.importedAt).join(",");
  return [q, f, uf, c, uc, a, last?.updatedAt ?? 0, books].join("|");
}

export async function getIndex(): Promise<MiniSearch<SearchDoc>> {
  const sig = await currentSignature();
  if (index && sig === signature) return index;

  const anns = new Map((await db.annotations.toArray()).map((a) => [a.id, a]));
  const docs: SearchDoc[] = [];
  const annFields = (id: string, sourceTags: string[]) => {
    const a = anns.get(id);
    return {
      tags: [...sourceTags, ...(a?.tags ?? [])].join(" · "),
      topic: a?.topic ?? "",
      subtopic: a?.subtopic ?? "",
      keywords: (a?.keywords ?? []).join(" ")
    };
  };
  for (const q of await db.questions.toArray())
    docs.push({ id: q.id, kind: "question", bookId: q.bookId, chapterId: q.chapterId, text: questionText(q), ...annFields(q.id, q.sourceTags) });
  for (const f of await allFlashcards())
    docs.push({ id: f.id, kind: "flashcard", bookId: f.bookId ?? "", chapterId: f.chapterId ?? "", text: flashcardText(f), ...annFields(f.id, f.sourceTags) });
  for (const c of await allCases())
    docs.push({ id: c.id, kind: "case", bookId: c.bookId ?? "", chapterId: c.chapterId ?? "", text: caseText(c), ...annFields(c.id, c.sourceTags) });

  const ms = new MiniSearch<SearchDoc>({
    fields: ["text", "tags", "topic", "subtopic", "keywords"],
    storeFields: ["kind", "bookId", "chapterId", "topic", "subtopic"],
    searchOptions: {
      boost: { tags: 3, keywords: 3, subtopic: 2.5, topic: 2 },
      prefix: (term) => term.length > 3,
      fuzzy: (term) => (term.length > 5 ? 0.2 : false),
      combineWith: "OR"
    }
  });
  await ms.addAllAsync(docs, { chunkSize: 500 });
  index = ms;
  signature = sig;
  return ms;
}

export interface SearchHit {
  id: string;
  kind: Annotation["kind"];
  bookId: string;
  chapterId: string;
  topic: string;
  subtopic: string;
  score: number;
  terms: string[];
}

export async function search(query: string, opts: { combineWith?: "AND" | "OR"; kinds?: Annotation["kind"][] } = {}): Promise<SearchHit[]> {
  const ms = await getIndex();
  const res = ms.search(query, {
    combineWith: opts.combineWith ?? "AND",
    filter: opts.kinds ? (r) => opts.kinds!.includes(r.kind) : undefined
  });
  return res.map((r) => ({ id: r.id, kind: r.kind, bookId: r.bookId, chapterId: r.chapterId, topic: r.topic, subtopic: r.subtopic, score: r.score, terms: r.terms }));
}
