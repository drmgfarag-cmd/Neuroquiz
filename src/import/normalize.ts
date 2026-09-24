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
import type { CaseStage, MediaRef, Option } from "../lib/types";
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
}

export interface ParsedFlashcard {
  front: string;
  back: string;
  frontMedia: MediaRef[];
  backMedia: MediaRef[];
  sourceTags: string[];
}

export interface ParsedCase {
  title: string;
  presentation: string;
  presentationMedia: MediaRef[];
  stages: CaseStage[];
  discussion: string;
  sourceTags: string[];
}

export interface ParsedChapter {
  title: string;
  questions: ParsedQuestion[];
  flashcards: ParsedFlashcard[];
  cases: ParsedCase[];
}

export interface ParsedFile {
  bookTitle?: string;
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
  stemMedia: ["images", "image", "figures", "figure", "media", "question_images", "question_image", "question_figures", "img", "imgs", "pictures", "attachments", "tables_images", "diagram", "diagrams", "table_image", "table_images"],
  explanationMedia: ["explanation_images", "explanation_image", "answer_images", "answer_image", "explanation_figures", "rationale_images", "solution_images", "explanation_media", "answer_media"],
  tables: ["tables", "table"],
  explanationTables: ["explanation_tables", "explanation_table", "answer_tables"],
  number: ["number", "question_number", "questionnumber", "qno", "q_no", "no", "num", "id", "qid", "index"],
  tags: ["tags", "keywords", "topic", "topics", "category", "categories", "subject", "subtopic", "section"],
  chapterName: ["chapter", "chapter_title", "chaptertitle", "chapter_name", "section_title"],
  title: ["title", "name", "chapter", "chapter_title", "heading", "section"],
  bookTitle: ["book", "book_title", "booktitle", "book_name", "source", "textbook"],
  chapters: ["chapters", "sections", "parts", "units"],
  questions: ["questions", "mcqs", "mcq", "items", "qbank", "question_bank", "questionbank"],
  flashcards: ["flashcards", "flash_cards", "cards", "flashcard"],
  cases: ["cases", "case_scenarios", "casescenarios", "clinical_cases", "scenarios", "case_studies"],
  front: ["front", "term", "prompt", "question", "q", "cue"],
  back: ["back", "definition", "answer", "a", "response"],
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
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return undefined;
}

function has(o: Obj, aliases: readonly string[]): boolean {
  return pick(o, aliases) !== undefined;
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

function parseOptions(q: Obj): { options: Option[]; flagged: string[]; optionExplanations: string[] } {
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
  });
  return { options, flagged, optionExplanations };
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

function parseQuestion(o: Obj, idx: number, opts: NormalizeOptions): ParsedQuestion | null {
  const stemRaw = pick(o, F.stem);
  let stem = toText(stemRaw);
  if (!stem) return null;
  const vignette = toText(pick(o, ["vignette", "case", "scenario", "clinical_presentation", "history", "passage", "context"]));
  if (vignette && vignette !== stem) stem = `${vignette}\n\n${stem}`;
  const { options, flagged, optionExplanations } = parseOptions(o);

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

  let explanation = toText(pick(o, F.explanation));
  if (!explanation && isObj(ansRaw)) explanation = toText(pick(ansRaw, F.explanation));
  if (optionExplanations.length) explanation = [explanation, optionExplanations.join("\n\n")].filter(Boolean).join("\n\n");

  const tables = tableToText(pick(o, F.tables));
  if (tables) stem = `${stem}\n\n${tables}`;
  const exTables = tableToText(pick(o, F.explanationTables));
  if (exTables) explanation = `${explanation}\n\n${exTables}`;

  let explanationMedia = toMedia(pick(o, F.explanationMedia));
  if (isObj(ansRaw)) explanationMedia = explanationMedia.concat(toMedia(pick(ansRaw, ["images", "image", "figures"])));
  const explanationObj = pick(o, F.explanation);
  if (isObj(explanationObj)) explanationMedia = explanationMedia.concat(toMedia(pick(explanationObj, ["images", "image", "figures", "figure"])));

  const num = pick(o, F.number);
  const tags = pick(o, F.tags);
  return {
    number: num !== undefined && (typeof num === "string" || typeof num === "number") ? String(num) : String(idx + 1),
    stem: linkInlineImages(stem),
    options,
    answer,
    explanation: linkInlineImages(explanation),
    stemMedia: toMedia(pick(o, F.stemMedia)),
    explanationMedia,
    sourceTags: tagList(tags)
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
    frontMedia: toMedia(pick(o, ["front_image", "front_images", "image", "images", "figure"])),
    backMedia: toMedia(pick(o, ["back_image", "back_images", "answer_image", "answer_images"])),
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
    presentationMedia: toMedia(pick(o, ["images", "image", "figures", "figure", "media", "imaging"])),
    stages,
    discussion: linkInlineImages(discussion),
    sourceTags: tagList(pick(o, F.tags))
  };
}

// --------------------------------------------------------------------------
// Walker
// --------------------------------------------------------------------------

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

  const defaultTitle = fileTitle(opts.fileName);

  function addItems(list: Json[], chapter: ParsedChapter) {
    // flat question arrays may carry their own chapter field → group
    const groups = new Map<string, ParsedChapter>();
    const target = (o: Obj): ParsedChapter => {
      const ch = pick(o, F.chapterName);
      if (ch === undefined || typeof ch === "object") return chapter;
      const name = toText(ch);
      if (!groups.has(name)) groups.set(name, emptyChapter(name));
      return groups.get(name)!;
    };
    list.forEach((item, i) => {
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
          if (!q.answer.length) warnings.push(`${chapter.title} #${q.number}: no correct answer found`);
          if (!q.options.length) warnings.push(`${chapter.title} #${q.number}: no options found`);
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
    return [F.chapters, F.questions, F.flashcards, F.cases].some((a) => Array.isArray(pick(o, a)));
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

    const subChapters = pick(node, F.chapters);
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
  if (!out.length) warnings.push(`${opts.fileName}: no questions, flashcards or cases recognised`);
  return { bookTitle, chapters: out, warnings };
}
