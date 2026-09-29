import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../scripts/build-indexes.mjs";

describe("build-indexes", () => {
  it("indexes mixed question, case, atlas, reference, and media records compactly", () => {
    const root = mkdtempSync(join(tmpdir(), "neuroquiz-index-"));
    const bookDir = join(root, "book-1");
    const output = join(root, "indexes");
    mkdirSync(bookDir, { recursive: true });
    writeFileSync(join(root, "index.json"), JSON.stringify({ format: 2, books: [{
      id: "book-1", title: "Mixed book", kind: "hybrid-question-bank", schema: "hybrid-v1", adapter: "adaptHybridBook", quizEligible: true, status: "ready",
      files: ["book-1/content.json", "book-1/scan.png"]
    }] }));
    writeFileSync(join(bookDir, "content.json"), JSON.stringify({ chapters: [{
      title: "Chapter 1",
      questions: [{ id: "q1", question: "What is shown?", options: [{ key: "A", text: "Scan" }], answer: "A", tags: ["imaging"] }],
      cases: [{ id: "case1", title: "A case", presentation: "Presentation", stages: [{ title: "Stage 1", content: "Findings" }] }],
      atlas: [{ id: "fig1", title: "A figure", file: "scan.png", description: "An image" }],
      references: [{ id: "ref1", title: "Further reading", text: "Reference text" }]
    }] }));
    writeFileSync(join(bookDir, "scan.png"), "not-an-image");

    const result = buildIndexes({ libraryRoot: root, outputRoot: output });
    expect(result.questions).toHaveLength(1);
    expect(result.cases).toHaveLength(1);
    expect(result.atlas).toHaveLength(1);
    expect(result.references).toHaveLength(1);
    expect(result.media).toHaveLength(1);
    expect(result.questions[0].quizEligible).toBe(true);
    expect(result.questions[0].id).toMatch(/^book-1:q:/);
    expect(result.cases[0].id).toMatch(/^book-1:c:/);
    expect(result.atlas[0].id).toMatch(/^book-1:atlas:/);
    expect(result.questions[0]).not.toHaveProperty("options");
    expect(result.media[0].sourcePath).toBe("book-1/scan.png");
    expect(JSON.parse(readFileSync(join(output, "index.json"), "utf8")).counts.questions).toBe(1);
  });
});
