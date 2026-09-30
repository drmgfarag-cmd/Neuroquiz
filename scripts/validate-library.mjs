#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const libraryDir = join(root, "library");
const sourceDir = join(libraryDir, "sources");
const mediaDir = join(libraryDir, "media");
const metadataOnly = process.env.LIBRARY_VALIDATE_METADATA_ONLY === "1";

const allowedKinds = new Set(["question-bank", "hybrid-question-bank", "case-book", "visual-atlas", "reference-corpus"]);
const allowedStatuses = new Set(["draft", "review", "ready", "retired"]);
const sourceFiles = existsSync(sourceDir) ? readdirSync(sourceDir) : [];
const sourceSet = new Set(sourceFiles);
const booksPath = join(libraryDir, "books.json");
if (!existsSync(booksPath)) throw new Error("Missing library/books.json");
const manifest = JSON.parse(readFileSync(booksPath, "utf8"));
const books = manifest.books;
if (!Array.isArray(books)) throw new Error("library/books.json must contain a books array");

const errors = [];
const warnings = [];
const declared = new Set();
const sourceGroups = new Map();
const resultBooks = [];

function sourceGroup(source) {
  return source.replace(/\.part\d+$|\.\d{3}$/i, "");
}

function checkSource(book, source) {
  const sourceName = basename(source);
  declared.add(sourceName);
  sourceGroups.set(sourceGroup(sourceName), true);
  if (metadataOnly || book.status === "retired") return { source, present: null, parts: null };
  if (!sourceSet.has(sourceName)) {
    errors.push(`${book.id}: missing source ${source}`);
    return { source, present: false, parts: 0 };
  }
  const split = sourceName.match(/^(.*\.zip)(\.part|\.)(001)$/i);
  if (!split) return { source, present: true, parts: 1 };
  let parts = 0;
  for (let n = 1; ; n++) {
    const part = `${split[1]}${split[2]}${String(n).padStart(3, "0")}`;
    if (!sourceSet.has(part)) break;
    parts++;
  }
  if (parts < 2) errors.push(`${book.id}: split source ${source} has no continuation parts`);
  if (parts >= 2) {
    const extension = split[2];
    const missing = [];
    for (let n = 1; n <= parts; n++) {
      const part = `${split[1]}${extension}${String(n).padStart(3, "0")}`;
      if (!sourceSet.has(part)) missing.push(part);
    }
    if (missing.length) errors.push(`${book.id}: missing split parts ${missing.join(", ")}`);
  }
  return { source, present: true, parts };
}

function checkMediaSource(book, source) {
  const path = join(libraryDir, source);
  const present = metadataOnly || book.status === "retired" || existsSync(path);
  if (!present) errors.push(`${book.id}: missing media source ${source}`);
  return { source, present };
}

for (const book of books) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(book.id)) errors.push(`Invalid book id: ${book.id}`);
  if (!book.title) errors.push(`${book.id}: missing title`);
  if (!allowedKinds.has(book.kind)) errors.push(`${book.id}: invalid or missing kind`);
  if (!book.schema) errors.push(`${book.id}: missing schema`);
  if (!book.adapter) errors.push(`${book.id}: missing adapter`);
  if (!allowedStatuses.has(book.status)) errors.push(`${book.id}: invalid or missing status`);
  if (typeof book.quizEligible !== "boolean") errors.push(`${book.id}: quizEligible must be boolean`);
  if (book.kind === "case-book" || book.kind === "visual-atlas" || book.kind === "reference-corpus") {
    if (book.quizEligible) errors.push(`${book.id}: non-question content cannot be quiz eligible`);
  }
  const sources = Array.isArray(book.source) ? book.source : [book.source];
  if (!sources.length || sources.some((source) => typeof source !== "string" || !source)) errors.push(`${book.id}: missing source`);
  const checked = sources.filter((source) => typeof source === "string").map((source) => checkSource(book, source));
  const mediaSources = Array.isArray(book.mediaSource) ? book.mediaSource : book.mediaSource ? [book.mediaSource] : [];
  const checkedMedia = mediaSources.filter((source) => typeof source === "string").map((source) => checkMediaSource(book, source));
  if (book.primaryJson && !book.source) errors.push(`${book.id}: primaryJson has no source`);
  if (book.primaryJson) {
    const primaryName = basename(book.primaryJson);
    if (sourceSet.has(primaryName)) {
      declared.add(primaryName);
      sourceGroups.set(sourceGroup(primaryName), true);
    }
  }
  resultBooks.push({ id: book.id, kind: book.kind, status: book.status, sourceCount: checked.length, mediaSourceCount: checkedMedia.length, sources: checked, mediaSources: checkedMedia });
}

if (!metadataOnly && sourceFiles.length) {
  const orphans = sourceFiles.filter((file) => ![...sourceGroups.keys()].some((group) => file === group || file.startsWith(`${group}.`)));
  if (orphans.length) warnings.push(`${orphans.length} undeclared source files/groups remain staged`);
}

const report = {
  format: 1,
  metadataOnly,
  bookCount: books.length,
  counts: {
    questionBanks: books.filter((book) => book.kind === "question-bank" || book.kind === "hybrid-question-bank").length,
    caseBooks: books.filter((book) => book.kind === "case-book").length,
    atlases: books.filter((book) => book.kind === "visual-atlas").length,
    references: books.filter((book) => book.kind === "reference-corpus").length,
    ready: books.filter((book) => book.status === "ready").length,
    staged: books.filter((book) => book.status !== "ready").length
  },
  errors,
  warnings,
  books: resultBooks
};

const reportPath = process.env.LIBRARY_VALIDATION_REPORT || join(libraryDir, "validation-report.json");
if (existsSync(libraryDir)) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(`validate-library: ${report.bookCount} books; ${report.counts.ready} ready; ${errors.length} errors; ${warnings.length} warnings`);
if (warnings.length) warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
if (errors.length) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exitCode = 1;
}
