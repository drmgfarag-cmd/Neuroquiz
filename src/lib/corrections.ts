/**
 * Learner corrections to imported questions (OCR errors, wrong answer keys…).
 *
 * The corrected values are written into the question itself so every screen
 * shows them, and kept in the synced `corrections` table together with the
 * imported values, so they are re-applied after a book update and can be
 * reverted.
 */
import { db, deleteSynced } from "./db";
import type { Correction, EditableFields, Question } from "./types";

const FIELDS = ["stem", "options", "answer", "verdicts", "matches", "choices", "accepted", "explanation"] as const;

function pickFields(q: Question, keys: readonly (keyof EditableFields)[]): EditableFields {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = q[k] === undefined ? undefined : structuredClone(q[k]);
  return out as EditableFields;
}

/** Only the fields that differ from the question as it is now. */
export function diff(q: Question, next: EditableFields): EditableFields {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(q[k])) out[k] = next[k];
  return out as EditableFields;
}

export async function saveCorrection(q: Question, next: EditableFields): Promise<Question> {
  const existing = await db.corrections.get(q.id);
  const changed = { ...(existing?.changes ?? {}), ...diff(q, next) };
  const keys = Object.keys(changed) as (keyof EditableFields)[];
  if (!keys.length) return q;
  // what the book says, before any correction
  const original = { ...pickFields(q, keys), ...(existing?.original ?? {}) };
  const record: Correction = { questionId: q.id, changes: changed, original, updatedAt: Date.now() };
  const updated: Question = { ...q, ...changed, edited: true };
  await db.transaction("rw", db.corrections, db.questions, async () => {
    await db.corrections.put(record);
    await db.questions.put(updated);
  });
  return updated;
}

export async function revertCorrection(q: Question): Promise<Question> {
  const c = await db.corrections.get(q.id);
  const restored: Question = { ...q, ...(c?.original ?? {}), edited: false };
  await db.questions.put(restored);
  await deleteSynced("corrections", q.id);
  return restored;
}

/**
 * Apply saved corrections to their questions: after a (re-)import (then the
 * freshly imported values become the new "original") or after corrections
 * arrive from another device.
 */
export async function reapplyCorrections(questionIds: string[], freshImport = false): Promise<number> {
  const corrections = (await db.corrections.bulkGet(questionIds)).filter((c): c is Correction => !!c);
  if (!corrections.length) return 0;
  const qs = await db.questions.bulkGet(corrections.map((c) => c.questionId));
  const rows: Question[] = [];
  const records: Correction[] = [];
  corrections.forEach((c, i) => {
    const q = qs[i];
    if (!q) return;
    const keys = Object.keys(c.changes) as (keyof EditableFields)[];
    // only a freshly imported question holds the book's own values
    if (freshImport) records.push({ ...c, original: pickFields(q, keys) });
    rows.push({ ...q, ...c.changes, edited: true });
  });
  await db.transaction("rw", db.corrections, db.questions, async () => {
    await db.questions.bulkPut(rows);
    if (records.length) await db.corrections.bulkPut(records);
  });
  return rows.length;
}
