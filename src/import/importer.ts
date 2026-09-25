import JSZip from "jszip";
import { reapplyCorrections } from "../lib/corrections";
import { db, getMeta } from "../lib/db";
import { questionToCard } from "../lib/cards";
import type { Annotation, AtlasEntry, Book, CardState, CaseScenario, Chapter, Flashcard, MediaFile, MediaRef, Question, QuestionState, QuizSession } from "../lib/types";
import { hash, IMAGE_EXT, normaliseFileName, slugify } from "../lib/util";
import { normalizeBookJson, type ParsedFile } from "./normalize";
import { auditBook } from "../lib/quality";

/** A file from a picker, a dropped folder or a zip entry. */
export interface SourceFile {
  /** Relative path ("Youmans/ch01.json", "images/fig1.png") */
  path: string;
  blob: Blob;
}

export interface ParsedSource {
  path: string;
  folder: string;
  parsed: ParsedFile;
  atlas?: (Omit<AtlasEntry, "id" | "bookId" | "chapterId"> & { topic: string })[];
}

export interface BookPlan {
  key: string;
  title: string;
  /**
   * Stable book id. Set from the source's book_id (or by the built-in
   * library); otherwise derived from the title at import time.
   */
  id?: string;
  sources: ParsedSource[];
  images: SourceFile[];
}

export interface ImportPlan {
  books: BookPlan[];
  images: SourceFile[];
  errors: string[];
}

export type GroupingMode = "auto" | "single" | "per-file";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff"
};

/** Reports that travel with an extraction but hold no questions (audit, OCR dumps). */
const NOT_A_BOOK = /(^|\/)[^/]*(audit|page_ocr|ocr_pages|manifest|answer_key|review_queue|review_card_index|validation_report)[^/]*\.json$|contact_sheet/i;

function folderOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  // images often live in an "images"/"figures" sub-folder of the book folder
  while (parts.length && /^(images?|img|figures?|media|assets|pics|pictures|tables|json|data)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.join("/");
}

/** Expand zips and read picker files into SourceFiles. */
export async function collectFiles(files: File[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const parts = new Map<string, Map<number, File>>();
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const split = /^(.*\.zip)\.(\d{3})$/i.exec(path);
    if (!split) continue;
    const group = parts.get(split[1]) ?? new Map<number, File>();
    const number = Number(split[2]);
    if (group.has(number)) throw new Error(`Duplicate ZIP part: ${path}`);
    group.set(number, file);
    parts.set(split[1], group);
  }
  const archives: File[] = [];
  for (const [path, group] of parts) {
    if (!group.has(1)) throw new Error(`Missing ${path}.001: select all parts of the book together`);
    const highest = Math.max(...group.keys());
    for (let n = 1; n <= highest; n++) {
      if (!group.has(n)) throw new Error(`Missing ${path}.${String(n).padStart(3, "0")}: select all parts together`);
    }
    archives.push(new File(Array.from({ length: highest }, (_, i) => group.get(i + 1)!), path.split("/").pop()!, { type: "application/zip" }));
  }
  for (const f of [...files.filter((file) => !/\.zip\.\d{3}$/i.test(file.name)), ...archives]) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f);
      const prefix = f.name.replace(/\.zip$/i, "");
      const entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
      for (const e of entries) {
        if ((!/\.json$/i.test(e.name) && !IMAGE_EXT.test(e.name)) || NOT_A_BOOK.test(e.name)) continue;
        const ext = e.name.split(".").pop()!.toLowerCase();
        const blob = await e.async("blob");
        out.push({ path: `${prefix}/${e.name}`, blob: ext in MIME ? new Blob([blob], { type: MIME[ext] }) : blob });
      }
    } else if ((/\.json$/i.test(f.name) && !NOT_A_BOOK.test(f.name)) || IMAGE_EXT.test(f.name)) {
      out.push({ path, blob: f });
    }
  }
  return out;
}

export async function planImport(
  files: SourceFile[],
  mode: GroupingMode,
  numericAnswerBase: 0 | 1
): Promise<ImportPlan> {
  const errors: string[] = [];
  const jsons = files.filter((f) => /\.json$/i.test(f.path));
  const images = files.filter((f) => IMAGE_EXT.test(f.path));
  const parsed: ParsedSource[] = [];

  for (const f of jsons) {
    try {
      const text = await f.blob.text();
      const json = JSON.parse(text.replace(/^﻿/, ""));
      const p = normalizeBookJson(json, { fileName: f.path, numericAnswerBase });
      let atlas: (Omit<AtlasEntry, "id" | "bookId" | "chapterId"> & { topic: string })[] | undefined;
      if (json && typeof json === "object" && !Array.isArray(json) && Array.isArray(json.atlas_items)) {
        const entries: NonNullable<ParsedSource["atlas"]> = json.atlas_items.map((item: unknown, index: number) => {
          if (!item || typeof item !== "object") throw new Error(`atlas_items[${index}] must be an object`);
          const x = item as Record<string, unknown>;
          if (typeof x.file !== "string" || !IMAGE_EXT.test(x.file) || typeof x.title !== "string" || !x.title.trim()
              || typeof x.topic !== "string" || !x.topic.trim()) throw new Error(`atlas_items[${index}] needs an image file, title and topic`);
          const kind = ["figure", "table", "diagram", "radiology", "note"].includes(String(x.kind)) ? x.kind as AtlasEntry["kind"] : "figure";
          return { file: x.file, title: x.title.trim(), topic: x.topic.trim(),
            kind, description: typeof x.description === "string" ? x.description : undefined,
            sourcePage: Number.isInteger(x.source_page) && Number(x.source_page) > 0 ? Number(x.source_page) : undefined,
            sourceTags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === "string" && !!t.trim()) : [],
            groupId: typeof x.group_id === "string" && x.group_id.trim() ? x.group_id.trim() : undefined };
        });
        if (!entries.length) throw new Error("atlas_items cannot be empty");
        atlas = entries;
        if (typeof json.book_title === "string") p.bookTitle = json.book_title;
        if (typeof json.book_id === "string") p.bookId = json.book_id;
        const known = new Set(p.chapters.map((c) => c.title));
        for (const topic of new Set(entries.map((a) => a.topic))) if (!known.has(topic)) {
          p.chapters.push({ title: topic, questions: [], flashcards: [], cases: [] });
          known.add(topic);
        }
      }
      // a JSON without questions (a report, a settings file) doesn't become a book
      if (p.chapters.length) parsed.push({ path: f.path, folder: folderOf(f.path), parsed: p, atlas });
      else errors.push(`${f.path}: no questions, flashcards or cases found – skipped`);
    } catch (e) {
      errors.push(`${f.path}: ${(e as Error).message}`);
    }
  }
  // natural sort so "ch2" < "ch10"
  parsed.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));

  const books = new Map<string, BookPlan>();
  const add = (key: string, title: string, src: ParsedSource) => {
    if (!books.has(key)) books.set(key, { key, title, sources: [], images: [] });
    const b = books.get(key)!;
    b.sources.push(src);
    if (!b.id && src.parsed.bookId) b.id = slugify(src.parsed.bookId);
  };

  // In auto mode a file without a book title inherits the title used by
  // other files in the same folder (e.g. chapter files where only one names the book).
  const folderTitles = new Map<string, Set<string>>();
  for (const src of parsed) {
    if (!src.parsed.bookTitle) continue;
    if (!folderTitles.has(src.folder)) folderTitles.set(src.folder, new Set());
    folderTitles.get(src.folder)!.add(src.parsed.bookTitle);
  }
  const inherited = (src: ParsedSource) => {
    const t = folderTitles.get(src.folder);
    return t && t.size === 1 ? Array.from(t)[0] : undefined;
  };

  for (const src of parsed) {
    if (mode === "single") add("single", src.parsed.bookTitle || src.folder.split("/").pop() || "Imported book", src);
    else if (mode === "per-file") add(src.path, src.parsed.bookTitle || src.path.split("/").pop()!.replace(/\.json$/i, ""), src);
    else if (src.parsed.bookId) {
      // auto: files carrying the same book_id belong to one book (e.g. one file per chapter)
      add(`id:${src.parsed.bookId.toLowerCase()}`, src.parsed.bookTitle || `Book ${src.parsed.bookId}`, src);
    } else {
      // auto: explicit book title in JSON wins, otherwise the containing folder
      const named = src.parsed.bookTitle || inherited(src);
      const title = named || src.folder.split("/").pop() || src.path.split("/").pop()!.replace(/\.json$/i, "");
      add(named ? `t:${title.toLowerCase()}` : `f:${src.folder || src.path}`, title, src);
    }
  }

  // In single-book mode prefer a title found in any of the files.
  if (mode === "single" && books.has("single")) {
    const b = books.get("single")!;
    b.title = b.sources.find((s) => s.parsed.bookTitle)?.parsed.bookTitle ?? b.title;
  }

  // Assign images to books by folder; unmatched images go to every book.
  const plans = Array.from(books.values());

  // Re-importing a book that already exists keeps the name it has in the library.
  for (const b of plans) {
    if (!b.sources.some((s) => s.parsed.bookTitle)) {
      const existing = await db.books.get(b.id ?? slugify(b.title));
      if (existing) b.title = existing.title;
    }
  }
  for (const img of images) {
    const folder = folderOf(img.path);
    const owners = plans.filter((b) => b.sources.some((s) => s.folder && (folder === s.folder || folder.startsWith(s.folder + "/"))));
    if (!owners.length && plans.length > 1) {
      errors.push(`${img.path}: image ownership is ambiguous across books; place it inside its book folder or import that book separately`);
      continue;
    }
    (owners.length ? owners : plans).forEach((b) => b.images.push(img));
  }
  return { books: plans, images, errors };
}

export interface ImportResult {
  books: number;
  chapters: number;
  questions: number;
  flashcards: number;
  cases: number;
  shortAnswers: number;
  clinicalCases: number;
  images: number;
  atlas: number;
  missingImages: string[];
  warnings: string[];
  unscorable: string[];
  noExplanation: string[];
  unreferencedImages: string[];
  conflictingImageRoles: string[];
  /** answer images the JSON didn't list, attached to their question by file name */
  linked?: number;
  /** questions whose progress moved to a new id (the source text changed) */
  remapped?: number;
}

function refs(list: MediaRef[]): string[] {
  return list.map((m) => m.file);
}

/** Markdown/html image references inside text. */
function inlineRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) out.push(m[1]);
  for (const m of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) out.push(m[1]);
  return out;
}

export async function executeImport(plan: ImportPlan, onProgress?: (msg: string) => void): Promise<ImportResult> {
  const res: ImportResult = { books: 0, chapters: 0, questions: 0, flashcards: 0, cases: 0, shortAnswers: 0, clinicalCases: 0, images: 0, atlas: 0, missingImages: [], warnings: [], unscorable: [], noExplanation: [], unreferencedImages: [], conflictingImageRoles: [] };
  const now = Date.now();

  for (const bp of plan.books) {
    const bookId = bp.id ?? slugify(bp.title);
    onProgress?.(`Importing “${bp.title}”…`);

    const chapters: Chapter[] = [];
    const questions: Question[] = [];
    const flashcards: Flashcard[] = [];
    const cases: CaseScenario[] = [];
    const atlas: AtlasEntry[] = [];
    const referenced = new Set<string>();
    const carriedTags: Annotation[] = [];
    const seenIds = new Set<string>();
    const uniqueId = (base: string) => {
      let id = base;
      let n = 2;
      while (seenIds.has(id)) id = `${base}-${n++}`;
      seenIds.add(id);
      return id;
    };

    let order = 0;
    let chapterOrder = 0;
    // chapters split across files are ordered by their chapter number when every chapter has one
    const allChapters = bp.sources.flatMap((src) => src.parsed.chapters.map((ch) => ({ src, ch })));
    if (allChapters.length > 1 && allChapters.every((x) => x.ch.sortKey !== undefined))
      allChapters.sort((a, b) => a.ch.sortKey! - b.ch.sortKey!);
    const warned = new Set<ParsedSource>();
    for (const { src, ch } of allChapters) {
      if (!warned.has(src)) {
        warned.add(src);
        res.warnings.push(...src.parsed.warnings);
      }
      {
        const chapterId = uniqueId(`${bookId}:${slugify(ch.title)}`);
        chapters.push({ id: chapterId, bookId, title: ch.title, order: chapterOrder++ });
        ch.questions.forEach(({ annotation, ...q }) => {
          const id = uniqueId(`${bookId}:q:${hash(q.stem + "|" + q.options.map((o) => o.text).join("|"))}`);
          questions.push({ ...q, ...(q.groupId ? { groupId: `${chapterId}:${q.groupId}` } : {}), id, bookId, chapterId, order: order++ });
          if (annotation) carriedTags.push({ ...annotation, id, kind: "question" });
          [...refs(q.stemMedia), ...refs(q.explanationMedia), ...q.options.flatMap((o) => refs(o.media)), ...inlineRefs(q.stem), ...inlineRefs(q.explanation), ...q.options.flatMap((o) => inlineRefs(o.text))].forEach((r) => referenced.add(r));
        });
        ch.flashcards.forEach(({ annotation, ...f }) => {
          const id = uniqueId(`${bookId}:f:${hash(f.front + "|" + f.back)}`);
          flashcards.push({ ...f, id, bookId, chapterId, origin: "imported", createdAt: now });
          if (annotation) carriedTags.push({ ...annotation, id, kind: "flashcard" });
          [...refs(f.frontMedia), ...refs(f.backMedia), ...inlineRefs(f.front), ...inlineRefs(f.back)].forEach((r) => referenced.add(r));
        });
        ch.cases.forEach(({ annotation, ...c }) => {
          const id = uniqueId(`${bookId}:c:${hash(c.title + "|" + c.presentation)}`);
          cases.push({ ...c, id, bookId, chapterId, origin: "imported", createdAt: now });
          if (annotation) carriedTags.push({ ...annotation, id, kind: "case" });
          [...refs(c.presentationMedia), ...c.stages.flatMap((s) => [...refs(s.media), ...refs(s.answerMedia ?? []), ...inlineRefs(s.content), ...inlineRefs(s.question ?? ""), ...inlineRefs(s.answer ?? "")]), ...inlineRefs(c.presentation), ...inlineRefs(c.discussion)].forEach((r) => referenced.add(r));
        });
      }
    }

    for (const src of bp.sources) for (const a of src.atlas ?? []) {
      const chapter = chapters.find((ch) => ch.title === a.topic);
      if (!chapter) throw new Error(`Atlas topic “${a.topic}” has no chapter`);
      atlas.push({ ...a, id: uniqueId(`${bookId}:atlas:${hash(a.file)}`), bookId, chapterId: chapter.id });
      referenced.add(a.file);
    }

    const media: MediaFile[] = bp.images.map((img) => {
      const name = normaliseFileName(img.path);
      return { id: `${bookId}/${name}`, bookId, name, blob: img.blob };
    });
    const names = new Set<string>();
    for (const m of media) {
      if (names.has(m.name)) throw new Error(`Ambiguous image name in “${bp.title}”: ${m.name}. Rename or separate same-named files before importing.`);
      names.add(m.name);
    }
    res.linked = (res.linked ?? 0) + linkOrphanAnswerImages(media, questions, referenced);
    const available = new Set(media.map((m) => m.name));
    const availableNoExt = new Set(media.map((m) => m.name.replace(/\.[a-z0-9]+$/, "")));
    const existing = new Set((await db.media.where("bookId").equals(bookId).primaryKeys()).map((k) => String(k).slice(bookId.length + 1)));
    for (const r of referenced) {
      if (/^(data:|https?:|blob:)/.test(r)) continue;
      const n = normaliseFileName(r);
      if (!available.has(n) && !availableNoExt.has(n.replace(/\.[a-z0-9]+$/, "")) && !existing.has(n)) res.missingImages.push(`${bp.title}: ${r}`);
    }

    const book: Book = {
      id: bookId,
      title: bp.title,
      sources: bp.sources.map((s) => s.path),
      importedAt: now,
      questionCount: questions.length,
      flashcardCount: flashcards.length,
      caseCount: cases.length
    };
    res.shortAnswers += cases.filter((c) => c.kind === "qa").reduce((n, c) => n + c.stages.length, 0);
    res.clinicalCases += cases.filter((c) => c.kind !== "qa").length;

    const previous = await previousQuestions(bookId);

    await db.transaction("rw", [db.books, db.chapters, db.questions, db.flashcards, db.cases, db.media, db.atlas], async () => {
      // Replace the book's content; user progress lives in other tables keyed
      // by the same stable ids, so it survives a re-import.
      await db.chapters.where("bookId").equals(bookId).delete();
      await db.questions.where("bookId").equals(bookId).delete();
      await db.flashcards.where("bookId").equals(bookId).delete();
      await db.cases.where("bookId").equals(bookId).delete();
      await db.atlas.where("bookId").equals(bookId).delete();
      await db.books.put(book);
      await db.chapters.bulkPut(chapters);
      await db.questions.bulkPut(questions);
      await db.flashcards.bulkPut(flashcards);
      await db.cases.bulkPut(cases);
      await db.atlas.bulkPut(atlas);
      if (media.length) await db.media.bulkPut(media);
    });

    // a corrected extraction changes question ids: carry progress across by the source's own id
    res.remapped = (res.remapped ?? 0) + (await carryProgress(previous, questions, chapters));

    // the learner's own fixes survive a re-import
    await reapplyCorrections(questions.map((q) => q.id), true);

    // Tags exported from another device: keep whichever is newer, and never
    // replace AI/manual tags with keyword ones.
    if (carriedTags.length) {
      const local = await db.annotations.bulkGet(carriedTags.map((a) => a.id));
      const rank = { local: 0, ai: 1, manual: 2 } as const;
      await db.annotations.bulkPut(
        carriedTags.filter((a, i) => {
          const l = local[i];
          return !l || rank[a.source] > rank[l.source] || (rank[a.source] === rank[l.source] && a.updatedAt > l.updatedAt);
        })
      );
    }

    res.books++;
    res.chapters += chapters.length;
    res.questions += questions.length;
    res.flashcards += flashcards.length;
    res.cases += cases.length;
    res.images += media.length;
    res.atlas += atlas.length;
    const allMedia = (await db.media.where("bookId").equals(bookId).primaryKeys()).map((k) => String(k).slice(bookId.length + 1));
    const quality = auditBook(questions, allMedia, referenced);
    res.unscorable.push(...quality.unscorable.map((q) => `${bp.title} / ${chapters.find((c) => c.id === q.chapterId)?.title ?? ""} / Q${q.number}: ${q.sourceId ?? q.id}`));
    res.noExplanation.push(...quality.noExplanation.map((q) => `${bp.title} / Q${q.number}`));
    res.unreferencedImages.push(...quality.unreferencedImages.map((n) => `${bp.title}: ${n}`));
    res.conflictingImageRoles.push(...quality.conflictingImageRoles.map((n) => `${bp.title}: ${n}`));
  }
  return res;
}

/**
 * Explanation figures/tables the JSON forgot to list ("Refer to Table 1.41A"
 * with no answer_images) but that are in the book's images, named after the
 * question: "…_ch1_q41_tblA.png", "…_ch1_q79-83_figA.png" (chapter 1,
 * questions 79–83). Attached to the explanation of each question in range.
 */
export function linkOrphanAnswerImages(media: MediaFile[], questions: Question[], referenced: Set<string>): number {
  const stem = (n: string) => normaliseFileName(n).replace(/\.[a-z0-9]+$/, "");
  const used = new Set(Array.from(referenced, stem));
  const bySource = new Map(questions.filter((q) => q.sourceId).map((q) => [q.sourceId!.toLowerCase(), q]));
  let linked = 0;
  for (const m of media) {
    const name = stem(m.name);
    if (used.has(name)) continue;
    const x = /(?:^|_)ch0*(\d+)_q0*(\d+)(?:-0*(\d+))?_(?:fig|tbl|table)a(?:_?\d+)?$/i.exec(name);
    if (!x) continue;
    const [c, from, to] = [x[1], Number(x[2]), Number(x[3] ?? x[2])];
    for (let n = from; n <= to && n - from < 30; n++) {
      const q = bySource.get(`${c}.${n}`);
      if (!q || q.explanationMedia.some((e) => stem(e.file) === name)) continue;
      q.explanationMedia = [...q.explanationMedia, { file: m.name }];
      linked++;
    }
  }
  return linked;
}

interface PrevQuestion {
  id: string;
  key: string;
  sourceId?: string;
}

async function previousQuestions(bookId: string): Promise<PrevQuestion[]> {
  const [qs, chs] = await Promise.all([db.questions.where("bookId").equals(bookId).toArray(), db.chapters.where("bookId").equals(bookId).toArray()]);
  const title = new Map(chs.map((c) => [c.id, c.title]));
  return qs.map((q) => ({ id: q.id, sourceId: q.sourceId, key: `${title.get(q.chapterId) ?? ""}|${q.sourceId ?? ""}` }));
}

/**
 * Question ids hash the stem and options, so fixing a typo in the source gives
 * a question a new id. When a new question's id is unknown but an old question
 * that disappeared has the same source id (in the same chapter, or unique in the
 * book), its progress, tags, corrections, AI review and test answers move over.
 * Old rows are kept: another device may still have the old version of the book.
 */
export async function carryProgress(previous: PrevQuestion[], questions: Question[], chapters: Chapter[]): Promise<number> {
  if (!previous.length) return 0;
  const newIds = new Set(questions.map((q) => q.id));
  const gone = previous.filter((p) => p.sourceId && !newIds.has(p.id));
  if (!gone.length) return 0;
  const unique = <T,>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, T | null>();
    for (const x of list) m.set(key(x), m.has(key(x)) ? null : x);
    return m;
  };
  const oldIds = new Set(previous.map((p) => p.id));
  const title = new Map(chapters.map((c) => [c.id, c.title]));
  const fresh = questions.filter((q) => q.sourceId && !oldIds.has(q.id));
  const goneByKey = unique(gone, (p) => p.key);
  const goneBySource = unique(gone, (p) => p.sourceId!);
  const freshByKey = unique(fresh, (q) => `${title.get(q.chapterId) ?? ""}|${q.sourceId}`);
  const freshBySource = unique(fresh, (q) => q.sourceId!);
  const moves = new Map<string, string>();
  for (const q of fresh) {
    const key = `${title.get(q.chapterId) ?? ""}|${q.sourceId}`;
    const from = (freshByKey.get(key) && goneByKey.get(key)) || (freshBySource.get(q.sourceId!) && goneBySource.get(q.sourceId!));
    if (from && ![...moves.values()].includes(from.id)) moves.set(q.id, from.id);
  }
  if (!moves.size) return 0;

  const to = [...moves.keys()];
  const from = to.map((id) => moves.get(id)!);
  const back = new Map(to.map((id, i) => [from[i], id]));
  const newQuestion = new Map(questions.map((q) => [q.id, q]));
  const remapSession = (s: QuizSession): QuizSession => {
    const map = (id: string) => back.get(id) ?? id;
    return { ...s, questionIds: s.questionIds.map(map),
      answers: Object.fromEntries(Object.entries(s.answers).map(([k, a]) => [map(k), { ...a, questionId: map(k) }])),
      ...(s.optionOrder ? { optionOrder: Object.fromEntries(Object.entries(s.optionOrder).map(([k, v]) => [map(k), v])) } : {}),
      updatedAt: Date.now() };
  };
  const remapCard = (card: Flashcard): Flashcard | null => {
    const target = card.questionId && back.get(card.questionId);
    if (!target) return null;
    const id = card.id === `gen:${card.questionId}` ? `gen:${target}`
      : card.id.startsWith(`ai:${card.questionId}:`) ? `ai:${target}:${card.id.slice(`ai:${card.questionId}:`.length)}` : card.id;
    const refreshed = card.id.startsWith("gen:") && newQuestion.has(target) ? questionToCard(newQuestion.get(target)!) : null;
    return { ...card, ...(refreshed ? { front: refreshed.front, back: refreshed.back, frontMedia: refreshed.frontMedia, backMedia: refreshed.backMedia } : {}), id, questionId: target, updatedAt: Date.now() };
  };
  await db.transaction("rw", [db.questionStates, db.annotations, db.corrections, db.aiReviews, db.sessions, db.userFlashcards, db.cardStates, db.profileSnapshots, db.tombstones, db.meta], async () => {
    const activeDefault = (await getMeta("profile:active", "default")) === "default";
    const copy = async <T extends object>(table: import("dexie").Table<T, string>, field: keyof T) => {
      const [olds, existing] = await Promise.all([table.bulkGet(from), table.bulkGet(to)]);
      const rows = olds.flatMap((row, i) => (row && !existing[i] ? [{ ...row, [field]: to[i], updatedAt: Date.now() } as T] : []));
      if (rows.length) await table.bulkPut(rows);
    };
    await copy(db.questionStates, "questionId");
    await copy(db.annotations, "id");
    await copy(db.corrections, "questionId");
    await copy(db.aiReviews, "questionId");
    const sessions = await db.sessions.toArray();
    for (const s of sessions) {
      if (!s.questionIds.some((id) => back.has(id))) continue;
      await db.sessions.put(remapSession(s));
    }
    const oldCards = await db.userFlashcards.where("questionId").anyOf(from).toArray();
    for (const old of oldCards) {
      const card = remapCard(old);
      if (!card) continue;
      await db.userFlashcards.put(card);
      if (card.id !== old.id) {
        const state = await db.cardStates.get(old.id);
        if (state && !(await db.cardStates.get(card.id))) await db.cardStates.put({ ...state, cardId: card.id, updatedAt: Date.now() });
        await db.userFlashcards.delete(old.id);
        await db.cardStates.delete(old.id);
        if (activeDefault) for (const [table, id] of [["userFlashcards", old.id], ["cardStates", old.id]] as const)
          await db.tombstones.put({ key: `${table}:${id}`, table, id, updatedAt: Date.now() });
      }
    }
    // Inactive profiles live in snapshots; apply the same identity move before a
    // later switch restores their rows. They contain progress, not the book media.
    for (const snapshot of await db.profileSnapshots.toArray()) {
      const type = snapshot.key.split(":").at(-1);
      if (type === "questionStates") {
        const rows = snapshot.rows as QuestionState[];
        const existing = new Set(rows.map((r) => r.questionId));
        const additional = rows.flatMap((r) => {
          const target = back.get(r.questionId);
          return target && !existing.has(target) ? [{ ...r, questionId: target, updatedAt: Date.now() }] : [];
        });
        if (additional.length) await db.profileSnapshots.put({ ...snapshot, rows: [...rows, ...additional] });
      } else if (type === "sessions") {
        const rows = snapshot.rows as QuizSession[];
        if (rows.some((s) => s.questionIds.some((id) => back.has(id))))
          await db.profileSnapshots.put({ ...snapshot, rows: rows.map((s) => s.questionIds.some((id) => back.has(id)) ? remapSession(s) : s) });
      } else if (type === "userFlashcards") {
        const rows = snapshot.rows as Flashcard[];
        if (rows.some((c) => c.questionId && back.has(c.questionId)))
          await db.profileSnapshots.put({ ...snapshot, rows: rows.map((c) => remapCard(c) ?? c) });
      } else if (type === "cardStates") {
        const rows = snapshot.rows as CardState[];
        const mapCardId = (id: string) => {
          for (const [old, target] of back) {
            if (id === `gen:${old}`) return `gen:${target}`;
            if (id.startsWith(`ai:${old}:`)) return `ai:${target}:${id.slice(`ai:${old}:`.length)}`;
          }
          return id;
        };
        if (rows.some((r) => mapCardId(r.cardId) !== r.cardId))
          await db.profileSnapshots.put({ ...snapshot, rows: rows.map((r) => ({ ...r, cardId: mapCardId(r.cardId), updatedAt: Date.now() })) });
      }
    }
  });
  return moves.size;
}

export async function deleteBook(bookId: string): Promise<void> {
  await db.transaction("rw", [db.books, db.chapters, db.questions, db.flashcards, db.cases, db.media, db.atlas], async () => {
    await db.chapters.where("bookId").equals(bookId).delete();
    await db.questions.where("bookId").equals(bookId).delete();
    await db.flashcards.where("bookId").equals(bookId).delete();
    await db.cases.where("bookId").equals(bookId).delete();
    await db.atlas.where("bookId").equals(bookId).delete();
    await db.media.where("bookId").equals(bookId).delete();
    await db.books.delete(bookId);
  });
}
