import JSZip from "jszip";
import { reapplyCorrections } from "../lib/corrections";
import { db } from "../lib/db";
import type { Annotation, Book, CaseScenario, Chapter, Flashcard, MediaFile, MediaRef, Question } from "../lib/types";
import { hash, IMAGE_EXT, normaliseFileName, slugify } from "../lib/util";
import { normalizeBookJson, type ParsedFile } from "./normalize";

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
const NOT_A_BOOK = /(^|\/)[^/]*(audit|page_ocr|ocr_pages|manifest)[^/]*\.json$|contact_sheet/i;

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
  for (const f of files) {
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
      // a JSON without questions (a report, a settings file) doesn't become a book
      if (p.chapters.length) parsed.push({ path: f.path, folder: folderOf(f.path), parsed: p });
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
  images: number;
  missingImages: string[];
  warnings: string[];
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
  const res: ImportResult = { books: 0, chapters: 0, questions: 0, flashcards: 0, cases: 0, images: 0, missingImages: [], warnings: [] };
  const now = Date.now();

  for (const bp of plan.books) {
    const bookId = bp.id ?? slugify(bp.title);
    onProgress?.(`Importing “${bp.title}”…`);

    const chapters: Chapter[] = [];
    const questions: Question[] = [];
    const flashcards: Flashcard[] = [];
    const cases: CaseScenario[] = [];
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
          [...refs(c.presentationMedia), ...c.stages.flatMap((s) => refs(s.media)), ...inlineRefs(c.presentation), ...inlineRefs(c.discussion)].forEach((r) => referenced.add(r));
        });
      }
    }

    const media: MediaFile[] = bp.images.map((img) => {
      const name = normaliseFileName(img.path);
      return { id: `${bookId}/${name}`, bookId, name, blob: img.blob };
    });
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

    await db.transaction("rw", [db.books, db.chapters, db.questions, db.flashcards, db.cases, db.media], async () => {
      // Replace the book's content; user progress lives in other tables keyed
      // by the same stable ids, so it survives a re-import.
      await db.chapters.where("bookId").equals(bookId).delete();
      await db.questions.where("bookId").equals(bookId).delete();
      await db.flashcards.where("bookId").equals(bookId).delete();
      await db.cases.where("bookId").equals(bookId).delete();
      await db.books.put(book);
      await db.chapters.bulkPut(chapters);
      await db.questions.bulkPut(questions);
      await db.flashcards.bulkPut(flashcards);
      await db.cases.bulkPut(cases);
      if (media.length) await db.media.bulkPut(media);
    });

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
  }
  return res;
}

export async function deleteBook(bookId: string): Promise<void> {
  await db.transaction("rw", [db.books, db.chapters, db.questions, db.flashcards, db.cases, db.media], async () => {
    await db.chapters.where("bookId").equals(bookId).delete();
    await db.questions.where("bookId").equals(bookId).delete();
    await db.flashcards.where("bookId").equals(bookId).delete();
    await db.cases.where("bookId").equals(bookId).delete();
    await db.media.where("bookId").equals(bookId).delete();
    await db.books.delete(bookId);
  });
}
