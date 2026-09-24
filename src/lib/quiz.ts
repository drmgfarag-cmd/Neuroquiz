import { db } from "./db";
import { canShuffle, formatOf, isCorrect } from "./grading";
import { newSrs, review } from "./srs";
import type { Confidence, Difficulty, Question, QuestionFormat, QuestionState, QuizMode, QuizSession, SessionAnswer } from "./types";
import { shuffle, uid } from "./util";

export type QuestionStatus = "all" | "unused" | "incorrect" | "flagged" | "due" | "correct" | "reported" | "unsure";

export interface PoolFilter {
  bookIds: string[];
  chapterIds: string[];
  topics: string[];
  subtopics: string[];
  tags: string[];
  status: QuestionStatus;
  difficulties: Difficulty[];
  highYieldOnly: boolean;
  /** Only questions whose stem or options show an image (radiology/figure practice). */
  withImagesOnly?: boolean;
  /** Only these question types (empty/undefined = all) */
  formats?: QuestionFormat[];
  ids?: string[];
}

export const emptyFilter = (): PoolFilter => ({
  bookIds: [],
  chapterIds: [],
  topics: [],
  subtopics: [],
  tags: [],
  status: "all",
  difficulties: [],
  highYieldOnly: false
});

export async function buildPool(f: PoolFilter): Promise<Question[]> {
  let qs: Question[];
  if (f.ids?.length) qs = (await db.questions.bulkGet(f.ids)).filter((q): q is Question => !!q);
  else if (f.chapterIds.length && f.bookIds.length) {
    const [chapters, books] = await Promise.all([
      db.questions.where("chapterId").anyOf(f.chapterIds).toArray(),
      db.questions.where("bookId").anyOf(f.bookIds).toArray()
    ]);
    qs = Array.from(new Map([...chapters, ...books].map((q) => [q.id, q])).values());
  } else if (f.chapterIds.length) qs = await db.questions.where("chapterId").anyOf(f.chapterIds).toArray();
  else if (f.bookIds.length) qs = await db.questions.where("bookId").anyOf(f.bookIds).toArray();
  else qs = await db.questions.toArray();

  if (f.withImagesOnly) qs = qs.filter(hasQuestionImage);
  if (f.formats?.length) qs = qs.filter((q) => f.formats!.includes(formatOf(q)));

  const needAnn = f.topics.length || f.subtopics.length || f.tags.length || f.difficulties.length || f.highYieldOnly;
  if (needAnn) {
    const anns = await db.annotations.bulkGet(qs.map((q) => q.id));
    qs = qs.filter((q, i) => {
      const a = anns[i];
      if (!a) return false;
      if (f.topics.length && !f.topics.includes(a.topic)) return false;
      if (f.subtopics.length && !f.subtopics.includes(a.subtopic)) return false;
      if (f.tags.length && !f.tags.some((t) => a.tags.includes(t) || q.sourceTags.includes(t))) return false;
      if (f.difficulties.length && (!a.difficulty || !f.difficulties.includes(a.difficulty))) return false;
      if (f.highYieldOnly && !a.highYield) return false;
      return true;
    });
  }

  if (f.status !== "all") {
    const states = await db.questionStates.bulkGet(qs.map((q) => q.id));
    const now = Date.now();
    qs = qs.filter((_, i) => {
      const s = states[i];
      switch (f.status) {
        case "unused":
          return !s || s.timesSeen === 0;
        case "incorrect":
          return !!s && s.lastCorrect === false;
        case "correct":
          return !!s && s.lastCorrect === true;
        case "flagged":
          return !!s?.flagged;
        case "reported":
          return !!s?.issue;
        case "unsure":
          // right, but only by guessing or unsure
          return !!s && s.lastCorrect === true && (s.lastConfidence ?? 3) < 3;
        case "due":
          return !!s && s.timesSeen > 0 && s.srs.due <= now;
      }
      return true;
    });
  }
  return qs.sort((a, b) => a.order - b.order);
}

/** Image visible before answering (stem or options); explanation images don't count. */
export function hasQuestionImage(q: Question): boolean {
  const inline = (t: string) => /!\[[^\]]*\]\(|<img\b/i.test(t);
  return q.stemMedia.length > 0 || inline(q.stem) || q.options.some((o) => o.media.length > 0 || inline(o.text));
}

export interface SessionOptions {
  mode: QuizMode;
  title: string;
  count: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  secondsPerQuestion: number;
  /** keep the pool's order as given (mock exams build their own order) */
  preserveOrder?: boolean;
  /** exact exam length in seconds (timed mode); default secondsPerQuestion × count */
  timeLimitSec?: number;
  /** hide options until the learner has an answer in mind */
  recall?: boolean;
  askConfidence?: boolean;
}

function shuffleUntilChanged(keys: string[]): string[] {
  let out = shuffle(keys);
  for (let i = 0; i < 5 && keys.length > 1 && out.every((k, j) => k === keys[j]); i++) out = shuffle(keys);
  return out;
}

/**
 * Linked questions (shared case, EMI list, parts of one question) as units that
 * move together and keep their internal order.
 */
export function toUnits(pool: Question[], sortByOrder = true): Question[][] {
  const units: Question[][] = [];
  const byGroup = new Map<string, Question[]>();
  for (const q of sortByOrder ? pool.slice().sort((a, b) => a.order - b.order) : pool) {
    if (!q.groupId) units.push([q]);
    else if (byGroup.has(q.groupId)) byGroup.get(q.groupId)!.push(q);
    else {
      const unit = [q];
      byGroup.set(q.groupId, unit);
      units.push(unit);
    }
  }
  return units;
}

export async function createSession(pool: Question[], o: SessionOptions): Promise<QuizSession> {
  // linked questions move as one unit and aren't split by the count limit
  const units = toUnits(pool, !o.preserveOrder);
  const chosen: Question[] = [];
  for (const unit of o.shuffleQuestions && !o.preserveOrder ? shuffle(units) : units) {
    if (o.count > 0 && chosen.length >= o.count) break;
    chosen.push(...unit);
  }
  const now = Date.now();
  const s: QuizSession = {
    id: uid("s_"),
    mode: o.mode,
    title: o.title,
    questionIds: chosen.map((q) => q.id),
    answers: {},
    current: 0,
    startedAt: now,
    timeLimitSec: o.mode === "timed" ? (o.timeLimitSec ?? Math.round(chosen.length * o.secondsPerQuestion)) : undefined,
    shuffleOptions: o.shuffleOptions,
    // item-by-item questions keep their order (labels often refer to a diagram);
    // ordering questions always start shuffled
    optionOrder: Object.fromEntries(
      chosen.filter((q) => (o.shuffleOptions && canShuffle(q)) || formatOf(q) === "ordering").map((q) => [q.id, shuffleUntilChanged(q.options.map((x) => x.key))])
    ),
    ...(o.recall ? { recall: true } : {}),
    ...(o.askConfidence ? { askConfidence: true } : {}),
    updatedAt: now
  };
  await db.sessions.put(s);
  return s;
}

export { isCorrect } from "./grading";

function freshState(questionId: string): QuestionState {
  return { questionId, timesSeen: 0, timesCorrect: 0, flagged: false, note: "", srs: newSrs(), updatedAt: Date.now() };
}

export async function getState(questionId: string): Promise<QuestionState> {
  return (await db.questionStates.get(questionId)) ?? freshState(questionId);
}

/** Persist a graded answer into the long-term per-question state (+ revision schedule). */
export async function recordResult(q: Question, correct: boolean, confidence?: Confidence): Promise<void> {
  const s = await getState(q.id);
  const now = Date.now();
  // a lucky guess comes back sooner
  const grade = !correct ? "again" : confidence === 1 ? "hard" : "good";
  await db.questionStates.put({
    ...s,
    timesSeen: s.timesSeen + 1,
    timesCorrect: s.timesCorrect + (correct ? 1 : 0),
    lastCorrect: correct,
    lastSeenAt: now,
    lastConfidence: confidence,
    srs: review(s.srs, grade, now),
    updatedAt: now
  });
}

export async function setFlag(questionId: string, flagged: boolean): Promise<void> {
  const s = await getState(questionId);
  await db.questionStates.put({ ...s, flagged, updatedAt: Date.now() });
}

export async function setIssue(questionId: string, issue: string): Promise<void> {
  const s = await getState(questionId);
  await db.questionStates.put({ ...s, issue: issue.trim() || undefined, updatedAt: Date.now() });
}

export async function setNote(questionId: string, note: string): Promise<void> {
  const s = await getState(questionId);
  await db.questionStates.put({ ...s, note, updatedAt: Date.now() });
}

export async function saveSession(s: QuizSession): Promise<void> {
  await db.sessions.put({ ...s, updatedAt: Date.now() });
}

/** Grades all answers of an exam/timed session and writes per-question results. */
export async function finishSession(s: QuizSession): Promise<QuizSession> {
  const qs = (await db.questions.bulkGet(s.questionIds)).filter((q): q is Question => !!q);
  const answers: Record<string, SessionAnswer> = { ...s.answers };
  let score = 0;
  for (const q of qs) {
    const a = answers[q.id];
    if (!a || !a.selected.length) continue;
    const already = a.correct !== undefined;
    const c = isCorrect(q, a.selected);
    answers[q.id] = { ...a, correct: c };
    if (c) score++;
    if (!already && s.mode !== "review") await recordResult(q, c, a.confidence);
  }
  const done: QuizSession = { ...s, answers, score, finishedAt: Date.now(), updatedAt: Date.now() };
  await db.sessions.put(done);
  return done;
}
