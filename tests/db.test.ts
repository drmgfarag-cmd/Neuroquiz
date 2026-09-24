import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { localTag } from "../src/ai/taxonomy";
import { runLocalTagging } from "../src/ai/tagger";
import { executeImport, planImport, type SourceFile } from "../src/import/importer";
import { db, deleteSynced } from "../src/lib/db";
import { buildPool, emptyFilter, recordResult } from "../src/lib/quiz";
import { search } from "../src/lib/search";
import { applyChanges, collectChanges } from "../src/lib/sync";

function sampleFiles(): SourceFile[] {
  const base = new URL("../samples/sample-book/", import.meta.url);
  return ["01-vascular.json", "02-oncology-trauma.json", "03-spine-functional.json", "images/fig_cow.svg", "images/fig_edh.svg"].map((p) => ({
    path: `sample-book/${p}`,
    blob: new Blob([readFileSync(new URL(p, base))])
  }));
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("import → tag → search → quiz → sync", () => {
  it("imports the sample book as one book with all chapters and images", async () => {
    const plan = await planImport(sampleFiles(), "auto", 1);
    expect(plan.books).toHaveLength(1);
    expect(plan.books[0].title).toBe("Sample Neurosurgery Review");
    const res = await executeImport(plan);
    expect(res).toMatchObject({ books: 1, chapters: 4, questions: 8, flashcards: 3, cases: 1, images: 2, missingImages: [] });
    const ids1 = (await db.questions.toArray()).map((q) => q.id).sort();

    // re-import is idempotent and keeps ids stable (progress survives)
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    expect((await db.questions.toArray()).map((q) => q.id).sort()).toEqual(ids1);
  });

  it("tags offline, searches and builds filtered pools", async () => {
    await executeImport(await planImport(sampleFiles(), "auto", 1));
    const n = await runLocalTagging(["question", "flashcard", "case"], null, "untagged");
    expect(n).toBe(12);
    const hits = await search("aneurysm");
    expect(hits.length).toBeGreaterThan(0);
    const cvTopic = (await db.annotations.toArray()).filter((a) => a.topic === "Cerebrovascular");
    expect(cvTopic.length).toBeGreaterThanOrEqual(2);

    const pool = await buildPool({ ...emptyFilter(), topics: ["Cerebrovascular"] });
    expect(pool.length).toBe(cvTopic.filter((a) => a.kind === "question").length);

    await recordResult(pool[0], false);
    expect(await buildPool({ ...emptyFilter(), status: "incorrect" })).toHaveLength(1);
    expect(await buildPool({ ...emptyFilter(), status: "unused" })).toHaveLength(7);
  });

  it("merges sync records last-writer-wins with tombstones", async () => {
    await db.annotations.put({ id: "q1", kind: "question", topic: "Old", subtopic: "", tags: [], keywords: [], source: "local", updatedAt: 100 });
    await applyChanges([
      { table: "annotations", id: "q1", updatedAt: 50, row: { id: "q1", kind: "question", topic: "Older", subtopic: "", tags: [], keywords: [], source: "ai", updatedAt: 50 } }
    ]);
    expect((await db.annotations.get("q1"))!.topic).toBe("Old");
    await applyChanges([
      { table: "annotations", id: "q1", updatedAt: 200, row: { id: "q1", kind: "question", topic: "New", subtopic: "", tags: [], keywords: [], source: "ai", updatedAt: 200 } }
    ]);
    expect((await db.annotations.get("q1"))!.topic).toBe("New");

    await deleteSynced("annotations", "q1");
    const out = await collectChanges(0);
    expect(out.find((r) => r.id === "q1")?.deleted).toBe(true);
    // a remote write older than the deletion must not resurrect the row…
    await applyChanges([{ table: "annotations", id: "q1", updatedAt: 300, row: { id: "q1", updatedAt: 300 } as never }]);
    expect(await db.annotations.get("q1")).toBeUndefined();
    // …but a newer one wins
    const later = Date.now() + 10_000;
    await applyChanges([{ table: "annotations", id: "q1", updatedAt: later, row: { id: "q1", updatedAt: later } as never }]);
    expect(await db.annotations.get("q1")).toBeTruthy();
  });
});

describe("localTag", () => {
  it("categorises by keywords", () => {
    expect(localTag("Spetzler-Martin grading of an arteriovenous malformation").topic).toBe("Cerebrovascular");
    expect(localTag("MGMT methylation in glioblastoma").subtopic).toBe("Gliomas");
    expect(localTag("burst fracture TLICS").topic).toBe("Neurotrauma");
  });
});
