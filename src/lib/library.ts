/**
 * Books that ship with the app (see library/books.json and
 * scripts/build-library.mjs). They are imported into the local database on
 * first launch and whenever a newer version ships; progress is kept because
 * question ids don't change.
 */
import { runLocalTagging } from "../ai/tagger";
import { deleteBook, executeImport, planImport, type SourceFile } from "../import/importer";
import { db, getMeta, setMeta } from "./db";
import { clearMediaCache } from "./media";
import { getSettings } from "./settings";
import { IMAGE_EXT, normaliseFileName } from "./util";
import { auditBook } from "./quality";

export interface BundledBook {
  id: string;
  title: string;
  version: string;
  files: string[];
  /** web preview: images packed into JSON files of data URIs */
  packs?: string[];
}

function dataUriToBlob(uri: string): Blob {
  const [head, b64] = uri.split(",", 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export type BundledState = "not-installed" | "installed" | "update";

// Earlier bundled display names. An exact match means the reader has not
// renamed that book; other titles are treated as their own choice.
const formerTitles: Record<string, string> = {
  "01": "Neurology & Neurosurgery MCQs (Book 01)",
  "02": "Spine Self-Assessment (Book 02)",
  "05": "Neurosurgery Self-Assessment (Book 05)",
  "07": "Spine Surgery Review (Book 07)",
  "08": "Neuroanatomy Review (Book 08)",
  "09": "Neurosurgery Board Questions (Book 09)",
  inbr: "Intensive Neurosurgery Board Review (INBR)",
  nbr3: "Neurosurgery Board Review, Third Edition"
};

function updatedTitle(id: string, existing: string | undefined, catalog: string): string {
  return existing && existing !== formerTitles[id] ? existing : catalog;
}

/** Refresh old default names without changing a reader's custom book names. */
export async function syncBundledBookTitles(): Promise<void> {
  for (const book of await bundledBooks()) {
    if (!formerTitles[book.id]) continue;
    const installed = await db.books.get(book.id);
    if (installed?.title === formerTitles[book.id]) await db.books.update(book.id, { title: book.title });
  }
}

let manifest: Promise<BundledBook[]> | null = null;

export function bundledBooks(): Promise<BundledBook[]> {
  manifest ??= fetch("./library/index.json")
    .then((r) => (r.ok ? r.json() : { books: [] }))
    .then((j: { books?: BundledBook[] }) => j.books ?? [])
    .catch(() => []);
  return manifest;
}

export async function bundledState(b: BundledBook): Promise<BundledState> {
  const [book, version] = await Promise.all([db.books.get(b.id), getMeta<string | null>(`bundle:${b.id}`, null)]);
  if (!book) return "not-installed";
  return version === b.version ? "installed" : "update";
}

export async function installBundled(b: BundledBook, onProgress?: (msg: string) => void): Promise<number> {
  onProgress?.(`Loading “${b.title}”…`);
  // Import the small JSON first, then write images in bounded batches. Keeping
  // every image Blob in one array could exhaust memory on Android.
  const jsonFiles: SourceFile[] = await Promise.all(
    b.files.filter((f) => /\.json$/i.test(f)).map(async (f) => {
      const res = await fetch(`./library/${f}`);
      if (!res.ok) throw new Error(`Missing library file ${f}`);
      return { path: f, blob: await res.blob() };
    })
  );
  const plan = await planImport(jsonFiles, "single", getSettings().numericAnswerBase);
  if (plan.errors.length) throw new Error(plan.errors.join("\n"));
  if (!plan.books.length) throw new Error(`No readable questions in “${b.title}”.`);
  const existing = await db.books.get(b.id);
  plan.books.forEach((p) => {
    p.id = b.id;
    p.title = updatedTitle(b.id, existing?.title, b.title);
  });
  onProgress?.(`Importing “${b.title}”…`);
  const res = await executeImport(plan);
  const imagePaths = b.files.filter((f) => IMAGE_EXT.test(f));
  const seen = new Set<string>();
  const writeBatch = async (items: { path: string; blob: Blob }[]) => {
    const rows = items.map(({ path, blob }) => {
      const name = normaliseFileName(path);
      if (seen.has(name)) throw new Error(`Ambiguous image name in “${b.title}”: ${name}`);
      seen.add(name);
      return { id: `${b.id}/${name}`, bookId: b.id, name, blob };
    });
    if (rows.length) await db.media.bulkPut(rows);
  };
  for (let i = 0; i < imagePaths.length; i += 8) {
    onProgress?.(`Loading images for “${b.title}” (${Math.min(i + 8, imagePaths.length)}/${imagePaths.length})…`);
    const batch = await Promise.all(imagePaths.slice(i, i + 8).map(async (path) => {
      const response = await fetch(`./library/${path}`);
      if (!response.ok) throw new Error(`Missing library file ${path}`);
      return { path, blob: await response.blob() };
    }));
    await writeBatch(batch);
  }
  for (const [i, p] of (b.packs ?? []).entries()) {
    onProgress?.(`Loading image pack for “${b.title}” (${i + 1}/${b.packs!.length})…`);
    const response = await fetch(`./library/${p}`);
    if (!response.ok) throw new Error(`Missing library file ${p}`);
    const pack = (await response.json()) as Record<string, string>;
    for (const [rel, uri] of Object.entries(pack)) await writeBatch([{ path: rel, blob: dataUriToBlob(uri) }]);
  }
  const [questions, mediaKeys] = await Promise.all([
    db.questions.where("bookId").equals(b.id).toArray(),
    db.media.where("bookId").equals(b.id).primaryKeys()
  ]);
  const quality = auditBook(questions, mediaKeys.map((key) => String(key).slice(b.id.length + 1)));
  if (quality.missingImages.length || quality.conflictingImageRoles.length)
    throw new Error(`Image verification failed for “${b.title}”: ${[...quality.missingImages, ...quality.conflictingImageRoles].slice(0, 5).join("; ")}`);
  await setMeta(`bundle:${b.id}`, b.version);
  clearMediaCache();
  await runLocalTagging(["question", "flashcard", "case"], [b.id], "untagged");
  return res.questions;
}

/** First launch: install every built-in book when the library is empty. */
export async function installBundledIfEmpty(onProgress: (msg: string) => void): Promise<boolean> {
  if (await getMeta("bundle:first-run-done", false)) return false;
  const books = await bundledBooks();
  if (!books.length) return false;
  const started = await getMeta("bundle:first-run-started", false) ||
    (await Promise.all(books.map((b) => getMeta<string | null>(`bundle:${b.id}`, null)))).some(Boolean);
  if (!started && (await db.books.count()) > 0) return false;
  await setMeta("bundle:first-run-started", true);
  const failed: string[] = [];
  for (const b of books) {
    if ((await bundledState(b)) === "installed") continue;
    try {
      await installBundled(b, onProgress);
    } catch (error) {
      failed.push(`${b.title}: ${(error as Error).message}`);
    }
  }
  if (failed.length) throw new Error(`Some books could not be installed: ${failed.join("; ")}`);
  await setMeta("bundle:first-run-done", true);
  return true;
}

/** Retire the explicitly withdrawn QBNE extraction once, leaving progress available for its replacement. */
export async function retireIncompleteQbne(): Promise<void> {
  if (await getMeta("retired:qbne:v1", false)) return;
  if (await db.books.get("qbne")) {
    await deleteBook("qbne");
    clearMediaCache();
  }
  await setMeta("retired:qbne:v1", true);
}

/** Install newly added books for people who already have a library. Do not restore later deletions. */
export async function installNewStudyBooks(onProgress: (msg: string) => void): Promise<void> {
  const ids = new Set(["neurosurgery-rounds-2e", "nbr3", "nper"]);
  const failed: string[] = [];
  for (const b of await bundledBooks()) {
    if (!ids.has(b.id)) continue;
    // Earlier installs may have stored this Q&A title as scored questions.
    // Restore the current case-book format even when its bundle version matches.
    const roundsInTests = b.id === "neurosurgery-rounds-2e" &&
      (await db.questions.where("bookId").equals(b.id).count()) > 0;
    if (!roundsInTests && await getMeta<string | null>(`bundle:${b.id}`, null)) continue;
    if (!roundsInTests && await db.books.get(b.id)) continue;
    try {
      await installBundled(b, onProgress);
    } catch (error) {
      failed.push(`${b.title}: ${(error as Error).message}`);
    }
  }
  if (failed.length) throw new Error(`Some new books could not be installed: ${failed.join("; ")}`);
}
