import { allCases, allFlashcards, db } from "../lib/db";
import type { Annotation, CaseScenario, Flashcard, Question } from "../lib/types";
import { answerSummary } from "../lib/grading";
import { chunk } from "../lib/util";
import { aiTagBatch, type TagInput } from "./claude";
import { localTag } from "./taxonomy";

export type TagScope = "untagged" | "local-only" | "all";
export type ItemKind = Annotation["kind"];

function stripMd(s: string): string {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ");
}

export function questionText(q: Question): string {
  const opts = [
    ...q.options.map((o) => `${o.key}. ${o.text}`),
    ...(q.choices?.length ? ["Answer list: " + q.choices.map((c) => `${c.key}. ${c.text}`).join("; ")] : [])
  ].join("\n");
  return stripMd(`${q.stem}\n${opts}\nCorrect: ${answerSummary(q)}\nExplanation: ${q.explanation}`);
}

export function flashcardText(f: Flashcard): string {
  return stripMd(`${f.front}\n${f.back}`);
}

export function caseText(c: CaseScenario): string {
  return stripMd(
    `${c.title}\n${c.presentation}\n${c.stages.map((s) => `${s.title}: ${s.content} ${s.question ?? ""} ${s.answer ?? ""}`).join("\n")}\n${c.discussion}`
  );
}

interface Item {
  id: string;
  kind: ItemKind;
  text: string;
  sourceTags: string[];
}

export async function collectItems(kinds: ItemKind[], bookIds: string[] | null): Promise<Item[]> {
  const inBook = (b?: string) => !bookIds || (b !== undefined && bookIds.includes(b));
  const items: Item[] = [];
  if (kinds.includes("question")) {
    const qs = bookIds ? await db.questions.where("bookId").anyOf(bookIds).toArray() : await db.questions.toArray();
    qs.forEach((q) => items.push({ id: q.id, kind: "question", text: questionText(q), sourceTags: q.sourceTags }));
  }
  if (kinds.includes("flashcard"))
    (await allFlashcards()).filter((f) => inBook(f.bookId)).forEach((f) => items.push({ id: f.id, kind: "flashcard", text: flashcardText(f), sourceTags: f.sourceTags }));
  if (kinds.includes("case"))
    (await allCases()).filter((c) => inBook(c.bookId)).forEach((c) => items.push({ id: c.id, kind: "case", text: caseText(c), sourceTags: c.sourceTags }));
  return items;
}

async function filterScope(items: Item[], scope: TagScope): Promise<Item[]> {
  if (scope === "all") return items;
  const anns = await db.annotations.bulkGet(items.map((i) => i.id));
  return items.filter((_, i) => {
    const a = anns[i];
    if (!a) return true;
    return scope === "local-only" ? a.source === "local" : false;
  });
}

export async function runLocalTagging(kinds: ItemKind[], bookIds: string[] | null, scope: TagScope): Promise<number> {
  const items = await filterScope(await collectItems(kinds, bookIds), scope === "local-only" ? "untagged" : scope);
  const now = Date.now();
  const existing = await db.annotations.bulkGet(items.map((i) => i.id));
  const rows: Annotation[] = [];
  items.forEach((it, i) => {
    // never overwrite AI or manual tags with the keyword tagger
    if (existing[i] && existing[i]!.source !== "local") return;
    const t = localTag(it.text + " " + it.sourceTags.join(" "));
    rows.push({ id: it.id, kind: it.kind, topic: t.topic, subtopic: t.subtopic, tags: Array.from(new Set([...it.sourceTags, ...t.tags])), keywords: t.keywords, source: "local", updatedAt: now });
  });
  await db.annotations.bulkPut(rows);
  return rows.length;
}

export interface AiTagProgress {
  done: number;
  total: number;
  failed: number;
  lastError?: string;
}

export async function runAiTagging(
  kinds: ItemKind[],
  bookIds: string[] | null,
  scope: TagScope,
  onProgress: (p: AiTagProgress) => void,
  signal: AbortSignal,
  batchSize = 12,
  concurrency = 3
): Promise<AiTagProgress> {
  const items = await filterScope(await collectItems(kinds, bookIds), scope);
  const batches = chunk(items, batchSize);
  const progress: AiTagProgress = { done: 0, total: items.length, failed: 0 };
  onProgress({ ...progress });
  const byId = new Map(items.map((i) => [i.id, i]));

  let next = 0;
  let stopped = false;
  async function worker() {
    while (next < batches.length && !signal.aborted && !stopped) {
      const batch = batches[next++];
      try {
        const input: TagInput[] = batch.map((b) => ({ id: b.id, text: b.text + (b.sourceTags.length ? `\nSource tags: ${b.sourceTags.join(", ")}` : "") }));
        const tags = await aiTagBatch(input, signal);
        const now = Date.now();
        await db.annotations.bulkPut(
          tags.map((t) => ({
            id: t.id,
            kind: byId.get(t.id)!.kind,
            topic: t.topic,
            subtopic: t.subtopic,
            tags: Array.from(new Set([...byId.get(t.id)!.sourceTags, ...t.tags])),
            keywords: t.keywords,
            difficulty: t.difficulty,
            highYield: t.high_yield,
            summary: t.summary,
            source: "ai" as const,
            updatedAt: now
          }))
        );
        progress.done += tags.length;
        progress.failed += batch.length - tags.length;
      } catch (e) {
        if (signal.aborted) break;
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // connection lost: stop cleanly – a later run picks up where this left off
          stopped = true;
          progress.lastError = "Connection lost – stopped. Run again when online to continue.";
          onProgress({ ...progress });
          break;
        }
        progress.failed += batch.length;
        progress.lastError = e instanceof Error ? e.message : String(e);
      }
      onProgress({ ...progress });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return progress;
}
