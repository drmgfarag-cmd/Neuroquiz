import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { db, getMeta } from "../src/lib/db";
import { installBundledIfEmpty } from "../src/lib/library";

afterEach(() => vi.unstubAllGlobals());

it("installs later books even if an earlier bundled import fails and leaves the failure retryable", async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const books = [
    { id: "bad", title: "Missing images", version: "v1", files: ["bad/questions.json"] },
    { id: "good", title: "Working book", version: "v1", files: ["good/questions.json"] }
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "./library/index.json") return new Response(JSON.stringify({ books }));
    if (url === "./library/good/questions.json")
      return new Response(JSON.stringify({ questions: [{ question: "What is the diagnosis?", options: { A: "A", B: "B" }, answer: "A" }] }));
    return new Response("Missing", { status: 404 });
  }));

  await expect(installBundledIfEmpty(() => undefined)).rejects.toThrow("Missing images");
  expect(await db.books.get("good")).toBeDefined();
  expect(await getMeta("bundle:first-run-done", false)).toBe(false);
  expect(await getMeta<string | null>("bundle:good", null)).toBe("v1");
});
