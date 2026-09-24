import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { localTag } from "../src/ai/taxonomy";
import { runLocalTagging } from "../src/ai/tagger";
import { exportBookZip } from "../src/import/exporter";
import { collectFiles, executeImport, planImport, type SourceFile } from "../src/import/importer";
import { revertCorrection, saveCorrection } from "../src/lib/corrections";
import { db, deleteSynced } from "../src/lib/db";
import { buildPool, createSession, emptyFilter, recordResult } from "../src/lib/quiz";
import { search } from "../src/lib/search";
import { applyChanges, collectChanges } from "../src/lib/sync";

function sampleFiles(): SourceFile[] {
  const base = new URL("../samples/sample-book/", import.meta.url);
  return ["01-vascular.json", "02-oncology-trauma.json", "03-spine-functional.json", "images/fig_cow.svg", "images/fig_edh.svg"].map((p) => ({
    path: `sample-book/${p}`,
    blob: new Blob([readFileSync(new URL(p, base))])
  }));
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("import → tag → search → quiz → sync", () => {
  it("imports the sample book as one book with all chapters and images", async () => {
    const plan = await planImport(sampleFiles(), "auto", 1);
    expect(plan.books).toHaveLength(1);
    expect(plan.books[0].title).toBe("Sample Neurosurgery Review");
    const res = await executeImport(plan);
    expect(res).toMatchObject({ books: 1, chapters: 4, questions: 8, flashcards: 3, cases: 1, images: 2, missingImages: [] });
    const ids1 = (await db.questions.toArray()).map((q) => q.id).sort();

    // re-import is idempotent and keeps ids stable (progress survives)
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    expect((await db.questions.toArray()).map((q) => q.id).sort()).toEqual(ids1);
  });

  it("tags offline, searches and builds filtered pools", async () => {
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    const n = await runLocalTagging(["question", "flashcard", "case"], null, "untagged");
    expect(n).toBe(12);
    const hits = await search("aneurysm");
    expect(hits.length).toBeGreaterThan(0);
    const cvTopic = (await db.annotations.toArray()).filter((a) => a.topic === "Cerebrovascular");
    expect(cvTopic.length).toBeGreaterThanOrEqual(2);

    const pool = await buildPool({ ...emptyFilter(), topics: ["Cerebrovascular"] });
    expect(pool.length).toBe(cvTopic.filter((a) => a.kind === "question").length);

    await recordResult(pool[0], false);
    expect(await buildPool({ ...emptyFilter(), status: "incorrect" })).toHaveLength(1);
    expect(await buildPool({ ...emptyFilter(), status: "unused" })).toHaveLength(7);
  });

  it("merges sync records last-writer-wins with tombstones", async () => {
    await db.annotations.put({ id: "q1", kind: "question", topic: "Old", subtopic: "", tags: [], keywords: [], source: "local", updatedAt: 100 });
    await applyChanges([
      { table: "annotations", id: "q1", updatedAt: 50, row: { id: "q1", kind: "question", topic: "Older", subtopic: "", tags: [], keywords: [], source: "ai", updatedAt: 50 } }
    ]);
    expect((await db.annotations.get("q1"))!.topic).toBe("Old");
    await applyChanges([
      { table: "annotations", id: "q1", updatedAt: 200, row: { id: "q1", kind: "question", topic: "New", subtopic: "", tags: [], keywords: [], source: "ai", updatedAt: 200 } }
    ]);
    expect((await db.annotations.get("q1"))!.topic).toBe("New");

    await deleteSynced("annotations", "q1");
    const out = await collectChanges(0);
    expect(out.find((r) => r.id === "q1")?.deleted).toBe(true);
    // a remote write older than the deletion must not resurrect the row…
    await applyChanges([{ table: "annotations", id: "q1", updatedAt: 300, row: { id: "q1", updatedAt: 300 } as never }]);
    expect(await db.annotations.get("q1")).toBeUndefined();
    // …but a newer one wins
    const later = Date.now() + 10_000;
    await applyChanges([{ table: "annotations", id: "q1", updatedAt: later, row: { id: "q1", updatedAt: later } as never }]);
    expect(await db.annotations.get("q1")).toBeTruthy();
  });
});

describe("book export", () => {
  it("round-trips a book through a ZIP with stable ids, images and tags", async () => {
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    const before = await db.questions.toArray();
    const q = before.find((x) => x.stem.includes("thunderclap"))!;
    await db.annotations.put({ id: q.id, kind: "question", topic: "Cerebrovascular", subtopic: "Aneurysms & SAH", tags: ["AComm"], keywords: ["sah"], difficulty: "easy", highYield: true, summary: "AComm commonest.", source: "ai", updatedAt: 500 });
    await recordResult(q, true);

    const { blob, name } = await exportBookZip("sample-neurosurgery-review");
    expect(name).toBe("sample-neurosurgery-review.zip");

    // simulate the other device: empty database, import the ZIP
    await Promise.all(db.tables.map((t) => t.clear()));
    const files = await collectFiles([new File([blob], name)]);
    const res = await executeImport(await planImport(files, "auto", 1));
    expect(res).toMatchObject({ books: 1, questions: 8, flashcards: 3, cases: 1, images: 2, missingImages: [] });

    const after = await db.questions.toArray();
    expect(after.map((x) => x.id).sort()).toEqual(before.map((x) => x.id).sort());
    const q2 = after.find((x) => x.id === q.id)!;
    expect(q2.answer).toEqual(q.answer);
    expect(q2.stemMedia).toEqual(q.stemMedia);
    expect(q2.options).toEqual(q.options);
    const ann = await db.annotations.get(q.id);
    expect(ann).toMatchObject({ source: "ai", subtopic: "Aneurysms & SAH", highYield: true, summary: "AComm commonest." });
  });

  it("filters questions that show an image before answering", async () => {
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    const pool = await buildPool({ ...emptyFilter(), withImagesOnly: true });
    expect(pool.map((p) => p.number).sort()).toEqual(["1", "6"]);
  });
});

describe("localTag", () => {
  it("categorises by keywords", () => {
    expect(localTag("Spetzler-Martin grading of an arteriovenous malformation").topic).toBe("Cerebrovascular");
    expect(localTag("MGMT methylation in glioblastoma").subtopic).toBe("Gliomas");
    expect(localTag("burst fracture TLICS").topic).toBe("Neurotrauma");
  });
});

describe("books split into chapter files", () => {
  const chapterFile = (n: number, extra: Record<string, unknown> = {}) => ({
    path: `upload/chapter${n}.json`,
    blob: new Blob([
      JSON.stringify({
        book_id: "03",
        chapter_id: String(n).padStart(2, "0"),
        chapter_name: `Chapter ${n} topic`,
        questions: [
          { printed_number: "1", question: `Case for chapter ${n}. Q1?`, answers: { A: "x", B: "y" }, correct_answer: "A", parent_vignette_id: "CASE_1-2" },
          { printed_number: "2", question: `Case for chapter ${n}. Q2?`, answers: { A: "x", B: "y" }, correct_answer: "B", parent_vignette_id: "CASE_1-2" },
          { printed_number: "3", question: `Standalone ${n}?`, answers: { A: "x", B: "y" }, correct_answer: "A" }
        ],
        ...extra
      })
    ])
  });

  it("groups files by book_id, orders chapters by number and keeps a renamed title", async () => {
    // file names sort 10 < 2 < 9 alphabetically – chapter numbers must win
    const files = [chapterFile(10), chapterFile(2), chapterFile(9)];
    const plan = await planImport(files, "auto", 1);
    expect(plan.books).toHaveLength(1);
    expect(plan.books[0]).toMatchObject({ id: "03", title: "Book 03" });
    await executeImport(plan);
    expect((await db.chapters.orderBy("order").toArray()).map((c) => c.title)).toEqual(["Chapter 2 topic", "Chapter 9 topic", "Chapter 10 topic"]);

    await db.books.update("03", { title: "My renamed book" });
    const ids = (await db.questions.toArray()).map((q) => q.id).sort();
    const again = await planImport(files, "auto", 1);
    expect(again.books[0].title).toBe("My renamed book");
    await executeImport(again);
    expect((await db.questions.toArray()).map((q) => q.id).sort()).toEqual(ids);
  });

  it("keeps questions that share a case together when shuffling", async () => {
    await executeImport(await planImport([chapterFile(1), chapterFile(2)], "auto", 1));
    const pool = await buildPool(emptyFilter());
    for (let run = 0; run < 20; run++) {
      const s = await createSession(pool, { mode: "tutor", title: "t", count: 0, shuffleQuestions: true, shuffleOptions: false, secondsPerQuestion: 60 });
      const qs = await db.questions.bulkGet(s.questionIds);
      qs.forEach((q, i) => {
        if (q!.number === "1") expect(qs[i + 1]!.number).toBe("2"); // Q2 of the same case follows Q1
      });
    }
  });
});

describe("question corrections", () => {
  it("survive re-import, sync to other devices and can be reverted", async () => {
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    const q = (await db.questions.toArray()).find((x) => x.stem.includes("thunderclap"))!;
    const fixed = await saveCorrection(q, { answer: ["C"], explanation: "Corrected explanation." });
    expect(fixed).toMatchObject({ answer: ["C"], explanation: "Corrected explanation.", edited: true });

    // book updated → correction re-applied, original refreshed from the book
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    expect(await db.questions.get(q.id)).toMatchObject({ answer: ["C"], edited: true });
    expect((await db.corrections.get(q.id))!.original).toMatchObject({ answer: q.answer, explanation: q.explanation });

    // other device: gets the correction through sync
    const records = await collectChanges(0);
    const corr = records.filter((r) => r.table === "corrections");
    await revertCorrection((await db.questions.get(q.id))!);
    expect(await db.questions.get(q.id)).toMatchObject({ answer: q.answer, explanation: q.explanation, edited: false });
    await db.tombstones.clear();
    await applyChanges(corr.map((r) => ({ ...r, updatedAt: Date.now() + 1000, row: { ...r.row!, updatedAt: Date.now() + 1000 } })));
    expect(await db.questions.get(q.id)).toMatchObject({ answer: ["C"], edited: true });

    // reverted on the other device → tombstone restores the book text here
    await applyChanges([{ table: "corrections", id: q.id, updatedAt: Date.now() + 5000, deleted: true }]);
    expect(await db.questions.get(q.id)).toMatchObject({ answer: q.answer, edited: false });
  });
});
