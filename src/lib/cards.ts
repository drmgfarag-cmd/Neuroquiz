import { aiFlashcards } from "../ai/claude";
import { questionText } from "../ai/tagger";
import { db } from "./db";
import type { Flashcard, Question } from "./types";
import { hash } from "./util";

/** Plain conversion: stem on the front, correct answer + explanation on the back. */
export function questionToCard(q: Question): Flashcard {
  const correct = q.options.filter((o) => q.answer.includes(o.key));
  const now = Date.now();
  return {
    id: `gen:${q.id}`,
    bookId: q.bookId,
    chapterId: q.chapterId,
    questionId: q.id,
    front: q.stem,
    back: `**${correct.map((o) => `${o.key}. ${o.text}`).join("; ") || q.answer.join(", ")}**\n\n${q.explanation}`,
    frontMedia: q.stemMedia,
    backMedia: [...correct.flatMap((o) => o.media), ...q.explanationMedia],
    sourceTags: q.sourceTags,
    origin: "generated",
    createdAt: now,
    updatedAt: now
  };
}

export async function addQuestionCard(q: Question): Promise<void> {
  await db.userFlashcards.put(questionToCard(q));
}

export async function addAiCards(q: Question, count = 3): Promise<number> {
  const cards = await aiFlashcards(questionText(q), count);
  const now = Date.now();
  await db.userFlashcards.bulkPut(
    cards.map((c) => ({
      id: `ai:${q.id}:${hash(c.front)}`,
      bookId: q.bookId,
      chapterId: q.chapterId,
      questionId: q.id,
      front: c.front,
      back: c.back,
      frontMedia: [],
      backMedia: [],
      sourceTags: q.sourceTags,
      origin: "generated" as const,
      createdAt: now,
      updatedAt: now
    }))
  );
  return cards.length;
}
