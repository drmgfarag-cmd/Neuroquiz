import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { clearMediaCache, resolveMedia } from "../src/lib/media";
import { buildPool, emptyFilter, finishSession, getState, recordResult } from "../src/lib/quiz";
import { auditBook } from "../src/lib/quality";
import type { Question, QuizSession } from "../src/lib/types";
import { executeImport, planImport } from "../src/import/importer";

beforeEach(async () => {
  clearMediaCache();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("study content isolation", () => {
  it("includes selected books and selected chapters without duplicates", async () => {
    const question = (id: string, bookId: string, chapterId: string, order: number): Question => ({
      id, bookId, chapterId, order, number: id, stem: id, options: [{ key: "A", text: "answer", media: [] }], answer: ["A"],
      explanation: "", stemMedia: [], explanationMedia: [], sourceTags: []
    });
    await db.questions.bulkPut([
      question("a1", "a", "a:1", 1), question("a2", "a", "a:2", 2),
      question("b1", "b", "b:1", 3), question("c1", "c", "c:1", 4)
    ]);
    const pool = await buildPool({ ...emptyFilter(), bookIds: ["a"], chapterIds: ["a:1", "b:1"] });
    expect(pool.map((q) => q.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("does not show another book's image when the requested book lacks it", async () => {
    await db.media.put({ id: "other/scan.png", bookId: "other", name: "scan.png", blob: new Blob(["other patient"]) });
    expect(await resolveMedia("current", "scan.png")).toBeNull();
    expect(await resolveMedia("other", "scan.png")).toMatch(/^blob:/);
  });

  it("keeps an unkeyed question readable but out of scored pools", async () => {
    const q: Question = { id: "unkeyed", bookId: "book", chapterId: "chapter", order: 1, number: "1", stem: "Review me", options: [{ key: "A", text: "A", media: [] }], answer: [], explanation: "Source discussion", stemMedia: [], explanationMedia: [], sourceTags: [] };
    await db.questions.put(q);
    expect(await buildPool(emptyFilter())).toEqual([]);
    expect((await buildPool(emptyFilter(), true)).map((item) => item.id)).toEqual(["unkeyed"]);
    expect(auditBook([q], []).unscorable).toHaveLength(1);
    await recordResult(q, false);
    expect((await getState(q.id)).timesSeen).toBe(0);
    const session: QuizSession = {
      id: "old-session", mode: "exam", title: "Old exam", questionIds: [q.id],
      answers: { [q.id]: { questionId: q.id, selected: ["A"], correct: false, timeMs: 100 } },
      current: 0, startedAt: Date.now(), updatedAt: Date.now()
    };
    await db.sessions.put(session);
    const done = await finishSession(session);
    expect(done.answers[q.id].correct).toBeUndefined();
    expect(done.answers[q.id].unscoredSubmitted).toBe(true);
    expect(done.score).toBe(0);
    expect((await getState(q.id)).timesSeen).toBe(0);
  });

  it("rejects same-named images from different folders before they can overwrite each other", async () => {
    const plan = await planImport([
      { path: "book/questions.json", blob: new Blob([JSON.stringify({ book: "Book", questions: [{ question: "What is shown in the image?", options: { A: "A", B: "B" }, answer: "A", images: ["scan.png"] }] })]) },
      { path: "book/images/scan.png", blob: new Blob(["patient one"]) },
      { path: "book/figures/scan.png", blob: new Blob(["patient two"]) }
    ], "auto", 1);
    await expect(executeImport(plan)).rejects.toThrow("Ambiguous image name");
    expect(await db.books.count()).toBe(0);
  });
});
