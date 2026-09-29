import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { buildPool, emptyFilter } from "../src/lib/quiz";
import type { Question } from "../src/lib/types";

const question = (id: string, bookId: string): Question => ({
  id,
  bookId,
  chapterId: `${bookId}:chapter`,
  number: "1",
  stem: "Question",
  options: [{ key: "A", text: "Answer", media: [] }],
  answer: ["A"],
  explanation: "Explanation",
  stemMedia: [],
  explanationMedia: [],
  sourceTags: [],
  order: 1
});

describe("quiz content eligibility", () => {
  beforeEach(async () => {
    await db.questions.clear();
    await db.books.clear();
  });

  it("excludes cases and atlases from scored pools", async () => {
    await db.books.bulkPut([
      { id: "mcq", title: "MCQs", kind: "question-bank", quizEligible: true, sources: [], importedAt: 1, questionCount: 1, flashcardCount: 0, caseCount: 0 },
      { id: "cases", title: "Cases", kind: "case-book", quizEligible: false, sources: [], importedAt: 1, questionCount: 1, flashcardCount: 0, caseCount: 1 },
      { id: "atlas", title: "Atlas", kind: "visual-atlas", quizEligible: false, sources: [], importedAt: 1, questionCount: 1, flashcardCount: 0, caseCount: 0 }
    ]);
    await db.questions.bulkPut([question("q-mcq", "mcq"), question("q-case", "cases"), question("q-atlas", "atlas")]);
    expect((await buildPool(emptyFilter())).map((item) => item.id)).toEqual(["q-mcq"]);
  });
});
