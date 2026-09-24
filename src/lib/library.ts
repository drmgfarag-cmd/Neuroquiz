/**
 * Books that ship with the app (see library/books.json and
 * scripts/build-library.mjs). They are imported into the local database on
 * first launch and whenever a newer version ships; progress is kept because
 * question ids don't change.
 */
import { runLocalTagging } from "../ai/tagger";
import { executeImport, planImport, type SourceFile } from "../import/importer";
import { db, getMeta, setMeta } from "./db";
import { clearMediaCache } from "./media";
import { getSettings } from "./settings";

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
  const files: SourceFile[] = await Promise.all(
    b.files.map(async (f) => {
      const res = await fetch(`./library/${f}`);
      if (!res.ok) throw new Error(`Missing library file ${f}`);
      return { path: f, blob: await res.blob() };
    })
  );
  for (const [i, p] of (b.packs ?? []).entries()) {
    onProgress?.(`Loading images for “${b.title}” (${i + 1}/${b.packs!.length})…`);
    const res = await fetch(`./library/${p}`);
    if (!res.ok) throw new Error(`Missing library file ${p}`);
    const pack = (await res.json()) as Record<string, string>;
    for (const [rel, uri] of Object.entries(pack)) files.push({ path: `${b.id}/${rel}`, blob: dataUriToBlob(uri) });
  }
  const plan = await planImport(files, "single", getSettings().numericAnswerBase);
  if (plan.errors.length) throw new Error(plan.errors.join("\n"));
  const existing = await db.books.get(b.id);
  plan.books.forEach((p) => {
    p.id = b.id;
    p.title = existing?.title ?? b.title; // keep a name the user chose
  });
  onProgress?.(`Importing “${b.title}”…`);
  const res = await executeImport(plan);
  await setMeta(`bundle:${b.id}`, b.version);
  clearMediaCache();
  await runLocalTagging(["question", "flashcard", "case"], [b.id], "untagged");
  return res.questions;
}

/** First launch: install every built-in book when the library is empty. */
export async function installBundledIfEmpty(onProgress: (msg: string) => void): Promise<boolean> {
  if ((await db.books.count()) > 0 || (await getMeta("bundle:first-run-done", false))) return false;
  const books = await bundledBooks();
  if (!books.length) return false;
  for (const b of books) await installBundled(b, onProgress);
  await setMeta("bundle:first-run-done", true);
  return true;
}
