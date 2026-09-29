import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGlobalIndexCache, searchGlobalContent } from "../src/lib/global-index";

describe("global search ranking", () => {
  afterEach(() => {
    clearGlobalIndexCache();
    vi.unstubAllGlobals();
  });

  it("returns every match in descending confidence without a default cap", async () => {
    const rows = [
      { id: "exact", kind: "question", title: "Other", searchText: "", tags: ["brachial plexus"], topics: [], bookId: "a" },
      { id: "title", kind: "question", title: "Brachial plexus anatomy", searchText: "", tags: [], topics: [], bookId: "b" },
      ...Array.from({ length: 105 }, (_, i) => ({ id: `body-${i}`, kind: "question", title: `Question ${i}`, searchText: "brachial plexus", tags: [], topics: [], bookId: "c" }))
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => ({ ok: true, json: async () => String(input).includes("questions-index") ? rows : [] })));

    const result = await searchGlobalContent("brachial plexus", { kinds: ["question"] });
    expect(result.length).toBeGreaterThan(100);
    expect(result.some((row) => row.id === "exact")).toBe(true);
    expect(result.some((row) => row.id === "body-104")).toBe(true);
    expect(result[0].searchConfidence).toBeGreaterThan(result.at(-1)!.searchConfidence!);
    expect(result.every((row, i) => i === 0 || row.searchConfidence! <= result[i - 1].searchConfidence!)).toBe(true);
  });
});
