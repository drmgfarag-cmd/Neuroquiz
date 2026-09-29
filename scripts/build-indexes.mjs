#!/usr/bin/env node
/**
 * Generate compact, searchable indexes from the already-built local library.
 * Bodies and media remain in public/library/<book>; indexes contain metadata only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const libraryDir = join(root, "public", "library");
const indexesDir = join(root, "public", "indexes");
const JSON_EXT = /\.json$/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const TEXT_KEYS = ["title", "name", "question", "stem", "prompt", "text", "body", "description", "presentation", "discussion", "answer", "explanation", "rationale", "notes", "keywords", "tags", "topic", "topics", "category", "section", "chapter"];
const TAG_KEYS = ["tags", "keywords", "topic", "topics", "category", "categories", "subject", "subtopic", "section"];

const asText = (value) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const values = (object, keys) => keys.flatMap((key) => {
  const value = object?.[key];
  if (Array.isArray(value)) return value.flatMap((item) => asText(item));
  return [asText(value)];
}).filter(Boolean);
const normalise = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
const stablePart = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "item";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksQuestion(item) {
  if (!isObject(item)) return false;
  const hasStem = ["question", "stem", "question_text", "prompt", "vignette"].some((key) => asText(item[key]));
  const hasOptions = ["options", "choices", "answers", "alternatives", "answer_options"].some((key) => Array.isArray(item[key]) || isObject(item[key]));
  const hasAnswer = ["answer", "correct_answer", "correct", "key", "answer_key", "solution"].some((key) => item[key] !== undefined);
  return hasStem && (hasOptions || hasAnswer);
}

function looksCase(item) {
  if (!isObject(item)) return false;
  return Array.isArray(item.stages) || Array.isArray(item.steps) || Array.isArray(item.parts) && (asText(item.presentation) || asText(item.scenario) || asText(item.vignette));
}

function looksAtlas(item) {
  if (!isObject(item)) return false;
  const file = item.file ?? item.path ?? item.filename ?? item.image ?? item.image_file;
  return typeof file === "string" && (asText(item.title) || asText(item.name) || asText(item.description));
}

function looksReference(item) {
  if (!isObject(item) || looksQuestion(item) || looksCase(item) || looksAtlas(item)) return false;
  const text = asText(item.text) || asText(item.body) || asText(item.content);
  return Boolean(text && (asText(item.title) || asText(item.heading) || asText(item.section) || asText(item.chapter)));
}

function record(book, kind, item, sourcePath, ordinal) {
  const sourceId = asText(item.id) || asText(item.question_id) || asText(item.questionId) || asText(item.number) || asText(item.question_number) || `${ordinal}`;
  const id = `${book.id}:${kind}:${stablePart(sourceId)}`;
  const title = values(item, ["title", "name", "question", "stem", "prompt", "heading", "section"])[0] || `${book.title} ${kind}`;
  const searchText = normalise([...values(item, TEXT_KEYS), ...values(item, ["options", "choices"])].join(" "));
  const tags = [...new Set(values(item, TAG_KEYS).flatMap((value) => value.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean)))];
  return {
    id,
    kind,
    bookId: book.id,
    title,
    searchText,
    tags,
    topics: tags,
    sourcePath,
    quizEligible: kind === "question" && Boolean(book.quizEligible)
  };
}

function collectJsonRecords(book, data, sourcePath, indexes) {
  let ordinal = 0;
  const seen = new WeakSet();
  const visit = (value, path, context = { insideCase: false }) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`, context));
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    ordinal += 1;
    const isCase = looksCase(value);
    if (looksQuestion(value)) indexes.questions.push(record(book, "question", value, sourcePath, ordinal));
    else if (isCase) indexes.cases.push(record(book, "case", value, sourcePath, ordinal));
    else if (looksAtlas(value)) indexes.atlas.push(record(book, "atlas-entry", value, sourcePath, ordinal));
    else if (!context.insideCase && looksReference(value)) indexes.references.push(record(book, "reference-section", value, sourcePath, ordinal));
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, { insideCase: context.insideCase || isCase });
  };
  visit(data, "$" );
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

export function buildIndexes({ libraryRoot = libraryDir, outputRoot = indexesDir } = {}) {
  mkdirSync(outputRoot, { recursive: true });
  const catalogPath = join(libraryRoot, "index.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : { format: 2, books: [] };
  const indexes = { questions: [], cases: [], atlas: [], references: [], media: [], links: [] };

  for (const book of catalog.books ?? []) {
    const jsonFiles = (book.files ?? []).filter((file) => JSON_EXT.test(file));
    for (const file of jsonFiles) {
      const absolute = join(libraryRoot, file);
      if (!existsSync(absolute)) continue;
      try {
        collectJsonRecords(book, JSON.parse(readFileSync(absolute, "utf8")), file, indexes);
      } catch (error) {
        console.warn(`build-indexes: could not parse ${file}: ${error.message}`);
      }
    }
    for (const file of (book.files ?? []).filter((candidate) => MEDIA_EXT.test(candidate))) {
      indexes.media.push({
        id: `${book.id}:media:${stablePart(relative(join(libraryRoot, book.id), join(libraryRoot, file)))}`,
        kind: "media",
        bookId: book.id,
        title: basename(file),
        searchText: normalise(basename(file)),
        tags: [],
        topics: [],
        sourcePath: file
      });
    }
  }

  const deduped = Object.fromEntries(Object.entries(indexes).map(([key, rows]) => [key, dedupe(rows)]));
  const output = {
    format: 1,
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(deduped).map(([key, rows]) => [key, rows.length])),
    ...deduped
  };
  for (const [key, rows] of Object.entries(output)) {
    if (!Array.isArray(rows)) continue;
    writeFileSync(join(outputRoot, `${key}-index.json`), JSON.stringify(rows));
  }
  writeFileSync(join(outputRoot, "index.json"), JSON.stringify({ format: output.format, generatedAt: output.generatedAt, counts: output.counts }));
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = buildIndexes();
  console.log(`build-indexes: ${result.counts.questions} questions, ${result.counts.cases} cases, ${result.counts.atlas} atlas entries, ${result.counts.references} references, ${result.counts.media} media`);
}
