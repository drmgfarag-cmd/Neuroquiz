import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linkInlineImages, normalizeBookJson } from "../src/import/normalize";

const load = (f: string) => JSON.parse(readFileSync(new URL(`../samples/sample-book/${f}`, import.meta.url), "utf8"));
const opts = (fileName: string) => ({ fileName, numericAnswerBase: 1 as const });

describe("normalizeBookJson", () => {
  it("reads a book/chapter object with letter-keyed options", () => {
    const r = normalizeBookJson(load("01-vascular.json"), opts("01-vascular.json"));
    expect(r.bookTitle).toBe("Sample Neurosurgery Review");
    expect(r.chapters).toHaveLength(1);
    const ch = r.chapters[0];
    expect(ch.title).toBe("Cerebrovascular");
    expect(ch.questions).toHaveLength(3);
    const [q1, q2, q3] = ch.questions;
    expect(q1.options.map((o) => o.key)).toEqual(["A", "B", "C", "D", "E"]);
    expect(q1.answer).toEqual(["B"]);
    expect(q1.stemMedia).toEqual([{ file: "fig_cow.svg" }]);
    expect(q2.answer).toEqual(["C"]);
    expect(q2.explanation).toContain("| Feature | Points |");
    // "A. Grade 1" style options + "C. Grade 3" answer
    expect(q3.options[2]).toMatchObject({ key: "C", text: "Grade 3" });
    expect(q3.answer).toEqual(["C"]);
    expect(r.warnings).toEqual([]);
  });

  it("groups a flat array by its chapter field and handles 1-based numeric answers", () => {
    const r = normalizeBookJson(load("02-oncology-trauma.json"), opts("02-oncology-trauma.json"));
    expect(r.chapters.map((c) => c.title)).toEqual(["Neuro-oncology", "Neurotrauma"]);
    const onc = r.chapters[0].questions;
    expect(onc[0].answer).toEqual(["B"]); // MGMT = 2nd option
    expect(onc[0].sourceTags).toEqual(["glioblastoma", "MGMT"]);
    expect(onc[0].number).toBe("4");
    const edh = r.chapters[1].questions[0];
    expect(edh.answer).toEqual(["B"]);
    expect(edh.stem).toContain("![](fig_edh.svg)");
    expect(edh.explanationMedia).toEqual([]);
    expect(edh.stemMedia).toEqual([{ file: "fig_edh.svg", caption: "Biconvex extra-axial collection" }]);
  });

  it("honours 0-based numeric answers when configured", () => {
    const r = normalizeBookJson([{ stem: "x?", choices: ["a", "b", "c"], correct_answer: 2 }], { fileName: "x.json", numericAnswerBase: 0 });
    expect(r.chapters[0].questions[0].answer).toEqual(["C"]);
  });

  it("reads option objects with correct flags, multi-answers, flashcards and cases", () => {
    const r = normalizeBookJson(load("03-spine-functional.json"), opts("03-spine-functional.json"));
    const ch = r.chapters[0];
    expect(ch.title).toBe("Spine & Functional");
    expect(ch.questions[0].answer).toEqual(["B"]);
    expect(ch.questions[1].answer).toEqual(["A", "B", "D"]);
    expect(ch.flashcards).toHaveLength(3);
    expect(ch.flashcards[2].front).toBe("Brown-Séquard syndrome");
    expect(ch.cases).toHaveLength(1);
    const c = ch.cases[0];
    expect(c.stages).toHaveLength(3);
    expect(c.stages[1].media).toEqual([{ file: "fig_cow.svg" }]);
    expect(c.stages[0].question).toContain("immediate investigation");
    expect(c.stages[0].answer).toContain("Non-contrast CT");
    expect(c.discussion).toContain("ISAT");
  });

  it("accepts separate option fields, answer text and nested explanation objects", () => {
    const r = normalizeBookJson(
      { questions: [{ Question: "Q?", option_a: "Alpha", option_b: "Beta", "Correct Answer": "beta", Explanation: { text: "because", images: ["e1.png"] } }] },
      opts("x.json")
    );
    const q = r.chapters[0].questions[0];
    expect(q.options.map((o) => o.text)).toEqual(["Alpha", "Beta"]);
    expect(q.answer).toEqual(["B"]);
    expect(q.explanation).toBe("because");
    expect(q.explanationMedia).toEqual([{ file: "e1.png" }]);
  });

  it("builds true/false options and parses answer_index as 0-based", () => {
    const r = normalizeBookJson(
      [
        { question: "The MCA is a branch of the ICA.", answer: true },
        { question: "Pick", options: ["x", "y"], answer_index: 1 }
      ],
      opts("tf.json")
    );
    const [tf, idx] = r.chapters[0].questions;
    expect(tf.options.map((o) => o.text)).toEqual(["True", "False"]);
    expect(tf.answer).toEqual(["A"]);
    expect(idx.answer).toEqual(["B"]);
  });

  it("renders JSON tables into markdown", () => {
    const r = normalizeBookJson([{ question: "Q", options: ["a", "b"], answer: "A", tables: [["Grade", "Feature"], ["1", "Mild"]] }], opts("t.json"));
    expect(r.chapters[0].questions[0].stem).toContain("| Grade | Feature |");
  });

  it("warns when an answer cannot be resolved", () => {
    const r = normalizeBookJson([{ question: "Q", options: ["a", "b"] }], opts("w.json"));
    expect(r.warnings.some((w) => w.includes("no correct answer"))).toBe(true);
  });
});

describe("linkInlineImages", () => {
  it("links bracketed, braced and bare file references but leaves markdown alone", () => {
    expect(linkInlineImages("See [Figure: a.png] and {{b.jpg}}")).toBe("See ![](a.png) and ![](b.jpg)");
    expect(linkInlineImages("shown in fig_3.png.")).toBe("shown in ![](fig_3.png).");
    expect(linkInlineImages("![x](c.png)")).toBe("![x](c.png)");
  });
});
