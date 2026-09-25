import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { executeImport, planImport } from "../src/import/importer";
import { db, setMeta } from "../src/lib/db";
import { installNewStudyBooks } from "../src/lib/library";

afterEach(() => vi.unstubAllGlobals());

it("repairs an already-installed Neurosurgery Rounds book stored as scored questions", async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const id = "neurosurgery-rounds-2e";
  const old = await planImport([{ path: "rounds.json", blob: new Blob([JSON.stringify({ book_id: id, book_title: "Neurosurgery Rounds", questions: [{ question: "Previous quiz entry?", options: ["Yes", "No"], answer: "Yes" }] })]) }], "single", 1);
  await executeImport(old);
  await setMeta(`bundle:${id}`, "same-version");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "./library/index.json") return new Response(JSON.stringify({ books: [{ id, title: "Neurosurgery Rounds", version: "same-version", files: [`${id}/rounds.json`] }] }));
    if (url === `./library/${id}/rounds.json`) return new Response(JSON.stringify({ book_id: id, book_title: "Neurosurgery Rounds", qa_pairs: [{ question: "What is the diagnosis?", answer: "Aneurysm" }] }));
    throw new Error(`Unexpected fetch ${url}`);
  }));
  await installNewStudyBooks(() => undefined);
  expect(await db.questions.where("bookId").equals(id).count()).toBe(0);
  expect((await db.cases.where("bookId").equals(id).first())?.stages[0].answer).toBe("Aneurysm");
});
