import JSZip from "jszip";
import { allCases, allFlashcards, db } from "../lib/db";
import type { Annotation, Correction, MediaRef, Question } from "../lib/types";

/**
 * Packs one book (questions, flashcards, cases, images and tags) into a ZIP
 * that NeuroQuiz can import on another device – no network needed. Question
 * ids are derived from the content, so progress and tags line up again.
 */
export async function exportBookZip(bookId: string): Promise<{ blob: Blob; name: string }> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");
  const [chapters, questions, flashcards, cases, media, atlas] = await Promise.all([
    db.chapters.where("bookId").equals(bookId).sortBy("order"),
    db.questions.where("bookId").equals(bookId).sortBy("order"),
    allFlashcards().then((f) => f.filter((x) => x.bookId === bookId && x.origin === "imported")),
    allCases().then((c) => c.filter((x) => x.bookId === bookId && x.origin === "imported")),
    db.media.where("bookId").equals(bookId).toArray(),
    db.atlas.where("bookId").equals(bookId).toArray()
  ]);
  const anns = new Map(
    (await db.annotations.bulkGet([...questions, ...flashcards, ...cases].map((x) => x.id))).filter((a): a is Annotation => !!a).map((a) => [a.id, a])
  );
  const tag = (id: string) => {
    const a = anns.get(id);
    if (!a) return undefined;
    const { id: _id, kind: _kind, ...rest } = a;
    void _id;
    void _kind;
    return rest;
  };
  // export what the book says: ids are a hash of the original text, so the
  // other device gets the same ids and re-applies the (synced) corrections
  const fixes = new Map((await db.corrections.bulkGet(questions.map((q) => q.id))).filter((c): c is Correction => !!c).map((c) => [c.questionId, c.original]));
  const asImported = (q: Question): Question => ({ ...q, ...(fixes.get(q.id) ?? {}) });
  const refs = (m: MediaRef[]) => m.map((x) => (x.caption ? { file: x.file, caption: x.caption } : x.file));

  const json = {
    book: book.title,
    book_title: book.title,
    book_id: book.id,
    ...(atlas.length ? { atlas_items: atlas.map((a) => ({ file: a.file, title: a.title, topic: chapters.find((c) => c.id === a.chapterId)?.title ?? "Other",
      description: a.description, kind: a.kind, source_page: a.sourcePage, tags: a.sourceTags, group_id: a.groupId })) } : {}),
    exported_by: "NeuroQuiz",
    exported_at: new Date().toISOString(),
    chapters: chapters.map((ch) => ({
      title: ch.title,
      questions: questions
        .filter((q) => q.chapterId === ch.id)
        .map(asImported)
        .map((q) => ({
          number: q.number,
          ...(q.sourceId ? { question_id: q.sourceId } : {}),
          ...(q.groupId ? { group_id: q.groupId.startsWith(`${q.chapterId}:`) ? q.groupId.slice(q.chapterId.length + 1) : q.groupId } : {}),
          ...(q.sourceWarning ? { source_warning: q.sourceWarning } : {}),
          stem: q.stem,
          stem_media: refs(q.stemMedia),
          options: q.options.map((o) => ({ key: o.key, text: o.text, media: refs(o.media) })),
          answer: q.answer,
          ...(q.format ? { format: q.format } : {}),
          ...(q.verdicts ? { option_verdicts: Object.fromEntries(Object.entries(q.verdicts).map(([k, v]) => [k, v ? "TRUE" : "FALSE"])) } : {}),
          ...(q.matches ? { answer_key_map: q.matches } : {}),
          ...(q.choices ? { choice_list: Object.fromEntries(q.choices.map((c) => [c.key, c.text])) } : {}),
          ...(q.format === "ordering" ? { correct_order: q.answer } : {}),
          ...(q.accepted ? { accepted_answers: q.accepted } : {}),
          ...(q.regions ? { hotspots: q.regions } : {}),
          ...(q.panel ? { panel_votes: q.panel } : {}),
          explanation: q.explanation,
          explanation_media: refs(q.explanationMedia),
          tags: q.sourceTags,
          annotation: tag(q.id)
        })),
      flashcards: flashcards
        .filter((f) => f.chapterId === ch.id)
        .map((f) => ({ front: f.front, back: f.back, front_media: refs(f.frontMedia), back_media: refs(f.backMedia), tags: f.sourceTags, annotation: tag(f.id) })),
      cases: cases
        .filter((c) => c.chapterId === ch.id)
        .map((c) => ({
          title: c.title,
          ...(c.kind ? { kind: c.kind } : {}),
          presentation: c.presentation,
          presentation_media: refs(c.presentationMedia),
          stages: c.stages.map((s) => ({ title: s.title, content: s.content, question: s.question, answer: s.answer, media: refs(s.media), answer_media: refs(s.answerMedia ?? []) })),
          discussion: c.discussion,
          tags: c.sourceTags,
          annotation: tag(c.id)
        }))
    }))
  };

  const zip = new JSZip();
  const folder = zip.folder(book.id)!;
  folder.file("book.json", JSON.stringify(json, null, 1));
  // images are already compressed – store them as-is
  for (const m of media) folder.file(`images/${m.name}`, m.blob, { compression: "STORE" });
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, name: `${book.id}.zip` };
}
