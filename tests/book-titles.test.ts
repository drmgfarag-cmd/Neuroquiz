import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { syncBundledBookTitles } from "../src/lib/library";

afterEach(() => vi.unstubAllGlobals());

it("renames installed default titles while preserving a reader's custom title and study records", async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const books = [
    { id: "01", title: "MCQs in Neurology and Neurosurgery for Medical Students", version: "v1", files: [] },
    { id: "02", title: "AAOS Adult Spine Self-Assessment Examination (2015)", version: "v1", files: [] },
    { id: "05", title: "The Comprehensive Neurosurgery Board Preparation Book: Illustrated Questions and Answers", version: "v1", files: [] },
    { id: "09", title: "Neurosurgery: Board and Certification Review, 2023 Edition", version: "v1", files: [] }
  ];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ books }))));
  const base = { sources: [], importedAt: 1, questionCount: 1, flashcardCount: 0, caseCount: 0 };
  await db.books.bulkPut([
    { ...base, id: "01", title: "Neurology & Neurosurgery MCQs (Book 01)" },
    { ...base, id: "02", title: "Spine Self-Assessment (Book 02)" },
    { ...base, id: "05", title: "My personal copy" },
    { ...base, id: "09", title: "Neurosurgery Board Questions (Book 09)" }
  ]);
  await db.questionStates.put({ questionId: "01:question", timesSeen: 1, timesCorrect: 1, flagged: false, note: "", srs: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: 0 }, updatedAt: 1 });

  await syncBundledBookTitles();

  expect((await db.books.get("01"))?.title).toBe(books[0].title);
  expect((await db.books.get("02"))?.title).toBe(books[1].title);
  expect((await db.books.get("05"))?.title).toBe("My personal copy");
  expect((await db.books.get("09"))?.title).toBe(books[3].title);
  expect(await db.questionStates.get("01:question")).toBeDefined();
});
