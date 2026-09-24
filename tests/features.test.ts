import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAnswerCheck } from "../src/ai/answerCheck";
import { executeImport, planImport, type SourceFile } from "../src/import/importer";
import { db } from "../src/lib/db";
import { allocate, buildMockExam } from "../src/lib/mock";
import { updateSettings } from "../src/lib/settings";

function sampleFiles(): SourceFile[] {
  const base = new URL("../samples/sample-book/", import.meta.url);
  return ["01-vascular.json", "02-oncology-trauma.json", "03-spine-functional.json"].map((p) => ({ path: `sample-book/${p}`, blob: new Blob([readFileSync(new URL(p, base))]) }));
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await executeImport(await planImport(sampleFiles(), "auto", 1));
});
afterEach(() => vi.unstubAllGlobals());

describe("mock exam", () => {
  it("splits the total by weight exactly", () => {
    const a = allocate(10, { a: 2, b: 1, c: 1, d: 0 });
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(10);
    expect(a.a).toBe(5);
    expect(a.d).toBeUndefined();
  });

  it("draws the requested number of questions per book", async () => {
    const [book] = await db.books.toArray();
    const plan = await buildMockExam({ total: 5, weights: { [book.id]: 1 }, preferUnused: true, formats: [] });
    expect(plan.questions.length).toBe(5);
    expect(plan.perBook).toEqual([{ bookId: book.id, wanted: 5, got: 5, available: 8 }]);
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(5);
  });
});

describe("AI answer check", () => {
  it("stores Claude's verdicts and keeps only real option keys", async () => {
    updateSettings({ apiKey: "sk-test", model: "claude-opus-5" });
    const q = (await db.questions.toArray()).find((x) => x.stem.includes("thunderclap"))!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        expect(body.system[0].text).toContain("auditing a question bank");
        const items = [{ id: q.id, verdict: "disagree", suggested_keys: ["c", "Z"], suggestion: "MCA bifurcation", reason: "Test reason." }];
        return new Response(
          JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: JSON.stringify({ items }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
    const p = await runAnswerCheck([q], true, () => {}, new AbortController().signal);
    expect(p).toMatchObject({ done: 1, failed: 0 });
    expect(await db.aiReviews.get(q.id)).toMatchObject({ verdict: "disagree", suggestedKeys: ["C"], reason: "Test reason." });
    // already checked → skipped
    expect((await runAnswerCheck([q], true, () => {}, new AbortController().signal)).total).toBe(0);
  });
});
