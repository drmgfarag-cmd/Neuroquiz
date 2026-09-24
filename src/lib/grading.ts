/**
 * Answer handling for every question format.
 *
 * A selection is always a string[] (stored as-is in sessions):
 *   single / multi   ["C"] / ["A", "D"]           option keys
 *   truefalse        ["A=T", "B=F", …]            verdict per statement
 *   matching         ["A=iv", "B=x", …]           chosen list item per item
 */
import { plain } from "./markdown";
import type { Question, QuestionFormat } from "./types";

export function formatOf(q: Question): QuestionFormat {
  return q.format ?? (q.answer.length > 1 ? "multi" : "single");
}

/** Item-by-item formats: one answer per option, no option shuffling or letter shortcuts. */
export const isItemised = (q: Question) => {
  const f = formatOf(q);
  return f === "truefalse" || f === "matching";
};

export function pairs(selected: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of selected) {
    const i = s.indexOf("=");
    if (i > 0) out[s.slice(0, i)] = s.slice(i + 1);
  }
  return out;
}

const toPairs = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k}=${v}`);

/** Items that are graded, with the expected value for each. */
function expected(q: Question): Record<string, string> {
  const f = formatOf(q);
  if (f === "truefalse") return Object.fromEntries(Object.entries(q.verdicts ?? {}).map(([k, v]) => [k, v ? "T" : "F"]));
  if (f === "matching") return { ...(q.matches ?? {}) };
  return {};
}

/** Click handling: toggles an option (single/multi) or sets one item's value (truefalse/matching). */
export function applyChoice(q: Question, selected: string[], key: string, value?: string): string[] {
  const f = formatOf(q);
  if (f === "single") return [key];
  if (f === "multi") return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  const p = pairs(selected);
  if (value === undefined || value === "" || p[key] === value) delete p[key];
  else p[key] = value;
  return toPairs(p);
}

/** Whether the learner has given an answer for every part. */
export function isComplete(q: Question, selected: string[]): boolean {
  if (!isItemised(q)) return selected.length > 0;
  const p = pairs(selected);
  return Object.keys(expected(q)).every((k) => p[k] !== undefined);
}

export function isCorrect(q: Question, selected: string[]): boolean {
  if (isItemised(q)) {
    const exp = expected(q);
    const keys = Object.keys(exp);
    if (!keys.length) return false;
    const p = pairs(selected);
    return keys.every((k) => p[k] === exp[k]);
  }
  if (!q.answer.length) return false;
  const a = new Set(q.answer);
  return selected.length === a.size && selected.every((k) => a.has(k));
}

/** Items right out of items total (1/1 or 0/1 for single-answer questions). */
export function score(q: Question, selected: string[]): { right: number; total: number } {
  if (!isItemised(q)) return { right: isCorrect(q, selected) ? 1 : 0, total: 1 };
  const exp = expected(q);
  const p = pairs(selected);
  const keys = Object.keys(exp);
  return { right: keys.filter((k) => p[k] === exp[k]).length, total: keys.length };
}

/** The selection that would be fully correct (used for review/read mode). */
export function correctSelection(q: Question): string[] {
  return isItemised(q) ? toPairs(expected(q)) : q.answer;
}

export function choiceLabel(q: Question, key: string | undefined): string {
  if (!key) return "–";
  const c = q.choices?.find((x) => x.key === key);
  return c ? `${c.key}. ${c.text}`.replace(/\.\s*$/, "") : key;
}

/** Plain-text answer key, for the explanation header, flashcards and the AI tutor. */
export function answerSummary(q: Question, short = false): string {
  const f = formatOf(q);
  const label = (k: string) => {
    const o = q.options.find((x) => x.key === k);
    const t = o ? plain(o.text, short ? 60 : 120) : "";
    return t ? `${k}. ${t}` : k;
  };
  // items are shown as a, b, c … in the question
  if (f === "truefalse") return Object.entries(q.verdicts ?? {}).map(([k, v]) => (short ? `${k.toLowerCase()} ${v ? "T" : "F"}` : `${label(k)} — ${v ? "TRUE" : "FALSE"}`)).join(short ? " · " : "; ");
  if (f === "matching") return Object.entries(q.matches ?? {}).map(([k, v]) => (short ? `${k.toLowerCase()} ${v}` : `${label(k)} → ${choiceLabel(q, v)}`)).join(short ? " · " : "; ");
  if (!q.answer.length) return "not provided in source";
  return q.answer.map((k) => (short ? k : label(k))).join(short ? "," : "; ");
}

/** Short text of what the learner chose (results list, AI context). */
export function selectionSummary(q: Question, selected: string[]): string {
  if (!selected.length) return "–";
  if (!isItemised(q)) return selected.join(",");
  return Object.entries(pairs(selected))
    .map(([k, v]) => (formatOf(q) === "truefalse" ? `${k} ${v}` : `${k}→${v}`))
    .join(", ");
}
