import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { addProfile, resetProfileStats, switchProfile } from "../src/lib/profiles";
import { finishSession, getState, recordResult, setFlag, setNote } from "../src/lib/quiz";
import type { Question, QuizSession } from "../src/lib/types";

const q: Question = { id: "q1", bookId: "book", chapterId: "chapter", order: 0, number: "1", stem: "Stem", options: [{ key: "A", text: "yes", media: [] }, { key: "B", text: "no", media: [] }], answer: ["A"], explanation: "Reason", stemMedia: [], explanationMedia: [], sourceTags: [] };

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  vi.stubGlobal("location", { reload: vi.fn() });
  await db.questions.put(q);
});
afterEach(() => vi.unstubAllGlobals());

it("keeps study progress separate while sharing the book and resets guest data on exit", async () => {
  await recordResult(q, true);
  await setNote(q.id, "Main note");
  const second = await addProfile("Colleague");
  await switchProfile(second.id);
  expect((await getState(q.id)).timesSeen).toBe(0);
  expect(await db.questions.get(q.id)).toEqual(q);
  await recordResult(q, false);
  await switchProfile("guest");
  expect((await getState(q.id)).timesSeen).toBe(0);
  await recordResult(q, true);
  await switchProfile(second.id);
  expect((await getState(q.id)).timesSeen).toBe(1);
  expect((await getState(q.id)).lastCorrect).toBe(false);
  await switchProfile("guest");
  expect((await getState(q.id)).timesSeen).toBe(0);
  await switchProfile("default");
  expect((await getState(q.id)).timesSeen).toBe(1);
  expect((await getState(q.id)).note).toBe("Main note");
});

it("resets only current profile scores and history while retaining flags and notes", async () => {
  await recordResult(q, true);
  await setFlag(q.id, true);
  await setNote(q.id, "Review later");
  await db.sessions.put({ id: "old", mode: "exam", title: "Old", questionIds: [q.id], answers: {}, current: 0, startedAt: 1, updatedAt: 1, shuffleOptions: false });
  await resetProfileStats();
  const state = await getState(q.id);
  expect([state.timesSeen, state.timesCorrect, state.flagged, state.note]).toEqual([0, 0, true, "Review later"]);
  expect(await db.sessions.count()).toBe(0);
  expect(await db.tombstones.get("sessions:old")).toBeTruthy();
});

it("does not count an unfinished tutor answer until the session finishes", async () => {
  const session: QuizSession = { id: "pending", mode: "tutor", title: "Tutor", questionIds: [q.id], answers: { [q.id]: { questionId: q.id, selected: ["A"], correct: true, pendingResult: true, timeMs: 10 } }, current: 0, startedAt: 1, updatedAt: 1, shuffleOptions: false };
  expect((await getState(q.id)).timesSeen).toBe(0);
  await finishSession(session);
  expect((await getState(q.id)).timesSeen).toBe(1);
  expect((await db.sessions.get(session.id))?.answers[q.id].pendingResult).toBe(false);
});
