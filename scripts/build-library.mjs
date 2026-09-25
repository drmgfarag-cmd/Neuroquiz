#!/usr/bin/env node
/**
 * Unpacks the books listed in library/books.json into public/library/ so the
 * app ships with them (web, Android and Windows builds all read from there).
 *
 *   public/library/index.json            list of books + files + version
 *   public/library/<id>/<files…>         JSON and images, unzipped
 *
 * The Android and Windows apps ship the original image files, untouched.
 *
 * LIBRARY_PACK=1 (web preview build): hosts that limit the number of files
 * and the total size get each book's images resized (at most 1200 px, or the
 * book's "webMaxPx"), stored as WebP and packed into a few "pack-N.json" files
 * of data URIs. Books reference images by name, and the app finds "fig1.png"
 * when the file is "fig1.webp". LIBRARY_OPTIMIZE_IMAGES=1 also shrinks the
 * images of an app build (at most 2000 px).
 *
 * Runs automatically before `npm run build` / `npm run dev`.
 * LIBRARY_BUNDLE=none builds the same app without bundled books. The source
 * archives remain in the repository for validation and later full builds.
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
const SKIP = /(^|\/)[^/]*(audit|page_ocr|ocr_pages|manifest|answer_key)[^/]*\.json$|contact_sheet/i;

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
if (process.env.LIBRARY_BUNDLE === "none") {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.json"), JSON.stringify({ books: [] }));
  console.log("build-library: empty bundle selected; books can be imported in the app");
  process.exit(0);
}
const listFile = join(libDir, "books.json");
if (!existsSync(listFile)) {
  console.log("build-library: no library/books.json – app ships without built-in books");
  process.exit(0);
}
const { books } = JSON.parse(readFileSync(listFile, "utf8"));
const index = { books: [] };
const PACK = !!process.env.LIBRARY_PACK;
// app builds keep the original images; only the size-limited web preview shrinks them
const OPTIMIZE = PACK || !!process.env.LIBRARY_OPTIMIZE_IMAGES;
const MAX_PX = PACK ? 1200 : 2000;
const QUALITY = PACK ? 62 : 82;
const PACK_BYTES = 11e6; // stay well under per-file limits
const stats = { before: 0, after: 0 };

/** Collect the image filenames used by flat question lists and chapter books. */
function referencedImages(json) {
  const linked = new Set();
  const records = Array.isArray(json) ? json : Object.values(json.chapters ?? {}).flatMap((chapter) => [
    ...(chapter.questions ?? []), ...(chapter.qa_pairs ?? []), ...(chapter.cases ?? []),
  ]);
  for (const item of records) {
    for (const value of [...(item.images ?? []), ...(item.question_images ?? []), ...(item.answer_images ?? [])]) {
      const name = typeof value === "string" ? value : value?.file ?? value?.path ?? value?.filename;
      if (typeof name === "string") linked.add(posix.basename(name).replace(/\.[^.]+$/, "").toLowerCase());
    }
  }
  return linked;
}

/** Resize/re-encode a raster image; keeps the original when that is smaller. */
async function optimise(rel, data, book) {
  const maxPx = (PACK && book.webMaxPx) || MAX_PX;
  const quality = (PACK && book.webQuality) || QUALITY;
  stats.before += data.length;
  if (!OPTIMIZE || !/\.(png|jpe?g|bmp|tiff?)$/i.test(rel)) {
    stats.after += data.length;
    return [rel, data];
  }
  try {
    const out = await sharp(data).rotate().resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
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
  if (book.referencedAssetsOnly) hash.update("referencedAssetsOnly=true");
  // Some extractions retain superseded or wrongly assigned images inside the
  // source archive. Ship only figures explicitly linked to a source question.
  let externalLinkedAssets = null;
  if (book.referencedAssetsOnly && !book.primaryJson) {
    externalLinkedAssets = new Set();
    for (const src of sources.filter((path) => /\.json$/i.test(path))) {
      const json = JSON.parse(readSource(src));
      for (const name of referencedImages(json)) externalLinkedAssets.add(name);
    }
  }
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
      let linkedAssets = externalLinkedAssets;
      if (book.primaryJson && book.referencedAssetsOnly) {
        const main = Object.values(zip.files).find((e) => posix.basename(e.name) === book.primaryJson);
        if (!main) throw new Error(`Missing ${book.primaryJson} in ${src}`);
        const json = JSON.parse(await main.async("string"));
        linkedAssets = referencedImages(json);
      }
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(entry.name) || !KEEP.test(entry.name) || SKIP.test(entry.name)) continue;
        if (book.primaryJson && /\.json$/i.test(entry.name) && posix.basename(entry.name) !== book.primaryJson) continue;
        if (linkedAssets && !/\.json$/i.test(entry.name) && !linkedAssets.has(posix.basename(entry.name).replace(/\.[^.]+$/, "").toLowerCase())) continue;
        const data = await entry.async("nodebuffer");
        write(...(/\.json$/i.test(entry.name) ? [entry.name, data] : await optimise(entry.name, data, book)));
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
