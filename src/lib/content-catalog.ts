import type { BundledContentManifest, BundledLibraryIndex } from "./content-manifest";

let catalogPromise: Promise<BundledLibraryIndex> | null = null;

function normalisePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

export function libraryCatalog(): Promise<BundledLibraryIndex> {
  catalogPromise ??= fetch("./library/index.json")
    .then(async (response) => {
      if (!response.ok) throw new Error(`Library catalog unavailable (${response.status})`);
      const value = (await response.json()) as Partial<BundledLibraryIndex>;
      if (!Array.isArray(value.books)) throw new Error("Invalid library catalog");
      return { format: value.format === 2 ? 2 : 2, generatedAt: value.generatedAt, books: value.books as BundledContentManifest[] };
    });
  return catalogPromise;
}

export async function catalogBook(bookId: string): Promise<BundledContentManifest | undefined> {
  return (await libraryCatalog()).books.find((book) => book.id === bookId);
}

/** Resolve a logical media reference to its shipped local URL without opening it. */
export async function bundledAssetUrl(bookId: string | undefined, file: string): Promise<string | null> {
  if (!bookId || /^(data:|https?:|blob:)/i.test(file)) return file;
  const book = await catalogBook(bookId);
  if (!book) return null;
  const requested = normalisePath(file).toLowerCase();
  const base = requested.split("/").pop()!.replace(/\.[^.]+$/, "");
  const candidates = book.files.filter((path) => !/\.json$/i.test(path));
  const exact = candidates.find((path) => {
    const rel = normalisePath(path).replace(new RegExp(`^${bookId}/`), "").toLowerCase();
    return rel === requested || rel.split("/").pop() === requested.split("/").pop();
  });
  const byBase = exact ?? candidates.find((path) => path.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase() === base);
  return byBase ? `./library/${byBase}` : null;
}

export async function fetchBundledJson<T>(bookId: string, relativePath: string): Promise<T> {
  const url = `./library/${bookId}/${normalisePath(relativePath).replace(new RegExp(`^${bookId}/`), "")}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Bundled content unavailable: ${relativePath}`);
  return (await response.json()) as T;
}

export function clearLibraryCatalogCache(): void {
  catalogPromise = null;
}
