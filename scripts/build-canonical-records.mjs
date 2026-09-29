#!/usr/bin/env node
/**
 * Build compact canonical metadata from the same normalizeBookJson function
 * used by the runtime importer. This keeps build-time tags/media relationships
 * aligned with adapter-normalized records instead of raw JSON heuristics.
 */
import { buildSync } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const libraryRoot = join(root, "public", "library");
const outputRoot = join(libraryRoot, "canonical");
const tempBundle = join(root, ".neuroquiz-normalize.mjs");

buildSync({
  entryPoints: [join(root, "src", "import", "normalize.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: true,
  outfile: tempBundle,
  logLevel: "silent"
});
const { normalizeBookJson } = await import(`${pathToFileURL(tempBundle).href}?v=${Date.now()}`);

const stableHash = (str, seed = 0) => {
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
};
const text = (value) => typeof value === "string" ? value.trim() : "";
const mediaFiles = (items) => [...new Set((items ?? []).map((item) => item?.file).filter(Boolean))];
const questionId = (bookId, q) => `${bookId}:q:${stableHash(`${q.stem}|${q.options.map((o) => `${o.key}=${o.text}`).join("|")}`)}`;
const caseId = (bookId, c) => `${bookId}:c:${stableHash(`${c.title}|${c.presentation}`)}`;
const clean = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
const canonicalTags = (tags, chapter, annotation, section) => [...new Set([
  ...(tags ?? []),
  ...(annotation?.topic ? [annotation.topic] : []),
  ...(annotation?.subtopic ? [annotation.subtopic] : []),
  ...(annotation?.tags ?? []),
  ...(annotation?.keywords ?? []),
  ...(chapter ? [`chapter:${chapter}`] : []),
  ...(section ? [`section:${section}`] : [])
].map(text).filter(Boolean).map(clean))];
const search = (...parts) => clean(parts.flat().filter(Boolean).join(" "));

mkdirSync(outputRoot, { recursive: true });
const catalog = JSON.parse(readFileSync(join(libraryRoot, "index.json"), "utf8"));
const output = { format: 1, generatedAt: new Date().toISOString(), books: {} };
let questionCount = 0;
let caseCount = 0;

for (const book of catalog.books ?? []) {
  const questions = {};
  const cases = {};
  for (const file of (book.files ?? []).filter((name) => /\.json$/i.test(name) && !name.includes("/canonical/"))) {
    const absolute = join(libraryRoot, file);
    if (!existsSync(absolute)) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(absolute, "utf8")); } catch { continue; }
    const normalized = normalizeBookJson(parsed, { numericAnswerBase: 1, fileName: file });
    for (const chapter of normalized.chapters) {
      for (const q of chapter.questions) {
        const id = questionId(book.id, q);
        const paths = mediaFiles([
          ...q.stemMedia,
          ...q.explanationMedia,
          ...q.options.flatMap((option) => option.media)
        ]);
        questions[id] = {
          id,
          kind: "question",
          bookId: book.id,
          title: q.stem.slice(0, 180) || `${book.title} question`,
          searchText: search(q.stem, q.options.map((option) => option.text), q.explanation, q.sourceTags),
          tags: canonicalTags(q.sourceTags, chapter.title, q.annotation, q.section),
          topics: canonicalTags(q.sourceTags, chapter.title, q.annotation, q.section),
          mediaPaths: paths,
          sourceTags: [...q.sourceTags],
          chapter: chapter.title,
          section: q.section,
          format: q.format,
          sourcePath: file,
          recordPath: `chapter:${chapter.title}/question:${q.number}`,
          quizEligible: book.quizEligible && book.kind !== "case-book" && book.kind !== "visual-atlas" && book.kind !== "reference-corpus",
          indexQuality: "canonical",
          canonical: true
        };
      }
      for (const c of chapter.cases) {
        const id = caseId(book.id, c);
        const paths = mediaFiles([
          ...c.presentationMedia,
          ...c.stages.flatMap((stage) => [...stage.media, ...(stage.answerMedia ?? [])])
        ]);
        cases[id] = {
          id,
          kind: "case",
          bookId: book.id,
          title: c.title,
          searchText: search(c.title, c.presentation, c.stages.map((stage) => [stage.title, stage.content, stage.question, stage.answer]), c.discussion, c.sourceTags),
          tags: canonicalTags(c.sourceTags, chapter.title, c.annotation),
          topics: canonicalTags(c.sourceTags, chapter.title, c.annotation),
          mediaPaths: paths,
          sourceTags: [...c.sourceTags],
          chapter: chapter.title,
          sourcePath: file,
          recordPath: `chapter:${chapter.title}/case:${c.title}`,
          indexQuality: "canonical",
          canonical: true
        };
      }
    }
  }
  output.books[book.id] = { ready: true, questions, cases };
  questionCount += Object.keys(questions).length;
  caseCount += Object.keys(cases).length;
}

writeFileSync(join(outputRoot, "index.json"), JSON.stringify(output));
console.log(`canonical-records: ${Object.keys(output.books).length} books, ${questionCount} questions, ${caseCount} cases`);
