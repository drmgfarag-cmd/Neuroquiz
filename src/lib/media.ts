import { db } from "./db";
import { normaliseFileName, stripExt } from "./util";

const cache = new Map<string, Promise<string | null>>();

async function lookup(bookId: string | undefined, file: string): Promise<string | null> {
  if (/^(data:|https?:|blob:)/i.test(file)) return file;
  const name = normaliseFileName(file);
  let m = bookId ? await db.media.get(`${bookId}/${name}`) : undefined;
  if (!m) m = await db.media.where("name").equals(name).first();
  if (!m && bookId) {
    // same image in another format ("fig1.png" in the book, "fig1.webp" shipped)
    const base = stripExt(name);
    for (const ext of ["webp", "png", "jpg", "jpeg", "gif", "svg"]) {
      m = await db.media.get(`${bookId}/${base}.${ext}`);
      if (m) break;
    }
    // …or no extension in the reference at all
    m ??= await db.media.get(`${bookId}/${base}`);
  }
  if (!m) {
    // tolerate a different extension ("fig1" vs "fig1.png", ".jpg" vs ".jpeg")
    const base = stripExt(name);
    const coll = bookId ? db.media.where("bookId").equals(bookId) : db.media.toCollection();
    m = await coll.filter((x) => stripExt(x.name) === base).first();
  }
  return m ? URL.createObjectURL(m.blob) : null;
}

export function resolveMedia(bookId: string | undefined, file: string): Promise<string | null> {
  const key = `${bookId ?? ""}|${file}`;
  if (!cache.has(key)) cache.set(key, lookup(bookId, file));
  return cache.get(key)!;
}

export function clearMediaCache(): void {
  for (const p of cache.values()) p.then((u) => u?.startsWith("blob:") && URL.revokeObjectURL(u));
  cache.clear();
}
