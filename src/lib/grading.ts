/**
 * Answer handling for every question format.
 *
 * A selection is always a string[] (stored as-is in sessions):
 *   single / multi   ["C"] / ["A", "D"]           option keys
 *   truefalse        ["A=T", "B=F", …]            verdict per statement
 *   matching         ["A=iv", "B=x", …]           chosen list item per item
 *   ordering         ["C", "A", "D", "B"]          every option key, in the learner's order
 *   text             ["typed answer"]
 *   hotspot          ["0.412,0.338"]               click position as fractions of the image
 *   sct              ["+1"]                        option key (−2…+2 scale)
 */
import { plain } from "./markdown";
import type { HotspotRegion, Question, QuestionFormat } from "./types";

/** Standard script-concordance scale, used when a question gives no options of its own. */
export const SCT_SCALE = [
  { key: "-2", text: "Much less likely / strongly contraindicated" },
  { key: "-1", text: "Less likely / less useful" },
  { key: "0", text: "Neither more nor less likely" },
  { key: "+1", text: "More likely / more useful" },
  { key: "+2", text: "Much more likely / strongly indicated" }
];

const norm = (t: string) =>
  plain(t, 400)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Typed answer vs accepted answers: ignores case, punctuation and articles; allows a typo in longer words. */
export function textMatches(typed: string, accepted: string[]): boolean {
  const t = norm(typed);
  if (!t) return false;
  return accepted.some((a) => {
    const n = norm(a);
    if (!n) return false;
    if (n === t) return true;
    const allowed = n.length >= 12 ? 2 : n.length >= 5 ? 1 : 0;
    return allowed > 0 && editDistance(n, t) <= allowed;
  });
}

export function inRegion(x: number, y: number, r: HotspotRegion): boolean {
  if ("r" in r) return Math.hypot(x - r.x, y - r.y) <= r.r;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function parsePoint(sel: string | undefined): [number, number] | null {
  const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(sel ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** SCT credit for one answer: votes for it / votes for the modal answer. */
function sctCredit(q: Question, key: string | undefined): number {
  const panel = q.panel ?? Object.fromEntries(q.answer.map((k) => [k, 1]));
  const max = Math.max(0, ...Object.values(panel));
  return key && max ? (panel[key] ?? 0) / max : 0;
}

export function formatOf(q: Question): QuestionFormat {
  return q.format ?? (q.answer.length > 1 ? "multi" : "single");
}

/** Item-by-item formats: one answer per option, no option shuffling or letter shortcuts. */
export const isItemised = (q: Question) => {
  const f = formatOf(q);
  return f === "truefalse" || f === "matching";
};

/** Options can be shown in a random order (the letters are relabelled). */
export const canShuffle = (q: Question) => {
  const f = formatOf(q);
  return f === "single" || f === "multi";
};

/** Answered by picking one or more lettered options (keyboard shortcuts 1–8 / A–H). */
export const pickable = (q: Question) => canShuffle(q) || formatOf(q) === "sct";

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
  if (f === "single" || f === "sct") return [key];
  // the UI hands over the whole answer: the typed text, "x,y" or the order "C,A,B"
  if (f === "text" || f === "hotspot") return value ? [value] : [];
  if (f === "ordering") return value ? value.split(",") : [];
  if (f === "multi") return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  const p = pairs(selected);
  if (value === undefined || value === "" || p[key] === value) delete p[key];
  else p[key] = value;
  return toPairs(p);
}

/** Whether the learner has given an answer for every part. */
export function isComplete(q: Question, selected: string[]): boolean {
  const f = formatOf(q);
  if (f === "ordering") return selected.length === q.options.length;
  if (f === "text") return !!selected[0]?.trim();
  if (f === "hotspot") return !!parsePoint(selected[0]);
  if (!isItemised(q)) return selected.length > 0;
  const p = pairs(selected);
  return Object.keys(expected(q)).every((k) => p[k] !== undefined);
}

export function isCorrect(q: Question, selected: string[]): boolean {
  const f = formatOf(q);
  if (f === "ordering") return q.answer.length > 0 && selected.length === q.answer.length && selected.every((k, i) => k === q.answer[i]);
  if (f === "text") return textMatches(selected[0] ?? "", q.accepted ?? []);
  if (f === "hotspot") {
    const p = parsePoint(selected[0]);
    return !!p && (q.regions ?? []).some((r) => inRegion(p[0], p[1], r));
  }
  if (f === "sct") return selected.length === 1 && sctCredit(q, selected[0]) === 1;
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
  const f = formatOf(q);
  // items in the right position
  if (f === "ordering") return { right: q.answer.filter((k, i) => selected[i] === k).length, total: q.answer.length };
  // panel credit (0–1)
  if (f === "sct") return { right: sctCredit(q, selected[0]), total: 1 };
  if (!isItemised(q)) return { right: isCorrect(q, selected) ? 1 : 0, total: 1 };
  const exp = expected(q);
  const p = pairs(selected);
  const keys = Object.keys(exp);
  return { right: keys.filter((k) => p[k] === exp[k]).length, total: keys.length };
}

/** The selection that would be fully correct (used for review/read mode). */
export function correctSelection(q: Question): string[] {
  const f = formatOf(q);
  if (f === "text") return [q.accepted?.[0] ?? ""];
  if (f === "hotspot") {
    const r = q.regions?.[0];
    return r ? ["r" in r ? `${r.x},${r.y}` : `${r.x + r.w / 2},${r.y + r.h / 2}`] : [];
  }
  if (f === "sct") {
    const panel = q.panel ?? {};
    const best = Object.entries(panel).sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? [best] : q.answer.slice(0, 1);
  }
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
  if (f === "ordering") return q.answer.map((k) => (short ? k : label(k))).join(short ? " → " : " → ");
  if (f === "text") return (q.accepted ?? []).slice(0, short ? 1 : 4).join(" / ") || "not provided in source";
  if (f === "hotspot") return (q.regions ?? []).map((r) => r.label).filter(Boolean).join(", ") || "the marked area";
  if (f === "sct") {
    const best = correctSelection(q)[0];
    return best ? label(best) : "not provided in source";
  }
  if (!q.answer.length) return "not provided in source";
  return q.answer.map((k) => (short ? k : label(k))).join(short ? "," : "; ");
}

/** Short text of what the learner chose (results list, AI context). */
export function selectionSummary(q: Question, selected: string[]): string {
  if (!selected.length) return "–";
  const f = formatOf(q);
  if (f === "ordering") return selected.join("→");
  if (f === "text") return `“${selected[0]}”`;
  if (f === "hotspot") return isCorrect(q, selected) ? "on target" : "off target";
  if (!isItemised(q)) return selected.join(",");
  return Object.entries(pairs(selected))
    .map(([k, v]) => (formatOf(q) === "truefalse" ? `${k} ${v}` : `${k}→${v}`))
    .join(", ");
}
