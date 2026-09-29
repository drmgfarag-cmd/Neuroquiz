import type { ContentIndexRecord, IndexedContentKind } from "./types";

export type GlobalIndexName = "questions" | "cases" | "atlas" | "references" | "media";

const cache = new Map<GlobalIndexName, Promise<ContentIndexRecord[]>>();

function normalise(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function loadGlobalIndex(name: GlobalIndexName): Promise<ContentIndexRecord[]> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(`./indexes/${name}-index.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Global ${name} index unavailable (${response.status})`);
        const value = await response.json() as unknown;
        if (!Array.isArray(value)) throw new Error(`Invalid global ${name} index`);
        return value as ContentIndexRecord[];
      });
    cache.set(name, pending);
  }
  return pending;
}

export async function loadGlobalIndexes(names: GlobalIndexName[] = ["questions", "cases", "atlas", "references"]): Promise<ContentIndexRecord[]> {
  const rows = await Promise.all(names.map((name) => loadGlobalIndex(name)));
  return rows.flat();
}

export async function searchGlobalContent(query: string, options: { kinds?: IndexedContentKind[]; limit?: number } = {}): Promise<ContentIndexRecord[]> {
  const needle = normalise(query);
  if (!needle) return [];
  const rows = await loadGlobalIndexes();
  const allowed = options.kinds ? new Set(options.kinds) : undefined;
  const terms = needle.split(/\s+/).filter(Boolean);
  return rows
    .filter((row) => !allowed || allowed.has(row.kind))
    .map((row) => {
      const haystack = normalise(`${row.title} ${row.searchText} ${row.tags.join(" ")} ${row.topics.join(" ")}`);
      const matched = terms.filter((term) => haystack.includes(term)).length;
      return { row, score: matched / terms.length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
    .slice(0, options.limit ?? 100)
    .map((item) => item.row);
}

/** Load only one indexed record body from its local JSON source. */
export async function loadIndexedRecordBody(record: ContentIndexRecord): Promise<unknown> {
  if (!record.sourcePath) throw new Error("Indexed record has no source path");
  const response = await fetch(`./library/${record.sourcePath}`);
  if (!response.ok) throw new Error(`Content source unavailable (${response.status})`);
  let value: unknown = await response.json();
  const path = record.recordPath ?? "$";
  const tokens = [...path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
  for (const token of tokens) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string | number, unknown>)[token];
  }
  return value;
}

export function clearGlobalIndexCache(): void {
  cache.clear();
}
