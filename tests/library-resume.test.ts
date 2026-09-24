import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { db, getMeta, setMeta } from "../src/lib/db";
import { installBundledIfEmpty } from "../src/lib/library";

afterEach(() => vi.unstubAllGlobals());

it("resumes the remaining bundled book after an interrupted first launch", async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const books = [
    { id: "first", title: "First", version: "v1", files: ["first/questions.json"] },
    { id: "second", title: "Second", version: "v1", files: ["second/questions.json", "second/fig.png"] }
  ];
  await db.books.put({ id: "first", title: "First", sources: [], importedAt: 1, questionCount: 1, flashcardCount: 0, caseCount: 0 });
  await setMeta("bundle:first", "v1");
  await setMeta("bundle:first-run-started", true);
  const fetched: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetched.push(url);
    if (url === "./library/index.json") return new Response(JSON.stringify({ books }), { status: 200 });
    if (url === "./library/second/questions.json") return new Response(JSON.stringify({ questions: [{ question: "Identify the structure in the image", options: { A: "A", B: "B" }, answer: "A", images: ["fig.png"] }] }), { status: 200 });
    if (url === "./library/second/fig.png") return new Response(new Blob(["figure"], { type: "image/png" }), { status: 200 });
    throw new Error(`Unexpected fetch ${url}`);
  }));
  expect(await installBundledIfEmpty(() => undefined)).toBe(true);
  expect(fetched).not.toContain("./library/first/questions.json");
  expect(await db.questions.where("bookId").equals("second").count()).toBe(1);
  expect(await db.media.get("second/fig.png")).toBeTruthy();
  expect(await getMeta("bundle:first-run-done", false)).toBe(true);
});
