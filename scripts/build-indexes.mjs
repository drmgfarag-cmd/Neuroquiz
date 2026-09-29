#!/usr/bin/env node
/**
 * Generate compact, searchable indexes from the already-built local library.
 * Bodies and media remain in public/library/<book>; indexes contain metadata only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const libraryDir = join(root, "public", "library");
const indexesDir = join(root, "public", "indexes");
const canonicalPath = join(libraryDir, "canonical", "index.json");
const JSON_EXT = /\.json$/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const TEXT_KEYS = ["title", "name", "question", "stem", "prompt", "text", "body", "description", "presentation", "discussion", "answer", "explanation", "rationale", "notes", "keywords", "tags", "topic", "topics", "category", "section", "chapter"];
const TAG_KEYS = ["tags", "keywords", "topic", "topics", "category", "categories", "subject", "subtopic", "section"];
const BROAD_TAGS = new Set(["image", "images", "imaging", "figure", "figures", "medical", "neurosurgery", "neurology", "question", "case"]);

const asText = (value) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const values = (object, keys) => keys.flatMap((key) => {
  const value = object?.[key];
  if (Array.isArray(value)) return value.flatMap((item) => asText(item));
  return [asText(value)];
}).filter(Boolean);
const normalise = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
const stablePart = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "item";

// Keep generated question/case/atlas IDs aligned with src/import/importer.ts.
function stableHash(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mediaPaths(item) {
  const found = [];
  const add = (value) => {
    if (typeof value === "string" && value.trim()) found.push(value.trim());
    else if (isObject(value)) add(value.file ?? value.path ?? value.filename ?? value.image ?? value.src);
  };
  for (const key of ["images", "question_images", "answer_images", "media", "stemMedia", "explanationMedia", "presentationMedia", "questionMedia", "answerMedia", "files", "image", "image_file"]) {
    const value = item[key];
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }
  for (const stage of [item.stages, item.steps, item.parts].filter(Array.isArray).flat()) {
    for (const key of ["media", "answerMedia", "questionMedia", "images", "answer_images"]) {
      const value = stage[key];
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
    }
  }
  for (const text of [asText(item.stem), asText(item.question), asText(item.explanation), asText(item.answer)]) {
    for (const match of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)|<img[^>]+src=["']([^"']+)["']/gi)) add(match[1] ?? match[2]);
  }
  return [...new Set(found)];
}

function assetKey(value) {
  return String(value).replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.[a-z0-9]+$/, "");
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

function record(book, kind, item, sourcePath, recordPath, ordinal, canonicalRecords = {}) {
  const sourceId = asText(item.id) || asText(item.question_id) || asText(item.questionId) || asText(item.number) || asText(item.question_number) || `${ordinal}`;
  const options = item.options ?? item.choices ?? item.answers ?? item.alternatives;
  const optionTexts = Array.isArray(options) ? options.map((option) => isObject(option) ? `${asText(option.key) || asText(option.label) || asText(option.id)}=${asText(option.text) || asText(option.content) || asText(option.value)}` : asText(option)) : isObject(options) ? Object.values(options).map((option) => isObject(option) ? `${asText(option.key) || asText(option.label) || asText(option.id)}=${asText(option.text) || asText(option.content) || asText(option.value)}` : asText(option)) : [];
  const stem = asText(item.stem) || asText(item.question) || asText(item.question_text) || asText(item.prompt) || asText(item.vignette);
  const id = kind === "question" && stem
    ? `${book.id}:q:${stableHash(`${stem}|${optionTexts.join("|")}`)}`
    : kind === "case"
      ? `${book.id}:c:${stableHash(`${asText(item.title) || asText(item.name)}|${asText(item.presentation) || asText(item.scenario) || asText(item.vignette)}`)}`
      : kind === "atlas-entry" && (item.file || item.path || item.filename)
        ? `${book.id}:atlas:${stableHash(asText(item.file) || asText(item.path) || asText(item.filename))}`
        : `${book.id}:${kind}:${stablePart(sourceId)}`;
  const title = values(item, ["title", "name", "question", "stem", "prompt", "heading", "section"])[0] || `${book.title} ${kind}`;
  const searchText = normalise([...values(item, TEXT_KEYS), ...values(item, ["options", "choices"])].join(" "));
  const tags = [...new Set(values(item, TAG_KEYS).flatMap((value) => value.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean)))];
  const canonical = canonicalRecords[id];
  const canonicalTags = canonical?.tags ?? tags;
  const paths = canonical?.mediaPaths ?? mediaPaths(item);
  return {
    id,
    kind,
    bookId: book.id,
    title,
    searchText,
    tags: canonicalTags,
    topics: canonicalTags,
    sourcePath,
    recordPath,
    indexQuality: canonical ? "canonical" : "heuristic",
    ...(paths.length ? { mediaPaths: paths } : {}),
    ...(kind === "atlas-entry" && (item.file || item.path || item.filename || item.image) ? { mediaPath: asText(item.file) || asText(item.path) || asText(item.filename) || asText(item.image) } : {}),
    quizEligible: kind === "question" && Boolean(book.quizEligible)
  };
}

function collectJsonRecords(book, data, sourcePath, indexes, canonicalBook = {}) {
  let ordinal = 0;
  const seen = new WeakSet();
  const visit = (value, path, context = { insideCase: false }) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`, context));
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    ordinal += 1;
    const isCase = looksCase(value);
    if (!canonicalBook.ready && looksQuestion(value)) indexes.questions.push(record(book, "question", value, sourcePath, path, ordinal, canonicalBook.questions));
    else if (!canonicalBook.ready && isCase) indexes.cases.push(record(book, "case", value, sourcePath, path, ordinal, canonicalBook.cases));
    else if (looksAtlas(value)) indexes.atlas.push(record(book, "atlas-entry", value, sourcePath, path, ordinal));
    else if (!context.insideCase && looksReference(value)) indexes.references.push(record(book, "reference-section", value, sourcePath, path, ordinal));
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, { insideCase: context.insideCase || isCase });
  };
  visit(data, "$" );
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

function linkKind(from, to) {
  if (from.kind === "question" && to.kind === "case") return "question-case";
  if (from.kind === "question" && to.kind === "atlas-entry") return "question-atlas";
  if (from.kind === "question" && to.kind === "media") return "question-media";
  if (from.kind === "question" && to.kind === "reference-section") return "question-reference";
  if (from.kind === "case" && to.kind === "atlas-entry") return "case-atlas";
  if (from.kind === "case" && to.kind === "media") return "case-media";
  if (from.kind === "case" && to.kind === "reference-section") return "case-reference";
  if (from.kind === "atlas-entry" && to.kind === "reference-section") return "atlas-reference";
  return null;
}

function sharedLinks(fromRows, toRows, options = {}) {
  const links = [];
  for (const from of fromRows) {
    const fromTags = new Set([...from.tags, ...from.topics].map(normalise).filter((tag) => tag && !BROAD_TAGS.has(tag)));
    if (!fromTags.size) continue;
    const candidates = toRows.map((to) => {
      const toTags = new Set([...to.tags, ...to.topics].map(normalise).filter((tag) => tag && !BROAD_TAGS.has(tag)));
      const overlap = [...fromTags].filter((tag) => toTags.has(tag)).length;
      return { to, overlap, confidence: overlap / Math.max(fromTags.size, toTags.size, 1) };
    }).filter((candidate) => candidate.overlap >= (options.minOverlap ?? 1) && (!options.sameBook || candidate.to.bookId === from.bookId)).sort((a, b) => b.overlap - a.overlap || b.confidence - a.confidence).slice(0, 5);
    for (const candidate of candidates) {
      const kind = linkKind(from, candidate.to);
      if (!kind) continue;
      links.push({
        id: `${from.id}->${candidate.to.id}`,
        fromId: from.id,
        toId: candidate.to.id,
        kind,
        confidence: Number(candidate.confidence.toFixed(3)),
        source: "deterministic",
        basis: "shared-specific-tag",
        verified: false
      });
    }
  }
  return links;
}

function explicitMediaLinks(fromRows, atlasRows) {
  const links = [];
  for (const from of fromRows) {
    const paths = new Set((from.mediaPaths ?? []).map(assetKey));
    if (!paths.size) continue;
    for (const atlas of atlasRows) {
      if (atlas.bookId !== from.bookId || !atlas.mediaPath || !paths.has(assetKey(atlas.mediaPath))) continue;
      atlas.tags = [...new Set([...atlas.tags, ...from.tags])];
      atlas.topics = [...new Set([...atlas.topics, ...from.topics])];
      links.push({
        id: `${from.id}->${atlas.id}`,
        fromId: from.id,
        toId: atlas.id,
        kind: linkKind(from, atlas),
        confidence: 1,
        source: "deterministic",
        basis: "explicit-media",
        verified: false
      });
    }
  }
  return links;
}

export function buildIndexes({ libraryRoot = libraryDir, outputRoot = indexesDir } = {}) {
  mkdirSync(outputRoot, { recursive: true });
  const catalogPath = join(libraryRoot, "index.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : { format: 2, books: [] };
  const canonical = existsSync(join(libraryRoot, "canonical", "index.json"))
    ? JSON.parse(readFileSync(join(libraryRoot, "canonical", "index.json"), "utf8"))
    : { books: {} };
  const indexes = { questions: [], cases: [], atlas: [], references: [], media: [], links: [] };

  for (const book of catalog.books ?? []) {
    const jsonFiles = (book.files ?? []).filter((file) => JSON_EXT.test(file));
    const canonicalBook = canonical.books?.[book.id] ?? {};
    for (const file of jsonFiles) {
      const absolute = join(libraryRoot, file);
      if (!existsSync(absolute)) continue;
      try {
        collectJsonRecords(book, JSON.parse(readFileSync(absolute, "utf8")), file, indexes, canonicalBook);
      } catch (error) {
        console.warn(`build-indexes: could not parse ${file}: ${error.message}`);
      }
    }
    if (canonicalBook.ready) {
      indexes.questions.push(...Object.values(canonicalBook.questions ?? {}));
      indexes.cases.push(...Object.values(canonicalBook.cases ?? {}));
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
        sourcePath: file,
        mediaPath: relative(join(libraryRoot, book.id), join(libraryRoot, file)),
        indexQuality: "heuristic"
      });
    }
  }

  indexes.links.push(
    ...sharedLinks(indexes.questions, indexes.cases, { minOverlap: 2, sameBook: true }),
    ...explicitMediaLinks(indexes.questions, [...indexes.atlas, ...indexes.media]),
    ...sharedLinks(indexes.questions, indexes.references),
    ...explicitMediaLinks(indexes.cases, [...indexes.atlas, ...indexes.media]),
    ...sharedLinks(indexes.cases, indexes.references),
    ...sharedLinks(indexes.atlas, indexes.references)
  );

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
  // Canonical records are a build-time bridge; the compact global indexes are
  // the only copies shipped to the offline app.
  if (resolve(libraryRoot) === resolve(libraryDir)) rmSync(join(libraryRoot, "canonical"), { recursive: true, force: true });
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = buildIndexes();
  console.log(`build-indexes: ${result.counts.questions} questions, ${result.counts.cases} cases, ${result.counts.atlas} atlas entries, ${result.counts.references} references, ${result.counts.media} media`);
}
