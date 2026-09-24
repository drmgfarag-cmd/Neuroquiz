#!/usr/bin/env node
/**
 * Unpacks the books listed in library/books.json into public/library/ so the
 * app ships with them (web, Android and Windows builds all read from there).
 *
 *   public/library/index.json            list of books + files + version
 *   public/library/<id>/<files…>         JSON and images, unzipped
 *
 * Photos and scans are resized to at most 2000 px and stored as WebP, which
 * cuts the library to a fraction of its size (set LIBRARY_ORIGINAL_IMAGES=1
 * to ship the original files). Books reference images by name, and the app
 * finds "fig1.png" when the file is "fig1.webp".
 *
 * LIBRARY_PACK=1 (web preview build): hosts that limit the number of files
 * get each book's images packed into a few "pack-N.json" files of data URIs,
 * at a smaller size (1600 px).
 *
 * Runs automatically before `npm run build` / `npm run dev`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const libDir = join(root, "library");
const outDir = join(root, "public", "library");
const KEEP = /\.(json|png|jpe?g|gif|webp|svg|avif)$/i;
// reports that travel with an extraction but hold no questions
const SKIP = /(^|\/)[^/]*(audit|page_ocr|ocr_pages|manifest)[^/]*\.json$|contact_sheet/i;

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
const OPTIMIZE = !process.env.LIBRARY_ORIGINAL_IMAGES;
const PACK = !!process.env.LIBRARY_PACK;
const MAX_PX = PACK ? 1600 : 2000;
const QUALITY = PACK ? 78 : 82;
const PACK_BYTES = 11e6; // stay well under per-file limits
const stats = { before: 0, after: 0 };

/** Resize/re-encode a raster image; keeps the original when that is smaller. */
async function optimise(rel, data) {
  stats.before += data.length;
  if (!OPTIMIZE || !/\.(png|jpe?g|bmp|tiff?)$/i.test(rel)) {
    stats.after += data.length;
    return [rel, data];
  }
  try {
    const out = await sharp(data).rotate().resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
    if (out.length < data.length) {
      stats.after += out.length;
      return [rel.replace(/\.[a-z]+$/i, ".webp"), out];
    }
  } catch (e) {
    console.warn(`build-library: could not optimise ${rel}: ${e.message}`);
  }
  stats.after += data.length;
  return [rel, data];
}

for (const book of books) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(book.id)) throw new Error(`book id "${book.id}" must be lower-case letters, digits or dashes`);
  const sources = Array.isArray(book.source) ? book.source : [book.source];
  const hash = createHash("sha256");
  // book settings change the installed content too
  if (book.questionImages) hash.update(`questionImages=${book.questionImages}`);
  const files = [];
  const packed = []; // [path, data] for LIBRARY_PACK
  const write = (rel, data) => {
    // "questionImages": "referenced-only" → images the question doesn't refer to go with the answer
    if (book.questionImages === "referenced-only" && /\.json$/i.test(rel)) {
      const json = JSON.parse(data.toString("utf8"));
      if (json && typeof json === "object" && !Array.isArray(json)) data = Buffer.from(JSON.stringify({ ...json, question_images_policy: "referenced_only" }));
    }
    if (PACK && !/\.json$/i.test(rel)) {
      packed.push([rel, data]);
      return;
    }
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
        if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(entry.name) || !KEEP.test(entry.name) || SKIP.test(entry.name)) continue;
        const data = await entry.async("nodebuffer");
        write(...(/\.json$/i.test(entry.name) ? [entry.name, data] : await optimise(entry.name, data)));
      }
    } else write(posix.basename(src), data);
  }
  const packs = [];
  if (packed.length) {
    const MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };
    let cur = {};
    let size = 0;
    const flush = () => {
      if (!size) return;
      const rel = `pack-${packs.length + 1}.json`;
      writeFileSync(join(outDir, book.id, rel), JSON.stringify(cur));
      packs.push(posix.join(book.id, rel));
      cur = {};
      size = 0;
    };
    mkdirSync(join(outDir, book.id), { recursive: true });
    for (const [rel, data] of packed) {
      const ext = rel.split(".").pop().toLowerCase();
      const uri = `data:${MIME[ext] ?? "application/octet-stream"};base64,${data.toString("base64")}`;
      if (size + uri.length > PACK_BYTES) flush();
      cur[rel] = uri;
      size += uri.length;
    }
    flush();
  }
  index.books.push({ id: book.id, title: book.title, version: hash.digest("hex").slice(0, 16), files: files.sort(), ...(packs.length ? { packs } : {}) });
  console.log(`build-library: ${book.id} – ${files.length} files`);
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 1));
if (stats.before) console.log(`build-library: images ${(stats.before / 1e6).toFixed(1)} MB → ${(stats.after / 1e6).toFixed(1)} MB`);
