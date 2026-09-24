#!/usr/bin/env node
/**
 * Unpacks the books listed in library/books.json into public/library/ so the
 * app ships with them (web, Android and Windows builds all read from there).
 *
 *   public/library/index.json            list of books + files + version
 *   public/library/<id>/<files…>         JSON and images, unzipped
 *
 * Runs automatically before `npm run build` / `npm run dev`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const libDir = join(root, "library");
const outDir = join(root, "public", "library");
const KEEP = /\.(json|png|jpe?g|gif|webp|svg|avif)$/i;

/**
 * Reads a source file. "book.zip.001" means a ZIP split into numbered parts
 * (to get past upload size limits): .001, .002, … are joined in order.
 */
function readSource(src) {
  const path = join(libDir, src);
  if (!/\.001$/.test(src)) return readFileSync(path);
  const parts = [];
  for (let n = 1; ; n++) {
    const part = path.replace(/\.001$/, "." + String(n).padStart(3, "0"));
    if (!existsSync(part)) break;
    parts.push(readFileSync(part));
  }
  return Buffer.concat(parts);
}

rmSync(outDir, { recursive: true, force: true });
const listFile = join(libDir, "books.json");
if (!existsSync(listFile)) {
  console.log("build-library: no library/books.json – app ships without built-in books");
  process.exit(0);
}
const { books } = JSON.parse(readFileSync(listFile, "utf8"));
const index = { books: [] };

for (const book of books) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(book.id)) throw new Error(`book id "${book.id}" must be lower-case letters, digits or dashes`);
  const sources = Array.isArray(book.source) ? book.source : [book.source];
  const hash = createHash("sha256");
  const files = [];
  const write = (rel, data) => {
    const target = join(outDir, book.id, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    files.push(posix.join(book.id, rel));
  };
  for (const src of sources) {
    const data = readSource(src);
    hash.update(data);
    if (/\.zip(\.001)?$/i.test(src)) {
      const zip = await JSZip.loadAsync(data);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(entry.name) || !KEEP.test(entry.name)) continue;
        write(entry.name, await entry.async("nodebuffer"));
      }
    } else write(posix.basename(src), data);
  }
  index.books.push({ id: book.id, title: book.title, version: hash.digest("hex").slice(0, 16), files: files.sort() });
  console.log(`build-library: ${book.id} – ${files.length} files`);
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 1));
