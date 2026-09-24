import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { addProfile, resetProfileStats, switchProfile } from "../src/lib/profiles";
import { finishSession, getState, recordResult, saveSession, setFlag, setNote } from "../src/lib/quiz";
import { carryProgress } from "../src/import/importer";
import { newSrs } from "../src/lib/srs";
import { questionToCard } from "../src/lib/cards";
import { collectChanges, applyChanges } from "../src/lib/sync";
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
  await db.sessions.put(session);
  expect((await getState(q.id)).timesSeen).toBe(0);
  await finishSession(session);
  expect((await getState(q.id)).timesSeen).toBe(1);
  expect((await db.sessions.get(session.id))?.answers[q.id].pendingResult).toBe(false);
});

it("does not resurrect canceled tests or overwrite finished results with a late autosave", async () => {
  const session: QuizSession = { id: "race", mode: "exam", title: "Race", questionIds: [q.id], answers: { [q.id]: { questionId: q.id, selected: ["A"], timeMs: 10 } }, current: 0, startedAt: 1, updatedAt: 1, shuffleOptions: false };
  await db.sessions.put(session);
  const finished = await finishSession(session);
  await saveSession(session);
  expect((await db.sessions.get(session.id))?.finishedAt).toBe(finished.finishedAt);
  expect((await getState(q.id)).timesSeen).toBe(1);
  await finishSession(session);
  expect((await getState(q.id)).timesSeen).toBe(1);
  await db.sessions.delete(session.id);
  await saveSession(session);
  expect(await db.sessions.get(session.id)).toBeUndefined();
  await expect(finishSession(session)).rejects.toThrow("discarded");
});

it("moves corrected question progress, sessions and generated cards for inactive profiles", async () => {
  const old = { ...q, id: "old", sourceId: "Q1" };
  const corrected = { ...q, id: "new", sourceId: "Q1", options: [{ key: "A", text: "no", media: [] }, { key: "B", text: "Hemangioblastoma", media: [] }], answer: ["B"] };
  await db.questions.put(old);
  const second = await addProfile("Second");
  await switchProfile(second.id);
  await recordResult(old, true);
  await db.userFlashcards.put(questionToCard(old));
  await db.cardStates.put({ cardId: `gen:${old.id}`, srs: newSrs(), suspended: false, updatedAt: 1 });
  const session: QuizSession = { id: "earlier", mode: "exam", title: "Earlier", questionIds: [old.id], answers: { [old.id]: { questionId: old.id, selected: ["A"], timeMs: 1 } }, current: 0, startedAt: 1, updatedAt: 1, shuffleOptions: false };
  await db.sessions.put(session);
  await switchProfile("default");
  await carryProgress([{ id: old.id, sourceId: "Q1", key: "Chapter|Q1" }], [{ ...corrected, chapterId: "ch" }], [{ id: "ch", bookId: "book", title: "Chapter", order: 0 }]);
  await switchProfile(second.id);
  expect((await db.questionStates.get(corrected.id))?.timesSeen).toBe(1);
  expect((await db.sessions.get(session.id))?.questionIds).toEqual([corrected.id]);
  expect((await db.userFlashcards.get(`gen:${corrected.id}`))?.back).toContain("Hemangioblastoma");
  expect(await db.userFlashcards.get(`gen:${old.id}`)).toBeUndefined();
  expect(await db.cardStates.get(`gen:${corrected.id}`)).toBeTruthy();
});

it("rejects progress sync while Guest is active", async () => {
  await switchProfile("guest");
  await expect(collectChanges(-1)).rejects.toThrow("My profile");
  await expect(applyChanges([])).rejects.toThrow("Profile changed");
});

it("preserves flags and notes when a grade is saved at the same time", async () => {
  await Promise.all([recordResult(q, true), setFlag(q.id, true), setNote(q.id, "Clinical review")]);
  const state = await getState(q.id);
  expect([state.timesSeen, state.timesCorrect, state.flagged, state.note]).toEqual([1, 1, true, "Clinical review"]);
});
