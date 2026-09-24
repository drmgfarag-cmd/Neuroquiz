import { imageRole } from "../import/normalize";
import { formatOf } from "./grading";
import type { Question } from "./types";
import { normaliseFileName, stripExt } from "./util";

/** A question without a defensible key remains readable and editable, but must not affect a score. */
export function unscorableReason(q: Question): string | null {
  const f = formatOf(q);
  const keys = new Set(q.options.map((o) => o.key));
  if (f === "text") return q.accepted?.some((a) => a.trim()) ? null : "No accepted answer";
  if (f === "hotspot") return q.regions?.length ? null : "No answer region";
  if (f === "matching") {
    const choices = new Set(q.choices?.map((c) => c.key) ?? []);
    return q.options.length && q.options.every((o) => q.matches?.[o.key] && choices.has(q.matches[o.key])) ? null : "Incomplete matching key";
  }
  if (f === "truefalse") return q.options.length && q.options.every((o) => typeof q.verdicts?.[o.key] === "boolean") ? null : "Incomplete statement key";
  if (f === "ordering") return q.options.length && q.answer.length === q.options.length && new Set(q.answer).size === keys.size && q.answer.every((k) => keys.has(k)) ? null : "Incomplete order";
  if (f === "sct") return q.answer.length && keys.has(q.answer[0]) ? null : "No panel answer";
  return q.answer.length && new Set(q.answer).size === q.answer.length && q.answer.every((k) => keys.has(k)) ? null : "No valid answer key";
}

const refs = (q: Question) => [
  ...q.stemMedia.map((m) => m.file), ...q.explanationMedia.map((m) => m.file),
  ...q.options.flatMap((o) => o.media.map((m) => m.file)),
  ...[q.stem, q.explanation, ...q.options.map((o) => o.text)].flatMap((text) => [
    ...Array.from(text.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g), (m) => m[1]),
    ...Array.from(text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (m) => m[1])
  ])
];

export interface BookQuality {
  unscorable: Question[];
  noExplanation: Question[];
  missingImages: string[];
  unreferencedImages: string[];
  conflictingImageRoles: string[];
}

/** Inspect media keys only; callers need not load image blobs into memory. */
export function auditBook(questions: Question[], mediaNames: string[]): BookQuality {
  const names = new Set(mediaNames.map(normaliseFileName));
  const bases = new Set([...names].map(stripExt));
  const referenced = new Set<string>();
  const missing = new Set<string>();
  const conflicting = new Set<string>();
  for (const q of questions) {
    for (const f of refs(q)) {
      if (/^(?:data:|https?:|blob:)/i.test(f)) continue;
      const n = normaliseFileName(f);
      referenced.add(stripExt(n));
      if (!names.has(n) && !bases.has(stripExt(n))) missing.add(`${q.number}: ${f}`);
    }
    for (const m of q.stemMedia) if (imageRole(m.file) === "answer") conflicting.add(`${q.number}: answer image shown with question: ${m.file}`);
  }
  return {
    unscorable: questions.filter((q) => unscorableReason(q)),
    noExplanation: questions.filter((q) => !q.explanation.trim()),
    missingImages: [...missing],
    unreferencedImages: mediaNames.filter((n) => !referenced.has(stripExt(normaliseFileName(n)))),
    conflictingImageRoles: [...conflicting]
  };
}
