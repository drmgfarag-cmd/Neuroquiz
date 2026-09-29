#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import JSZip from "jszip";

const root = resolve(new URL("..", import.meta.url).pathname);
const library = join(root, "library");
const sourceDir = join(library, "sources");
const manifest = JSON.parse(readFileSync(join(library, "books.json"), "utf8"));
const sourceFiles = new Set(readdirSync(sourceDir));
const issues = [];
const stats = { files: 0, jsonFiles: 0, invalidJson: 0, strings: 0, characters: 0 };

function readSource(source) {
  const name = basename(source);
  const split = name.match(/^(.*\.zip)(\.part|\.)(001)$/i);
  if (!split) return readFileSync(join(sourceDir, name));
  const parts = [];
  for (let n = 1; ; n++) {
    const part = `${split[1]}${split[2]}${String(n).padStart(3, "0")}`;
    if (!sourceFiles.has(part)) break;
    parts.push(readFileSync(join(sourceDir, part)));
  }
  return Buffer.concat(parts);
}

function addIssue(bookId, file, path, type, sample) {
  issues.push({ bookId, file, path, type, sample: sample.slice(0, 180) });
}

function inspectValue(value, bookId, file, path = "$") {
  if (typeof value === "string") {
    stats.strings++;
    stats.characters += value.length;
    if (/\ufffd/.test(value)) addIssue(bookId, file, path, "replacement-character", value);
    if (/[ÃÂâ][\u0080-\u00bf]|ðŸ/.test(value)) addIssue(bookId, file, path, "mojibake", value);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) addIssue(bookId, file, path, "control-character", value);
    if (/[ \t]+[,.;:!?]/.test(value)) addIssue(bookId, file, path, "space-before-punctuation", value);
    if (/[ \t]{2,}/.test(value)) addIssue(bookId, file, path, "repeated-spacing", value);
    if (/\p{L}-\s*\n\s*\p{L}/u.test(value)) addIssue(bookId, file, path, "line-break-hyphen", value);
    if (/\s[-‐‑‒–—]\s/.test(value)) addIssue(bookId, file, path, "mixed-dash-spacing", value);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, i) => inspectValue(item, bookId, file, `${path}[${i}]`));
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) inspectValue(child, bookId, file, `${path}.${key}`);
}

async function inspectJson(bookId, file, text) {
  stats.jsonFiles++;
  try { inspectValue(JSON.parse(text), bookId, file); }
  catch (error) { stats.invalidJson++; addIssue(bookId, file, "$", "invalid-json", error.message); }
}

for (const book of manifest.books) {
  const sources = Array.isArray(book.source) ? book.source : [book.source];
  for (const source of sources) {
    const bytes = readSource(source);
    stats.files++;
    if (/\.json$/i.test(source)) {
      await inspectJson(book.id, source, bytes.toString("utf8"));
      continue;
    }
    const zip = await JSZip.loadAsync(bytes);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || !/\.json$/i.test(entry.name)) continue;
      await inspectJson(book.id, `${basename(source)}::${entry.name}`, await entry.async("string"));
    }
  }
}

const byType = Object.fromEntries([...new Set(issues.map((x) => x.type))].map((type) => [type, issues.filter((x) => x.type === type).length]));
const report = {
  format: 1,
  generatedAt: new Date().toISOString(),
  scope: "declared source JSON files and JSON members of declared archives",
  stats,
  issueCounts: byType,
  issues
};
const output = process.env.JSON_AUDIT_REPORT || join(library, "json-text-audit.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`json-text-audit: ${stats.jsonFiles} JSON files; ${stats.strings} strings; ${issues.length} findings`);
for (const [type, count] of Object.entries(byType)) console.log(`  ${type}: ${count}`);
