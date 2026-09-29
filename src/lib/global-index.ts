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

export async function loadGlobalIndexes(names: GlobalIndexName[] = ["questions", "cases", "atlas", "references", "media"]): Promise<ContentIndexRecord[]> {
  const rows = await Promise.all(names.map((name) => loadGlobalIndex(name)));
  return rows.flat();
}

export async function searchGlobalContent(query: string, options: { kinds?: IndexedContentKind[] } = {}): Promise<ContentIndexRecord[]> {
  const needle = normalise(query);
  if (!needle) return [];
  const rows = await loadGlobalIndexes();
  const allowed = options.kinds ? new Set(options.kinds) : undefined;
  const terms = needle.split(/\s+/).filter(Boolean);
  return rows
    .filter((row) => !allowed || allowed.has(row.kind))
    .map((row) => {
      const title = normalise(row.title);
      const searchText = normalise(row.searchText);
      const tags = row.tags.map(normalise);
      const topics = row.topics.map(normalise);
      const phrase = terms.join(" ");
      const score = terms.reduce((total, term) => {
        if (tags.some((tag) => tag === term)) return total + 1;
        if (topics.some((topic) => topic === term)) return total + 0.9;
        if (title.includes(term)) return total + 0.8;
        if (searchText.includes(term)) return total + 0.45;
        return total;
      }, (tags.includes(phrase) ? 2 : 0) + (topics.includes(phrase) ? 1.5 : 0) + (title.includes(phrase) ? 0.35 : 0)) / terms.length;
      return { row, score: Number(score.toFixed(6)) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
    .map((item) => ({ ...item.row, searchConfidence: item.score }));
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
