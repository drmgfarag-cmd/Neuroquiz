/**
 * Turns the many shapes of "extracted book" JSON into one internal model.
 *
 * Supported shapes (all can be mixed and nested):
 *   [ question, question, ... ]
 *   { "title": "...", "questions": [...] }
 *   { "book": "...", "chapters": [ { "title": "...", "questions": [...] } ] }
 *   { "chapter": "...", "questions": [...], "flashcards": [...], "cases": [...] }
 *   [ { "chapter": "Tumours", "question": "...", ... } ]   (grouped by chapter field)
 *
 * Field names are matched case-insensitively against lists of common aliases
 * (question/stem/text, options/choices, answer/correct_answer, ...).
 */
import type { Annotation, CaseStage, MatchChoice, MediaRef, Option, QuestionFormat } from "../lib/types";

/** Tags carried inside NeuroQuiz's own book export (restored on import). */
export type ParsedAnnotation = Omit<Annotation, "id" | "kind">;
import { IMAGE_EXT } from "../lib/util";

type Json = unknown;
type Obj = Record<string, Json>;

export interface NormalizeOptions {
  /** How a bare number answer is interpreted (1 means 1 = first option). */
  numericAnswerBase: 0 | 1;
  fileName: string;
}

export interface ParsedQuestion {
  number: string;
  stem: string;
  options: Option[];
  answer: string[];
  explanation: string;
  stemMedia: MediaRef[];
  explanationMedia: MediaRef[];
  sourceTags: string[];
  annotation?: ParsedAnnotation;
  format?: QuestionFormat;
  verdicts?: Record<string, boolean>;
  choices?: MatchChoice[];
  matches?: Record<string, string>;
  /** questions sharing a case, an EMI list or a parent question (kept together when shuffling) */
  groupId?: string;
  /** EMI set the question belongs to in the source (merged into one matching question) */
  emiSet?: string;
  /** the source's own question id and section – used to match source-level flags */
  sourceId?: string;
  section?: string;
  /** warning from the source about this question (unresolved mismatch, needs review…) */
  sourceWarning?: string;
}

export interface ParsedFlashcard {
  front: string;
  back: string;
  frontMedia: MediaRef[];
  backMedia: MediaRef[];
  sourceTags: string[];
  annotation?: ParsedAnnotation;
}

export interface ParsedCase {
  title: string;
  presentation: string;
  presentationMedia: MediaRef[];
  stages: CaseStage[];
  discussion: string;
  sourceTags: string[];
  annotation?: ParsedAnnotation;
}

export interface ParsedChapter {
  title: string;
  /** chapter number from the source (chapter_id "03", "s01" …) – orders chapters split across files */
  sortKey?: number;
  questions: ParsedQuestion[];
  flashcards: ParsedFlashcard[];
  cases: ParsedCase[];
}

export interface ParsedFile {
  bookTitle?: string;
  /** stable id from the source (book_id) – keeps progress when a book is renamed */
  bookId?: string;
  chapters: ParsedChapter[];
  warnings: string[];
}

// --------------------------------------------------------------------------
// Field aliases
// --------------------------------------------------------------------------

const F = {
  stem: ["question", "stem", "question_text", "questiontext", "q", "prompt", "text", "body", "vignette", "title"],
  options: ["options", "choices", "answers", "alternatives", "answer_options", "answeroptions", "responses", "distractors"],
  answer: ["correct_answer", "correctanswer", "answer", "correct", "correct_option", "correctoption", "key", "answer_key", "right_answer", "solution", "correct_choice", "correct_answers"],
  answerIndex: ["answer_index", "answerindex", "correct_index", "correctindex"],
  explanation: ["explanation", "explanations", "rationale", "discussion", "answer_explanation", "commentary", "reasoning", "feedback", "solution_text", "notes", "comment"],
  /** images that belong to the question itself (checked first) */
  questionMedia: ["stem_media", "question_images", "question_image", "question_figures", "question_media"],
  /** generic image fields – may mix question and answer images */
  stemMedia: ["images", "image", "figures", "figure", "media", "img", "imgs", "pictures", "attachments", "tables_images", "diagram", "diagrams", "table_image", "table_images"],
  explanationMedia: ["explanation_images", "explanation_image", "answer_images", "answer_image", "explanation_figures", "rationale_images", "solution_images", "explanation_media", "answer_media"],
  tables: ["tables", "table", "question_table_markdown", "question_tables"],
  explanationTables: ["explanation_tables", "explanation_table", "answer_tables", "answer_table_markdown"],
  number: ["printed_number", "number", "question_number", "questionnumber", "qno", "q_no", "no", "num", "id", "qid", "index"],
  tags: ["tags", "keywords", "topic", "topics", "category", "categories", "subject", "subtopic", "section"],
  chapterName: ["chapter", "chapter_title", "chaptertitle", "chapter_name", "section_title"],
  title: ["title", "name", "chapter_name", "chapter", "chapter_title", "heading", "section"],
  bookTitle: ["book", "book_title", "booktitle", "book_name", "source", "textbook"],
  chapters: ["chapters", "sections", "units"],
  questions: ["questions", "mcqs", "mcq", "items", "qbank", "question_bank", "questionbank"],
  flashcards: ["flashcards", "flash_cards", "cards", "flashcard"],
  cases: ["cases", "case_scenarios", "casescenarios", "clinical_cases", "scenarios", "case_studies"],
  front: ["front", "term", "prompt", "question", "q", "cue"],
  back: ["back", "definition", "answer", "a", "response"],
  keyMap: ["answer_key_map", "key_map", "matching_key", "matches"],
  verdicts: ["option_verdicts", "verdicts", "statement_verdicts", "true_false"],
  choiceList: ["choice_list", "choices_list", "answer_list", "shared_options", "emi_options", "option_list"],
  parts: ["parts", "sub_questions", "subquestions"],
  optKey: ["key", "label", "letter", "option", "id", "choice"],
  optText: ["text", "content", "value", "option_text", "answer", "body", "choice_text", "label_text", "description"],
  optCorrect: ["correct", "is_correct", "iscorrect", "isanswer", "is_answer", "right"],
  optExplanation: ["explanation", "rationale", "feedback", "reason"],
  casePresentation: ["presentation", "history", "scenario", "case", "vignette", "description", "stem", "clinical_presentation", "text"],
  caseStages: ["stages", "steps", "parts", "questions", "sections", "progression"],
  caseDiscussion: ["discussion", "summary", "teaching_points", "learning_points", "key_points", "explanation", "commentary", "take_home"]
} as const;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isObj(v: Json): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Case/space/underscore-insensitive lookup. Returns first non-empty alias. */
export function pick(o: Obj, aliases: readonly string[]): Json {
  const index = new Map<string, string>();
  for (const k of Object.keys(o)) index.set(k.toLowerCase().replace(/[\s-]/g, "_"), k);
  for (const a of aliases) {
    const k = index.get(a) ?? index.get(a.replace(/_/g, ""));
    if (k !== undefined) {
      const v = o[k];
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (isObj(v) && Object.keys(v).length === 0) continue;
      return v;
    }
  }
  return undefined;
}

function has(o: Obj, aliases: readonly string[]): boolean {
  return pick(o, aliases) !== undefined;
}

/** True when any alias is present as a key, even if its value is empty. */
function hasKey(o: Obj, aliases: readonly string[]): boolean {
  const keys = new Set(Object.keys(o).map((k) => k.toLowerCase().replace(/[\s-]/g, "_")));
  return aliases.some((a) => keys.has(a) || keys.has(a.replace(/_/g, "")));
}

const LIST_LINE = /^\s*(?:[-*•]\s|\d{1,3}[.)]\s|[a-z][.)]\s|[ivx]{1,5}[.)]\s|\(?[a-z]\)\s|\||#|>|part\s+[a-z0-9]\b|!\[)/i;

/**
 * Repairs text copied from PDFs/OCR: joins hard-wrapped lines into
 * paragraphs and re-joins sentences split by a page break, while keeping
 * lists, tables, headings and "a. TRUE —" style statements on their own lines.
 */
export function reflow(text: string): string {
  // soft hyphens left by PDF line breaks ("blad\u00ad der" → "bladder")
  if (text) text = text.replace(/\u00ad\s*/g, "");
  if (!text || !text.includes("\n")) return text;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const paras: string[][] = [];
  let cur: string[] = [];
  let blank = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      blank = true;
      continue;
    }
    const prev = cur[cur.length - 1];
    // a blank line followed by a lower-case continuation is a page break, not a paragraph
    const continuation = blank && prev !== undefined && /^[a-z(]/.test(line.trim()) && !LIST_LINE.test(line) && !/[.:!?]["”’)]?$/.test(prev);
    if (blank && !continuation && cur.length) {
      paras.push(cur);
      cur = [];
    }
    blank = false;
    cur.push(line);
  }
  if (cur.length) paras.push(cur);
  return paras
    .map((p) =>
      p.reduce((acc, line, i) => {
        if (i === 0) return line.trim();
        if (LIST_LINE.test(line) || /^\s*\|/.test(p[i - 1])) return `${acc}\n${line.trim()}`;
        // keep hyphenated words together ("grey-\nwhite")
        return acc.endsWith("-") ? acc + line.trim() : `${acc} ${line.trim()}`;
      }, "")
    )
    .join("\n\n");
}

/** Flatten strings/arrays/objects to readable text. */
export function toText(v: Json): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join("\n\n");
  if (isObj(v)) {
    const t = pick(v, ["text", "content", "body", "value", "html", "markdown"]);
    if (t !== undefined) return toText(t);
    return Object.entries(v)
      .filter(([, x]) => typeof x === "string" || typeof x === "number")
      .map(([k, x]) => `**${k}:** ${x}`)
      .join("\n");
  }
  return "";
}

function looksLikeFile(s: string): boolean {
  return IMAGE_EXT.test(s.trim()) || /^data:image\//.test(s.trim());
}

/** Collect media references from a field value (string, list, object). */
export function toMedia(v: Json): MediaRef[] {
  if (v === undefined || v === null || v === "") return [];
  if (typeof v === "string") {
    // "fig1.png, fig2.png" or "fig1.png;fig2.png"
    return v
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((file) => ({ file }));
  }
  if (Array.isArray(v)) return v.flatMap(toMedia);
  if (isObj(v)) {
    const file = pick(v, ["file", "filename", "file_name", "src", "path", "name", "url", "image", "href", "ref"]);
    const caption = pick(v, ["caption", "title", "label", "alt", "description", "legend"]);
    if (typeof file === "string") return [{ file: file.trim(), caption: caption ? toText(caption) : undefined }];
    return Object.values(v).flatMap((x) => (typeof x === "string" && looksLikeFile(x) ? [{ file: x }] : []));
  }
  return [];
}

/** Render a JSON table (2D array, list of row objects, html or markdown) to markdown/html text. */
export function tableToText(v: Json): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length && v.every(Array.isArray)) {
      const rows = v as Json[][];
      const head = rows[0].map(toText);
      const body = rows.slice(1).map((r) => r.map(toText));
      return mdTable(head, body);
    }
    if (v.length && v.every(isObj)) {
      const objs = v as Obj[];
      // [{title, rows}] – several tables
      if (objs.every((o) => has(o, ["rows", "data", "cells", "html", "markdown"]))) return objs.map(tableToText).join("\n\n");
      const cols = Array.from(new Set(objs.flatMap((o) => Object.keys(o))));
      return mdTable(cols, objs.map((o) => cols.map((c) => toText(o[c]))));
    }
    return v.map(tableToText).join("\n\n");
  }
  if (isObj(v)) {
    const title = toText(pick(v, ["title", "caption", "name"]));
    const html = pick(v, ["html"]);
    const md = pick(v, ["markdown", "md"]);
    const rows = pick(v, ["rows", "data", "cells"]);
    const headers = pick(v, ["headers", "header", "columns"]);
    let body = "";
    if (typeof html === "string") body = html;
    else if (typeof md === "string") body = md;
    else if (Array.isArray(rows)) {
      body = Array.isArray(headers)
        ? mdTable((headers as Json[]).map(toText), (rows as Json[]).map((r) => (Array.isArray(r) ? r.map(toText) : [toText(r)])))
        : tableToText(rows);
    }
    const img = pick(v, ["image", "file", "src"]);
    if (!body && typeof img === "string") body = `![${title}](${img})`;
    return title ? `**${title}**\n\n${body}` : body;
  }
  return "";
}

function mdTable(head: string[], body: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const lines = [`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const r of body) lines.push(`| ${head.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`);
  return lines.join("\n");
}

/**
 * Converts textual image references into markdown images so the renderer can
 * resolve them: "[Figure: fig3.png]", "{{fig3.png}}", "<<fig3.png>>", or a bare
 * "fig3.png" token.
 */
export function linkInlineImages(text: string): string {
  if (!text) return text;
  const file = String.raw`[\w\-./%() ]*?\.(?:png|jpe?g|gif|webp|svg|bmp|avif|tiff?)`;
  let out = text
    .replace(new RegExp(String.raw`\[(?:image|figure|fig|img|table|diagram)\s*[:\-]?\s*(${file})\s*\]`, "gi"), "![]($1)")
    .replace(new RegExp(String.raw`\{\{\s*(${file})\s*\}\}`, "gi"), "![]($1)")
    .replace(new RegExp(String.raw`<<\s*(${file})\s*>>`, "gi"), "![]($1)");
  // bare tokens not already in markdown/html image syntax
  out = out.replace(
    new RegExp(String.raw`(^|[\s(])((?:[\w\-]+/)*[\w\-.%]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))(?=$|[\s),.;:])`, "gim"),
    (m, pre: string, f: string, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 2), offset + pre.length);
      if (before.endsWith("](") || /src=["']?$/.test(whole.slice(Math.max(0, offset - 6), offset + pre.length))) return m;
      return `${pre}![](${f})`;
    }
  );
  return out;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LABEL_RE = /^\s*(?:\(?([A-Za-z]|\d{1,2})[).:\]]|option\s+([A-Za-z])\s*[:.)-])\s+/;

function parseOptions(q: Obj): { options: Option[]; flagged: string[]; optionExplanations: string[]; stemTail: string } {
  let stemTail = "";
  const flagged: string[] = [];
  const optionExplanations: string[] = [];
  let raw = pick(q, F.options);

  // answers: [...] can also be the answer list for a flashcard – only accept arrays/maps here.
  if (raw !== undefined && !Array.isArray(raw) && !isObj(raw)) raw = undefined;

  // Separate fields: option_a / optionA / A / choice_a ...
  if (raw === undefined) {
    const map: Obj = {};
    for (const [k, v] of Object.entries(q)) {
      const m = /^(?:option|opt|choice|answer)?[_\s-]?([a-h])$/i.exec(k) ?? /^(?:option|opt|choice)[_\s-]?([1-8])$/i.exec(k);
      if (m && (typeof v === "string" || typeof v === "number" || isObj(v))) {
        const key = /\d/.test(m[1]) ? LETTERS[Number(m[1]) - 1] : m[1].toUpperCase();
        map[key] = v;
      }
    }
    if (Object.keys(map).length >= 2) raw = map;
  }

  const options: Option[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((o, i) => {
      if (isObj(o)) {
        const keyRaw = pick(o, F.optKey);
        const textRaw = pick(o, F.optText);
        let text = toText(textRaw ?? "");
        let key = typeof keyRaw === "string" && keyRaw.trim().length <= 3 ? keyRaw.trim().replace(/[).:]$/, "").toUpperCase() : LETTERS[i];
        if (!text && typeof keyRaw === "string" && keyRaw.length > 3) text = keyRaw;
        const lab = LABEL_RE.exec(text);
        if (lab && !(typeof keyRaw === "string" && keyRaw.trim().length <= 3)) {
          key = (lab[1] ?? lab[2]).toUpperCase();
          if (/^\d+$/.test(key)) key = LETTERS[Number(key) - 1] ?? key;
          text = text.slice(lab[0].length);
        }
        const corr = pick(o, F.optCorrect);
        if (corr === true || corr === "true" || corr === 1 || corr === "yes") flagged.push(key);
        const ex = pick(o, F.optExplanation);
        if (ex !== undefined && toText(ex)) optionExplanations.push(`**${key}.** ${toText(ex)}`);
        options.push({ key, text: linkInlineImages(text), media: toMedia(pick(o, ["image", "images", "figure", "media", "img"])) });
      } else {
        let text = toText(o);
        let key = LETTERS[i];
        const lab = LABEL_RE.exec(text);
        if (lab) {
          const k = (lab[1] ?? lab[2]).toUpperCase();
          key = /^\d+$/.test(k) ? (LETTERS[Number(k) - 1] ?? key) : k;
          text = text.slice(lab[0].length);
        }
        const isImg = looksLikeFile(text) && !/\s/.test(text.trim());
        options.push({ key, text: isImg ? "" : linkInlineImages(text), media: isImg ? [{ file: text.trim() }] : [] });
      }
    });
  } else if (isObj(raw)) {
    Object.entries(raw).forEach(([k, v], i) => {
      // OCR sometimes splits the stem into a bogus option ("4500": "11000/µL), CRP …")
      if (!/^\s*(?:option[_\s]?)?(?:[A-Za-z]|\d{1,2})\s*$/i.test(k) && typeof v === "string" && Object.keys(raw as Obj).length > 2) {
        stemTail += ` ${k} ${v}`;
        return;
      }
      const key = k.trim().length <= 3 ? k.trim().replace(/^option[_\s]?/i, "").toUpperCase() : LETTERS[i];
      if (isObj(v)) {
        const corr = pick(v, F.optCorrect);
        if (corr === true || corr === "true" || corr === 1) flagged.push(key);
        options.push({ key, text: linkInlineImages(toText(pick(v, F.optText) ?? v)), media: toMedia(pick(v, ["image", "images", "figure", "media"])) });
      } else {
        const text = toText(v);
        const isImg = looksLikeFile(text) && !/\s/.test(text.trim());
        options.push({ key: key || LETTERS[i], text: isImg ? "" : linkInlineImages(text), media: isImg ? [{ file: text.trim() }] : [] });
      }
    });
  }

  // de-duplicate keys (e.g. "A" twice from sloppy extraction)
  const seen = new Set<string>();
  options.forEach((o, i) => {
    if (!o.key || seen.has(o.key)) o.key = LETTERS[i];
    seen.add(o.key);
    o.text = reflow(o.text);
  });
  return { options, flagged, optionExplanations, stemTail: stemTail.trim() };
}

function resolveAnswer(v: Json, options: Option[], base: 0 | 1, explicitZeroBased = false): string[] {
  if (v === undefined || v === null || v === "") return [];
  const keys = options.map((o) => o.key);
  const byText = (s: string) => {
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
    const t = norm(s);
    const hit = options.find((o) => norm(o.text) === t) ?? options.find((o) => t.length > 8 && norm(o.text).startsWith(t));
    return hit ? [hit.key] : [];
  };

  if (Array.isArray(v)) return Array.from(new Set(v.flatMap((x) => resolveAnswer(x, options, base, explicitZeroBased))));
  if (typeof v === "boolean") {
    const k = options.find((o) => o.text.toLowerCase() === String(v))?.key;
    return k ? [k] : [];
  }
  if (typeof v === "number") {
    const idx = explicitZeroBased ? v : v - base;
    return keys[idx] ? [keys[idx]] : [];
  }
  if (isObj(v)) {
    const inner = pick(v, ["key", "letter", "option", "answer", "label", "value", "text", "index"]);
    return resolveAnswer(inner, options, base, explicitZeroBased);
  }
  const s = String(v).trim();
  if (!s) return [];
  const exactKey = keys.find((k) => k.toLowerCase() === s.toLowerCase());
  if (exactKey) return [exactKey];
  // exact key ("B", "b", "(B)", "B)", "Option B", "Answer: B")
  const cleaned = s.replace(/^(?:the\s+)?(?:correct\s+)?(?:answer|option|ans|choice)\s*(?:is|:)?\s*/i, "").trim();
  const single = /^\(?([A-Za-z])\)?[.):]?$/.exec(cleaned);
  if (single && keys.includes(single[1].toUpperCase())) return [single[1].toUpperCase()];
  // "B. Some text" / "B) text"
  const lead = /^\(?([A-Za-z])[).:]\s+\S/.exec(cleaned);
  if (lead && keys.includes(lead[1].toUpperCase())) return [lead[1].toUpperCase()];
  // "A, C" / "A and C" / "A & D"
  const multi = cleaned.split(/\s*(?:,|;|&|\/|\band\b|\s)\s*/i).filter(Boolean);
  if (multi.length > 1 && multi.every((m) => /^[A-Za-z]$/.test(m) && keys.includes(m.toUpperCase()))) return multi.map((m) => m.toUpperCase());
  // "ACD"
  if (/^[A-Z]{2,6}$/.test(cleaned) && cleaned.split("").every((c) => keys.includes(c))) return cleaned.split("");
  // numeric string
  if (/^\d{1,2}$/.test(cleaned)) return resolveAnswer(Number(cleaned), options, base, explicitZeroBased);
  // true/false words
  return byText(cleaned);
}

// --------------------------------------------------------------------------
// Item classifiers
// --------------------------------------------------------------------------

function looksLikeQuestion(o: Obj): boolean {
  const stem = pick(o, F.stem);
  if (stem === undefined || isObj(stem) || Array.isArray(stem)) return false;
  return (
    has(o, F.options) ||
    has(o, F.answer) ||
    has(o, F.answerIndex) ||
    has(o, F.keyMap) ||
    has(o, F.verdicts) ||
    Object.keys(o).some((k) => /^(?:option|opt|choice)[_\s-]?[a-h1-8]$/i.test(k))
  );
}

function looksLikeFlashcard(o: Obj): boolean {
  const hasFront = has(o, ["front", "term", "cue"]);
  const hasBack = has(o, ["back", "definition"]);
  if (hasFront && hasBack) return true;
  // {question, answer} with no options = flashcard (unless it is a true/false item)
  const ans = pick(o, ["answer", "a"]);
  if (typeof ans === "boolean" || /^(true|false)$/i.test(String(ans ?? ""))) return false;
  return has(o, ["question", "q", "prompt"]) && ans !== undefined && !has(o, F.options) && !parseOptions(o).options.length;
}

const CASE_TEXT = ["presentation", "clinical_presentation", "case_presentation", "history", "scenario", "case", "vignette"];

function looksLikeCase(o: Obj): boolean {
  const pres = pick(o, CASE_TEXT);
  return pres !== undefined && !Array.isArray(pres) && !Array.isArray(pick(o, F.chapters));
}

// --------------------------------------------------------------------------
// Item parsers
// --------------------------------------------------------------------------

const ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];

/**
 * Finds an EMI answer list written inline ("… i. GBM ii. Meningioma iii. …"
 * or "1. … 2. …"). Markers must appear in sequence, which avoids false hits.
 */
export function parseChoiceList(text: string, numeric = false): { choices: MatchChoice[]; start: number; tail: string } | null {
  const re = numeric ? /(^|[\s(])(\d{1,2})[.)-]\s+/g : /(^|[\s(])((?:x{0,2})(?:ix|iv|v?i{0,3}))[.)]\s+/gi;
  const hits: { key: string; at: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    if (!m[2]) continue;
    const key = m[2].toLowerCase();
    const want = numeric ? String(hits.length + 1) : ROMANS[hits.length];
    if (key === want) hits.push({ key, at: m.index! + m[1].length, end: m.index! + m[0].length });
  }
  if (hits.length < 3) return null;
  const clean = (t: string) => t.replace(/\s+/g, " ").replace(/[\s,;]+$/, "").trim();
  const choices = hits.map((h, i) => ({ key: h.key, text: clean(text.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : undefined)) }));
  // Lists are often followed directly by the instruction, with no separator:
  // "… vii. Seizures Regarding aneurysmal SAH: prognosis?" → item "Seizures",
  // tail "Regarding aneurysmal SAH: prognosis?"
  let tail = "";
  const last = choices[choices.length - 1];
  const cut =
    /\s(?=(?:Choose|Select|Match|Regarding|Please|For (?:the|each)|The following|Which|What|From (?:the|this)|With regard|Each (?:option|answer)|Label|Identify|Pick)\b)/.exec(last.text) ??
    /(?<=[.?!])\s(?=[A-Z])/.exec(last.text);
  if (cut && cut.index > 0) {
    tail = last.text.slice(cut.index).trim();
    last.text = last.text.slice(0, cut.index).trim();
  }
  return { choices, start: hits[0].at, tail };
}

const TF = /^(t|f|true|false|yes|no)$/i;

/** Splits a question with sub-parts (Part A, Part B …) into one item per part. */
function expandParts(o: Obj): Obj[] {
  const parts = pick(o, F.parts);
  if (!Array.isArray(parts) || !parts.some(isObj)) return [o];
  const stem = toText(pick(o, F.stem));
  // parent text may itself list "Part A … Part B …" – keep only the shared case
  const context = stem.split(/(?:^|\n)\s*Part\s+[A-Z0-9]\b/)[0].trim();
  const num = toText(pick(o, F.number));
  const base: Obj = { ...o };
  for (const k of Object.keys(base)) {
    const n = k.toLowerCase();
    if (["parts", "answers", "options", "choices", "correct_answer", "answer", "answer_key_map", "option_verdicts", "option_explanations"].includes(n)) delete base[k];
  }
  return (parts.filter(isObj) as Obj[]).map((p, i) => {
    const label = toText(pick(p, ["part", "label", "letter"])) || LETTERS[i];
    const text = toText(pick(p, ["text", "question", "stem", "prompt"]));
    const merged: Obj = { ...base, ...p };
    for (const k of ["text", "part", "label", "letter", "stem", "prompt"]) delete merged[k];
    merged.question = [context, `**Part ${label}.** ${text}`].filter(Boolean).join("\n\n");
    if (!toText(pick(p, F.explanation))) merged.explanation = toText(pick(o, F.explanation));
    if (num) {
      for (const k of Object.keys(merged)) if (F.number.includes(k.toLowerCase() as never)) delete merged[k];
      merged.printed_number = `${num}${label.toLowerCase()}`;
    }
    merged.group_id = `parts-${num || toText(pick(o, ["question_id", "id"])) || context.slice(0, 40)}`;
    return merged;
  });
}

function parseQuestion(o: Obj, idx: number, opts: NormalizeOptions): ParsedQuestion | null {
  const stemRaw = pick(o, F.stem);
  let stem = reflow(toText(stemRaw));
  if (!stem) return null;
  // shared text printed once for a group of questions ("Use the following figure to
  // answer questions 46–48", a case read before questions 1–3) goes before the question
  const shared = [
    pick(o, ["shared_directions", "directions", "instructions"]),
    pick(o, ["case_scenario", "shared_vignette", "vignette", "case", "scenario", "clinical_presentation", "history", "passage", "context"])
  ]
    .map((v) => reflow(toText(v)))
    .filter(Boolean);
  const squash = (t: string) => t.replace(/\s+/g, " ").trim();
  for (const pre of shared.reverse()) if (!squash(stem).includes(squash(pre))) stem = `${pre}\n\n${stem}`;
  const { options, flagged, optionExplanations, stemTail } = parseOptions(o);
  if (stemTail) stem = `${stem} ${stemTail}`;

  // options drawn inside an image ("which patient, A–E, …"): labels only
  const visual = pick(o, ["visual_option_labels", "image_option_labels"]);
  if (!options.length && Array.isArray(visual))
    visual.forEach((l) => options.push({ key: toText(l).toUpperCase(), text: "(see image)", media: [] }));

  // True/False without options
  const ansRaw = pick(o, F.answer);
  if (!options.length && (typeof ansRaw === "boolean" || /^(true|false)$/i.test(String(ansRaw ?? "")))) {
    options.push({ key: "A", text: "True", media: [] }, { key: "B", text: "False", media: [] });
  }

  let answer = flagged.length ? flagged : [];
  if (!answer.length) {
    const idxRaw = pick(o, F.answerIndex);
    if (idxRaw !== undefined) answer = resolveAnswer(idxRaw, options, 0, true);
  }
  if (!answer.length && ansRaw !== undefined) {
    // answer may be an object carrying the explanation too
    answer = resolveAnswer(ansRaw, options, opts.numericAnswerBase);
  }
  if (!answer.length) {
    // "correct_answer_text": match the option text
    const byText = pick(o, ["correct_answer_text", "answer_text", "correct_option_text"]);
    if (byText !== undefined) answer = resolveAnswer(toText(byText), options, opts.numericAnswerBase);
  }

  // ---- true/false statements and extended matching
  let format: QuestionFormat | undefined;
  let verdicts: Record<string, boolean> | undefined;
  let choices: MatchChoice[] | undefined;
  let matches: Record<string, string> | undefined;
  const verdictRaw = pick(o, F.verdicts);
  const keyMap = pick(o, F.keyMap);
  const tfMap = isObj(verdictRaw) ? verdictRaw : isObj(keyMap) && Object.values(keyMap).every((v) => TF.test(toText(v))) ? keyMap : undefined;
  const itemKeys = (m: Obj) => {
    // items may be unlabelled (e.g. structures a–e marked on a diagram)
    for (const k of Object.keys(m)) if (!options.some((x) => x.key === k.toUpperCase())) options.push({ key: k.toUpperCase(), text: "", media: [] });
  };
  if (tfMap) {
    format = "truefalse";
    itemKeys(tfMap);
    verdicts = Object.fromEntries(Object.entries(tfMap).map(([k, v]) => [k.toUpperCase(), /^(t|true|yes)$/i.test(toText(v))]));
    answer = Object.keys(verdicts).filter((k) => verdicts![k]);
  } else if (isObj(keyMap)) {
    format = "matching";
    itemKeys(keyMap);
    const values = Object.values(keyMap).map((v) => toText(v).toLowerCase());
    const numeric = values.every((v) => /^\d+$/.test(v));
    matches = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [k.toUpperCase(), toText(v).toLowerCase()]));
    const listRaw = pick(o, F.choiceList);
    if (Array.isArray(listRaw) || isObj(listRaw)) {
      const entries: [string, Json][] = Array.isArray(listRaw) ? listRaw.map((x, i) => [numeric ? String(i + 1) : ROMANS[i], x]) : Object.entries(listRaw);
      choices = entries.map(([k, v]) => ({ key: k.toLowerCase(), text: reflow(toText(v)) }));
    } else {
      const found = parseChoiceList(stem, numeric);
      if (found) {
        choices = found.choices;
        // the list is shown as the answer menu; keep the text around it as the question
        stem = [stem.slice(0, found.start).trim(), found.tail].filter(Boolean).join("\n\n") || "Match each item with the best answer from the list.";
      }
    }
    // unknown list text: still playable with bare keys
    if (!choices?.length) choices = Array.from(new Set(values)).sort((a, b) => (numeric ? Number(a) - Number(b) : ROMANS.indexOf(a) - ROMANS.indexOf(b))).map((k) => ({ key: k, text: "" }));
    answer = [];
  } else if (answer.length > 1) format = "multi";

  let explanation = reflow(toText(pick(o, F.explanation)));
  const sharedAnswer = reflow(toText(pick(o, ["shared_answer_context", "shared_explanation"])));
  if (sharedAnswer && !squash(explanation).includes(squash(sharedAnswer))) explanation = [sharedAnswer, explanation].filter(Boolean).join("\n\n");
  if (!explanation && isObj(ansRaw)) explanation = reflow(toText(pick(ansRaw, F.explanation)));
  if (optionExplanations.length) explanation = [explanation, optionExplanations.join("\n\n")].filter(Boolean).join("\n\n");

  const tables = tableToText(pick(o, F.tables));
  if (tables && !squash(stem).includes(squash(tables))) stem = `${stem}\n\n${tables}`;
  const exTables = tableToText(pick(o, F.explanationTables));
  if (exTables && !squash(explanation).includes(squash(exTables))) explanation = `${explanation}\n\n${exTables}`;

  let explanationMedia = toMedia(pick(o, F.explanationMedia));
  if (isObj(ansRaw)) explanationMedia = explanationMedia.concat(toMedia(pick(ansRaw, ["images", "image", "figures"])));
  const explanationObj = pick(o, F.explanation);
  if (isObj(explanationObj)) explanationMedia = explanationMedia.concat(toMedia(pick(explanationObj, ["images", "image", "figures", "figure"])));

  // Question images: prefer explicit question-image fields; a generic "images"
  // list can contain answer images too, which must not be shown before answering.
  const answerFiles = new Set(explanationMedia.map((m) => m.file));
  let stemMedia: MediaRef[];
  if (hasKey(o, F.questionMedia)) stemMedia = toMedia(pick(o, F.questionMedia));
  else {
    // a mixed list: "…_answer_image1.jpg" belongs to the answer
    const generic = toMedia(pick(o, F.stemMedia)).filter((m) => !answerFiles.has(m.file));
    const isAnswer = (f: string) => /(^|[_\-\s/])(answer|ans|explanation|expl)[_\-\s]?(image|img|fig|figure|pic)/i.test(f);
    stemMedia = generic.filter((m) => !isAnswer(m.file));
    explanationMedia = explanationMedia.concat(generic.filter((m) => isAnswer(m.file)));
  }

  // image credit printed with the figure
  const credit = toText(pick(o, ["image_attribution", "image_credit", "figure_credit"]));
  if (credit) stemMedia = stemMedia.map((m) => (m.caption ? m : { ...m, caption: credit }));

  const num = pick(o, F.number);
  const tags = pick(o, F.tags);
  const group = pick(o, ["group_id", "parent_vignette_id", "emi_set_id", "case_group_id", "vignette_id", "shared_stem_id"]);
  const emi = pick(o, ["emi_set_id", "emi_set", "emi_group_id"]);
  const srcId = pick(o, ["question_id", "qid"]);
  const section = pick(o, ["section_id", "section_name"]);
  const groupId = typeof group === "string" || typeof group === "number" ? String(group) : undefined;
  return {
    number: num !== undefined && (typeof num === "string" || typeof num === "number") ? String(num) : String(idx + 1),
    stem: linkInlineImages(stem),
    options,
    answer,
    ...(format ? { format } : {}),
    ...(verdicts ? { verdicts } : {}),
    ...(choices ? { choices } : {}),
    ...(matches ? { matches } : {}),
    explanation: linkInlineImages(explanation),
    annotation: parseAnnotation(o),
    stemMedia,
    explanationMedia,
    sourceTags: tagList(tags),
    ...(groupId ? { groupId } : {}),
    ...(typeof emi === "string" || typeof emi === "number" ? { emiSet: String(emi) } : {}),
    ...(typeof srcId === "string" || typeof srcId === "number" ? { sourceId: String(srcId) } : {}),
    ...(typeof section === "string" ? { section } : {})
  };
}

function parseAnnotation(o: Obj): ParsedAnnotation | undefined {
  const a = pick(o, ["annotation", "neuroquiz_tags"]);
  if (!isObj(a) || typeof a.topic !== "string") return undefined;
  const strs = (v: Json) => (Array.isArray(v) ? v.map(toText).filter(Boolean) : []);
  const src = a.source === "ai" || a.source === "manual" || a.source === "local" ? a.source : "ai";
  const diff = a.difficulty === "easy" || a.difficulty === "medium" || a.difficulty === "hard" ? a.difficulty : undefined;
  return {
    topic: a.topic,
    subtopic: toText(a.subtopic),
    tags: strs(a.tags),
    keywords: strs(a.keywords),
    difficulty: diff,
    highYield: a.highYield === true || a.high_yield === true,
    summary: a.summary ? toText(a.summary) : undefined,
    source: src,
    updatedAt: typeof a.updatedAt === "number" ? a.updatedAt : 0
  };
}

function tagList(v: Json): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v.map(toText).filter(Boolean);
  if (typeof v === "string") return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  return [toText(v)].filter(Boolean);
}

function parseFlashcard(o: Obj): ParsedFlashcard | null {
  const front = toText(pick(o, F.front));
  const back = toText(pick(o, F.back));
  if (!front || !back) return null;
  return {
    front: linkInlineImages(front),
    back: linkInlineImages(back),
    annotation: parseAnnotation(o),
    frontMedia: toMedia(pick(o, ["front_media", "front_image", "front_images", "image", "images", "figure"])),
    backMedia: toMedia(pick(o, ["back_media", "back_image", "back_images", "answer_image", "answer_images"])),
    sourceTags: tagList(pick(o, F.tags))
  };
}

function parseCase(o: Obj, opts: NormalizeOptions): ParsedCase | null {
  const title = toText(pick(o, ["title", "name", "case_title", "diagnosis_hidden", "heading"])) || "Clinical case";
  const presentation = toText(pick(o, F.casePresentation));
  const stagesRaw = pick(o, F.caseStages);
  const stages: CaseStage[] = [];
  if (Array.isArray(stagesRaw)) {
    stagesRaw.forEach((s, i) => {
      if (isObj(s)) {
        // a stage can itself be an MCQ
        const asQ = looksLikeQuestion(s) && parseOptions(s).options.length >= 2 ? parseQuestion(s, i, opts) : null;
        const content = toText(pick(s, ["content", "text", "information", "findings", "update", "description", "body"]));
        const question = asQ
          ? asQ.stem + (asQ.options.length ? "\n\n" + asQ.options.map((x) => `${x.key}. ${x.text}`).join("\n") : "")
          : toText(pick(s, ["question", "prompt", "ask"]));
        const answer = asQ
          ? [asQ.answer.length ? `**Answer: ${asQ.answer.join(", ")}**` : "", asQ.explanation].filter(Boolean).join("\n\n")
          : toText(pick(s, ["answer", "solution", "explanation", "discussion", "reveal"]));
        stages.push({
          title: toText(pick(s, ["title", "name", "stage", "heading"])) || `Step ${i + 1}`,
          content: linkInlineImages(asQ && content === asQ.stem ? "" : content),
          question: question ? linkInlineImages(question) : undefined,
          answer: answer ? linkInlineImages(answer) : undefined,
          media: toMedia(pick(s, ["images", "image", "figures", "figure", "media", "imaging"]))
        });
      } else if (toText(s)) {
        stages.push({ title: `Step ${i + 1}`, content: linkInlineImages(toText(s)), media: [] });
      }
    });
  }
  const discussion = toText(pick(o, F.caseDiscussion));
  if (!presentation && !stages.length) return null;
  return {
    title,
    presentation: linkInlineImages(presentation),
    annotation: parseAnnotation(o),
    presentationMedia: toMedia(pick(o, ["presentation_media", "images", "image", "figures", "figure", "media", "imaging"])),
    stages,
    discussion: linkInlineImages(discussion),
    sourceTags: tagList(pick(o, F.tags))
  };
}

// --------------------------------------------------------------------------
// Walker
// --------------------------------------------------------------------------

/**
 * Extended matching: a source may store an EMI set as separate single-answer
 * questions that repeat one option list (tagged with the same emi_set_id).
 * They become one matching question – the list once, one item per scenario.
 */
export function mergeEmiSets(questions: ParsedQuestion[], groups: Obj[] = []): ParsedQuestion[] {
  const sets = new Map<string, ParsedQuestion[]>();
  for (const q of questions) if (q.emiSet && (q.format ?? "single") === "single") (sets.get(q.emiSet) ?? sets.set(q.emiSet, []).get(q.emiSet)!).push(q);
  const optionKey = (q: ParsedQuestion) => q.options.map((o) => `${o.key}=${o.text.replace(/\s+/g, " ").trim().toLowerCase()}`).join("|");
  const done = new Set<string>();
  const out: ParsedQuestion[] = [];
  for (const q of questions) {
    const set = q.emiSet ? sets.get(q.emiSet) : undefined;
    const mergeable = set && set.length >= 2 && set.every((x) => optionKey(x) === optionKey(set[0]) && x.answer.length === 1);
    if (!mergeable) {
      out.push(q);
      continue;
    }
    if (done.has(q.emiSet!)) continue;
    done.add(q.emiSet!);
    const nums = set.map((x) => x.number);
    const numeric = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    // lead-in from the book's "responses for questions 10 through 14" block
    const group = groups.find((g) => {
      const first = Number(pick(g, ["first", "from", "start"]));
      const last = Number(pick(g, ["last", "to", "end"]));
      return numeric.length && numeric.every((n) => n >= first && n <= last);
    });
    const groupText = group ? toText(pick(group, ["text", "body", "content"])) : "";
    // text every item starts with ("Match these MRI findings…") is the lead-in, not part of each item
    const paras = set.map((x) => x.stem.split("\n\n"));
    let common = 0;
    while (paras.every((p) => p.length > common + 1 && p[common] === paras[0][common])) common++;
    const shared = paras[0].slice(0, common).join("\n\n");
    const itemText = (x: ParsedQuestion, i: number) => paras[i].slice(common).join("\n\n") || x.stem;
    // …and so is an image every item shows
    const mediaKey = (x: ParsedQuestion) => x.stemMedia.map((m) => m.file).join("|");
    const sharedMedia = set.every((x) => x.stemMedia.length && mediaKey(x) === mediaKey(set[0])) ? set[0].stemMedia : [];
    const lead =
      (groupText && parseChoiceList(groupText, set[0].options.every((o) => /^\d+$/.test(o.key)))?.tail) ||
      shared ||
      "Match each item with the most likely answer from the list. Each answer may be used once, more than once or not at all.";
    const explanations = Array.from(new Set(set.map((x) => x.explanation).filter(Boolean)));
    out.push({
      number: nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : nums[0],
      stem: shared && lead !== shared ? `${shared}\n\n${lead}` : lead,
      options: set.map((x, i) => ({ key: x.number, text: itemText(x, i), media: sharedMedia.length ? [] : x.stemMedia })),
      answer: [],
      format: "matching",
      choices: set[0].options.map((o) => ({ key: o.key.toLowerCase(), text: o.text })),
      matches: Object.fromEntries(set.map((x) => [x.number, x.answer[0].toLowerCase()])),
      explanation:
        explanations.length === 1 && set.length > 1
          ? explanations[0]
          : set
              .filter((x) => x.explanation)
              .map((x) => `**${x.number}.** ${x.explanation}`)
              .join("\n\n"),
      stemMedia: sharedMedia,
      explanationMedia: set.flatMap((x) => x.explanationMedia).filter((m, i, all) => all.findIndex((y) => y.file === m.file) === i),
      sourceTags: Array.from(new Set(set.flatMap((x) => x.sourceTags))),
      annotation: set[0].annotation
    });
  }
  return out;
}

/** Book-level lists of questions the extraction flagged, and what they mean. */
const FLAG_LISTS: [string, string][] = [
  ["known_unresolved_mismatches", "The book's extraction lists an unresolved mismatch for this question (for example answer key vs explanation). Double-check it against the book."],
  ["review_required", "The book's extraction flagged this question for review."],
  ["flagged_questions", "The book's extraction flagged this question for review."]
];

/**
 * Marks questions named in book-level flag lists. Entries are either a
 * question id ("09_s10_q1000") or a path "Chapter[/Section]/Q17".
 */
function applySourceFlags(chapters: ParsedChapter[], flags: { ref: string; message: string }[]) {
  if (!flags.length) return;
  const norm = (t: string) => t.replace(/\s+–\s+/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
  for (const { ref, message } of flags) {
    const parts = ref.split("/");
    const qid = parts.pop()!.trim().toLowerCase();
    const where = norm(parts.join("/"));
    for (const ch of chapters)
      for (const q of ch.questions) {
        const id = (q.sourceId ?? "").toLowerCase();
        const hit = id === ref.toLowerCase() || (id === qid && (!where || norm(ch.title) === where || norm(`${ch.title}/${q.section ?? ""}`) === where));
        if (hit && !q.sourceWarning) q.sourceWarning = message;
      }
  }
}

function emptyChapter(title: string): ParsedChapter {
  return { title, questions: [], flashcards: [], cases: [] };
}

function fileTitle(fileName: string): string {
  return fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function normalizeBookJson(json: Json, opts: NormalizeOptions): ParsedFile {
  const warnings: string[] = [];
  const chapters: ParsedChapter[] = [];
  let bookTitle: string | undefined;
  let bookId: string | undefined;
  const sharedGroups: Obj[] = [];
  const flags: { ref: string; message: string }[] = [];
  const chapterNo = (o: Obj): number | undefined => {
    const v = pick(o, ["chapter_id", "chapter_number", "chapter_no", "chapterid"]);
    const m = /(\d+)/.exec(String(v ?? ""));
    return m ? Number(m[1]) : undefined;
  };

  const defaultTitle = fileTitle(opts.fileName);

  function addItems(list: Json[], chapter: ParsedChapter) {
    // flat question arrays may carry their own chapter field → group
    const groups = new Map<string, ParsedChapter>();
    // a chapter holding several sections (a 5-section practice exam) is split by section
    const sectionOf = (o: Obj) => {
      const v = pick(o, ["section_id", "section_name"]);
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const sections = new Set(list.filter(isObj).map((o) => sectionOf(o as Obj)).filter(Boolean));
    const splitSections = sections.size >= 2;
    const target = (o: Obj): ParsedChapter => {
      const ch = pick(o, F.chapterName);
      let name = ch === undefined || typeof ch === "object" ? chapter.title : toText(ch);
      const sec = splitSections ? sectionOf(o) : undefined;
      if (sec && sec !== name) name = `${name} – ${sec}`;
      if (name === chapter.title) return chapter;
      if (!groups.has(name)) groups.set(name, emptyChapter(name));
      return groups.get(name)!;
    };
    list.flatMap((x) => (isObj(x) ? expandParts(x) : [x])).forEach((item, i) => {
      if (!isObj(item)) return;
      if (looksLikeCase(item) && !looksLikeQuestion(item)) {
        const c = parseCase(item, opts);
        if (c) target(item).cases.push(c);
        return;
      }
      if (hasContainer(item)) {
        walk(item, chapter.title);
        return;
      }
      if (looksLikeQuestion(item) && !looksLikeFlashcard(item)) {
        const q = parseQuestion(item, i, opts);
        if (q) {
          if (!q.answer.length && q.format !== "matching") warnings.push(`${chapter.title} #${q.number}: no correct answer found`);
          if (!q.options.length) warnings.push(`${chapter.title} #${q.number}: no options found`);
          if (q.format === "matching" && q.choices?.every((c) => !c.text)) warnings.push(`${chapter.title} #${q.number}: matching list not found – choices shown as numbers only`);
          target(item).questions.push(q);
        }
        return;
      }
      if (looksLikeFlashcard(item)) {
        const f = parseFlashcard(item);
        if (f) target(item).flashcards.push(f);
        return;
      }
      if (looksLikeCase(item)) {
        const c = parseCase(item, opts);
        if (c) target(item).cases.push(c);
      }
    });
    for (const g of groups.values()) chapters.push(g);
  }

  function hasContainer(o: Obj): boolean {
    // pick() skips empty lists, so "parts": [] on a question no longer looks like a container
    return !looksLikeQuestion(o) && [F.chapters, F.questions, F.flashcards, F.cases].some((a) => {
      const v = pick(o, a);
      return Array.isArray(v) && v.some(isObj);
    });
  }

  function walk(node: Json, titleHint: string) {
    if (Array.isArray(node)) {
      if (node.every((x) => isObj(x) && hasContainer(x as Obj))) {
        node.forEach((c, i) => walk(c, `${titleHint} ${i + 1}`));
      } else {
        const ch = emptyChapter(titleHint);
        addItems(node, ch);
        if (ch.questions.length || ch.flashcards.length || ch.cases.length) chapters.push(ch);
      }
      return;
    }
    if (!isObj(node)) return;
    if (looksLikeCase(node)) {
      const ch = emptyChapter(titleHint);
      const c = parseCase(node, opts);
      if (c) ch.cases.push(c);
      chapters.push(ch);
      return;
    }

    const bt = pick(node, F.bookTitle);
    if (!bookTitle && typeof bt === "string") bookTitle = bt.trim();
    const groups = pick(node, ["case_groups", "shared_groups", "question_groups"]);
    if (Array.isArray(groups)) sharedGroups.push(...(groups.filter(isObj) as Obj[]));
    const bid = pick(node, ["book_id", "bookid"]);
    if (!bookId && (typeof bid === "string" || typeof bid === "number") && String(bid).trim()) bookId = String(bid).trim();

    let subChapters = pick(node, F.chapters);
    // chapters as a named map: { "1. Physiology": { questions: [...] }, ... }
    if (isObj(subChapters))
      subChapters = Object.entries(subChapters).flatMap(([name, v]) =>
        isObj(v) ? [{ chapter_name: name, ...v }] : Array.isArray(v) ? [{ chapter_name: name, questions: v }] : []
      );
    for (const [key, message] of FLAG_LISTS) {
      const v = node[key];
      if (Array.isArray(v)) flags.push(...v.filter((x): x is string => typeof x === "string").map((ref) => ({ ref, message })));
    }
    if (Array.isArray(subChapters)) {
      if (!bookTitle) {
        const t = pick(node, ["title", "name"]);
        if (typeof t === "string") bookTitle = t.trim();
      }
      subChapters.forEach((c, i) => {
        if (isObj(c)) {
          const t = toText(pick(c, F.title)) || `Chapter ${i + 1}`;
          const num = pick(c, ["number", "chapter_number", "no"]);
          walk(c, num !== undefined && !t.includes(String(num)) ? `${num}. ${t}` : t);
        } else if (Array.isArray(c)) walk(c, `Chapter ${i + 1}`);
      });
    }

    const qs = pick(node, F.questions);
    const fcs = pick(node, F.flashcards);
    const cs = pick(node, F.cases);
    if (Array.isArray(qs) || Array.isArray(fcs) || Array.isArray(cs)) {
      const t = subChapters ? titleHint : toText(pick(node, F.title)) || titleHint;
      const ch = emptyChapter(t);
      const no = chapterNo(node);
      if (no !== undefined) ch.sortKey = no;
      if (Array.isArray(qs)) addItems(qs, ch);
      if (Array.isArray(fcs)) fcs.forEach((f) => isObj(f) && (() => { const p = parseFlashcard(f); if (p) ch.flashcards.push(p); })());
      if (Array.isArray(cs)) cs.forEach((c) => isObj(c) && (() => { const p = parseCase(c, opts); if (p) ch.cases.push(p); })());
      if (ch.questions.length || ch.flashcards.length || ch.cases.length) chapters.push(ch);
      return;
    }

    // A single question / case object at the root.
    if (!subChapters) {
      const ch = emptyChapter(titleHint);
      addItems([node], ch);
      if (ch.questions.length || ch.flashcards.length || ch.cases.length) chapters.push(ch);
    }
  }

  walk(json, defaultTitle);

  // merge chapters with identical titles (e.g. grouped by chapter field)
  const merged = new Map<string, ParsedChapter>();
  for (const c of chapters) {
    const m = merged.get(c.title);
    if (m) {
      m.questions.push(...c.questions);
      m.flashcards.push(...c.flashcards);
      m.cases.push(...c.cases);
    } else merged.set(c.title, c);
  }
  const out = Array.from(merged.values());
  for (const ch of out) ch.questions = mergeEmiSets(ch.questions, sharedGroups);
  applySourceFlags(out, flags);
  if (!out.length) warnings.push(`${opts.fileName}: no questions, flashcards or cases recognised`);
  return { bookTitle, ...(bookId ? { bookId } : {}), chapters: out, warnings };
}
