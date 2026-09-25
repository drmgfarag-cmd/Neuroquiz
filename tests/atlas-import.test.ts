import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { collectFiles, deleteBook, executeImport, planImport } from "../src/import/importer";
import { exportBookZip } from "../src/import/exporter";
import { db } from "../src/lib/db";

const manifest = {
  book_id: "atlas-test",
  book_title: "Neurology figures",
  atlas_items: [
    { file: "images/a.png", title: "CSF flow", topic: "Anatomy", kind: "diagram", tags: ["CSF", "ventricles"], source_page: 2 },
    { file: "images/b.png", title: "Tumor classification", topic: "Oncology", kind: "table", tags: ["tumors"], source_page: 3 }
  ]
};
const files = () => [
  { path: "atlas/book.json", blob: new Blob([JSON.stringify(manifest)]) },
  { path: "atlas/images/a.png", blob: new Blob(["a"], { type: "image/png" }) },
  { path: "atlas/images/b.png", blob: new Blob(["b"], { type: "image/png" }) }
];

describe("standalone atlas", () => {
  it("imports, exports, reimports and deletes topic-tagged images without inventing quiz questions", async () => {
    const plan = await planImport(files(), "auto", 1);
    expect(plan.errors).toEqual([]);
    const result = await executeImport(plan);
    expect(result).toMatchObject({ atlas: 2, images: 2, questions: 0, cases: 0, missingImages: [], unreferencedImages: [] });
    const atlas = await db.atlas.where("bookId").equals("atlas-test").toArray();
    expect(atlas.sort((a, b) => a.title.localeCompare(b.title)).map((x) => x.sourceTags)).toEqual([["CSF", "ventricles"], ["tumors"]]);
    expect((await db.chapters.where("bookId").equals("atlas-test").toArray()).map((x) => x.title).sort()).toEqual(["Anatomy", "Oncology"]);

    const archive = await exportBookZip("atlas-test");
    await deleteBook("atlas-test");
    expect(await db.atlas.where("bookId").equals("atlas-test").count()).toBe(0);
    const restored = await executeImport(await planImport(await collectFiles([new File([archive.blob], archive.name)]), "auto", 1));
    expect(restored).toMatchObject({ atlas: 2, images: 2, missingImages: [] });
    expect(await db.atlas.where("bookId").equals("atlas-test").count()).toBe(2);
  });
});
