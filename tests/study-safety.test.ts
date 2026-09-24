import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { clearMediaCache, resolveMedia } from "../src/lib/media";
import { buildPool, emptyFilter } from "../src/lib/quiz";
import type { Question } from "../src/lib/types";

beforeEach(async () => {
  clearMediaCache();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("study content isolation", () => {
  it("includes selected books and selected chapters without duplicates", async () => {
    const question = (id: string, bookId: string, chapterId: string, order: number): Question => ({
      id, bookId, chapterId, order, number: id, stem: id, options: [], answer: [],
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
});
