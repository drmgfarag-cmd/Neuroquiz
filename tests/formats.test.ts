import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { exportBookZip } from "../src/import/exporter";
import { collectFiles, executeImport, planImport, type SourceFile } from "../src/import/importer";
import { normalizeBookJson } from "../src/import/normalize";
import { saveCorrection } from "../src/lib/corrections";
import { db } from "../src/lib/db";
import { applyChoice, correctSelection, isComplete, isCorrect, score, textMatches } from "../src/lib/grading";
import { buildPool, createSession, emptyFilter, recordResult } from "../src/lib/quiz";
import type { Question } from "../src/lib/types";

const base = new URL("../samples/sample-book/", import.meta.url);
const file = (p: string, text?: string): SourceFile => ({ path: `sample-book/${p}`, blob: new Blob([text ?? readFileSync(new URL(p, base))]) });
const allSample = () => [...["01-vascular.json", "02-oncology-trauma.json", "03-spine-functional.json", "04-question-types.json"].map((p) => file(p)), file("images/fig_cow.svg"), file("images/fig_edh.svg")];

const parsed = () => normalizeBookJson(JSON.parse(readFileSync(new URL("04-question-types.json", base), "utf8")), { fileName: "04-question-types.json", numericAnswerBase: 1 });
const asQ = (p: ReturnType<typeof parsed>["chapters"][number]["questions"][number]): Question => ({ ...p, id: p.sourceId!, bookId: "b", chapterId: "c", order: 0 });

describe("new question formats: parsing", () => {
  it("reads ordering, typed/cloze, hotspot and script-concordance items", () => {
    const r = parsed();
    expect(r.warnings).toEqual([]);
    const qs = r.chapters[0].questions;
    expect(qs.map((q) => q.format)).toEqual(["ordering", "ordering", "text", "text", "hotspot", "hotspot", "sct", "sct"]);
    expect(qs[0].answer).toEqual(["B", "D", "F", "A", "E", "C"]);
    // cloze: blank in the stem, the hidden word is the accepted answer
    expect(qs[2].stem).toContain("oral _____ 60 mg");
    expect(qs[2].accepted).toEqual(["nimodipine"]);
    expect(qs[2].options).toEqual([]);
    expect(qs[3].accepted).toContain("PComm");
    // pixels → fractions of the image
    expect(qs[4].regions![0]).toMatchObject({ x: 142 / 320, y: 42 / 220, w: 36 / 320, h: 34 / 220, label: "AComm aneurysm" });
    expect(qs[4].stemMedia).toEqual([{ file: "fig_cow.svg" }]);
    // standard −2…+2 scale and the modal panel answer
    expect(qs[6].options.map((o) => o.key)).toEqual(["-2", "-1", "0", "+1", "+2"]);
    expect(qs[6].answer).toEqual(["+2"]);
    expect(qs[6].panel).toMatchObject({ "+2": 9, "+1": 5 });
  });

  it("does not treat a typed-answer item as a flashcard", () => {
    const r = normalizeBookJson({ questions: [{ question: "Commonest site of hypertensive haemorrhage?", answer: "Putamen", type: "short_answer" }] }, { fileName: "x.json", numericAnswerBase: 1 });
    expect(r.chapters[0].questions[0]).toMatchObject({ format: "text", accepted: ["Putamen"] });
    expect(r.chapters[0].flashcards).toHaveLength(0);
  });
});

describe("new question formats: grading", () => {
  const qs = parsed().chapters[0].questions.map(asQ);

  it("ordering: exact order is correct, partial credit per position", () => {
    const q = qs[0];
    expect(isComplete(q, ["B", "D"])).toBe(false);
    const sel = applyChoice(q, [], "order", "B,D,F,A,E,C");
    expect(isCorrect(q, sel)).toBe(true);
    const swapped = ["D", "B", "F", "A", "E", "C"];
    expect(isCorrect(q, swapped)).toBe(false);
    expect(score(q, swapped)).toEqual({ right: 4, total: 6 });
  });

  it("text: ignores case, punctuation and articles, allows a small typo", () => {
    expect(textMatches("Nimodipine", ["nimodipine"])).toBe(true);
    expect(textMatches("  nimodipne ", ["nimodipine"])).toBe(true);
    expect(textMatches("nicardipine", ["nimodipine"])).toBe(false);
    expect(textMatches("the posterior communicating artery.", ["Posterior communicating artery"])).toBe(true);
    expect(textMatches("CN", ["CN III"])).toBe(false);
    expect(isCorrect(qs[3], ["pcom"])).toBe(true);
    expect(isComplete(qs[3], ["  "])).toBe(false);
  });

  it("hotspot: a click inside the region is correct", () => {
    const q = qs[4];
    expect(isCorrect(q, ["0.5,0.27"])).toBe(true);
    expect(isCorrect(q, ["0.1,0.9"])).toBe(false);
    expect(isCorrect(q, correctSelection(q))).toBe(true);
  });

  it("sct: full credit for the modal panel answer, partial for other panel answers", () => {
    const q = qs[6];
    expect(isCorrect(q, ["+2"])).toBe(true);
    expect(isCorrect(q, ["+1"])).toBe(false);
    expect(score(q, ["+1"]).right).toBeCloseTo(5 / 9);
    expect(score(q, ["-2"]).right).toBe(0);
    expect(applyChoice(q, ["+2"], "0")).toEqual(["0"]);
  });
});

describe("library with every format", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await executeImport(await planImport(allSample(), "auto", 1));
  });

  it("imports, filters by format and always shuffles ordering items", async () => {
    const pool = await buildPool({ ...emptyFilter(), formats: ["ordering"] });
    expect(pool).toHaveLength(2);
    const s = await createSession(pool, { mode: "tutor", title: "t", count: 0, shuffleQuestions: false, shuffleOptions: false, secondsPerQuestion: 60, recall: true, askConfidence: true });
    expect(s.recall).toBe(true);
    for (const q of pool) {
      const order = s.optionOrder![q.id];
      expect(order.slice().sort()).toEqual(q.options.map((o) => o.key).sort());
      expect(order).not.toEqual(q.answer);
    }
  });

  it("round-trips the new formats through a ZIP export", async () => {
    const before = (await db.questions.toArray()).filter((q) => ["ordering", "text", "hotspot", "sct"].includes(q.format ?? ""));
    const { blob, name } = await exportBookZip("sample-neurosurgery-review");
    await Promise.all(db.tables.map((t) => t.clear()));
    await executeImport(await planImport(await collectFiles([new File([blob], name)]), "auto", 1));
    for (const q of before) {
      const q2 = (await db.questions.get(q.id))!;
      expect(q2, q.stem).toBeTruthy();
      expect({ f: q2.format, a: q2.answer, acc: q2.accepted, r: q2.regions, p: q2.panel }).toEqual({ f: q.format, a: q.answer, acc: q.accepted, r: q.regions, p: q.panel });
    }
  });

  it("exports the book's own text, so ids match on the other device and the correction re-applies", async () => {
    const q = (await db.questions.toArray()).find((x) => x.stem.includes("thunderclap"))!;
    await saveCorrection(q, { stem: q.stem.replace("thunderclap", "sudden severe") });
    const { blob, name } = await exportBookZip("sample-neurosurgery-review");
    const correction = await db.corrections.get(q.id);
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.corrections.put(correction!); // arrives by sync
    await executeImport(await planImport(await collectFiles([new File([blob], name)]), "auto", 1));
    const q2 = (await db.questions.get(q.id))!;
    expect(q2).toBeTruthy();
    expect(q2.stem).toContain("sudden severe");
    expect(q2.edited).toBe(true);
  });

  it("keeps progress when a corrected edition changes a question's text", async () => {
    const q = (await db.questions.toArray()).find((x) => x.stem.includes("third nerve palsy"))!;
    await recordResult(q, true, 2);
    await db.annotations.put({ id: q.id, kind: "question", topic: "Cerebrovascular", subtopic: "Aneurysms & SAH", tags: [], keywords: [], source: "manual", updatedAt: 1 });
    const s = await createSession([q], { mode: "exam", title: "old", count: 0, shuffleQuestions: false, shuffleOptions: false, secondsPerQuestion: 60 });

    const text = readFileSync(new URL("04-question-types.json", base), "utf8").replace("most likely to arise from", "most likely arising from");
    const res = await executeImport(await planImport([...allSample().filter((f) => !f.path.endsWith("04-question-types.json")), file("04-question-types.json", text)], "auto", 1));
    expect(res.remapped).toBe(1);
    const moved = (await db.questions.toArray()).find((x) => x.stem.includes("third nerve palsy"))!;
    expect(moved.id).not.toBe(q.id);
    expect(await db.questionStates.get(moved.id)).toMatchObject({ timesSeen: 1, timesCorrect: 1, lastConfidence: 2 });
    expect(await db.annotations.get(moved.id)).toMatchObject({ source: "manual" });
    expect((await db.sessions.get(s.id))!.questionIds).toEqual([moved.id]);
    // unchanged questions keep their ids and nothing else moves
    expect(await db.questionStates.count()).toBe(2);
  });
});

describe("question images printed on the question page", () => {
  const q = (question: string) => ({ question, answers: { A: "a", B: "b" }, correct_answer: "A", question_images: ["fig.png"], image_attribution: "Gray's Anatomy" });
  const book = { question_images_policy: "referenced_only", questions: [q("Which structure of the eye refracts light?"), q("A CT scan is obtained, and a slice is shown below. What failed?"), q("An MRI of the brain is performed. What is the diagnosis?")] };

  it("moves images the question doesn't refer to into the explanation", () => {
    const [a, b, c] = normalizeBookJson(book, { fileName: "b.json", numericAnswerBase: 1 }).chapters[0].questions;
    expect(a.stemMedia).toEqual([]);
    expect(a.explanationMedia).toEqual([{ file: "fig.png", caption: "Gray's Anatomy" }]);
    expect(b.stemMedia).toHaveLength(1);
    expect(c.stemMedia).toHaveLength(1);
  });

  it("leaves other books alone", () => {
    const [a] = normalizeBookJson({ ...book, question_images_policy: undefined }, { fileName: "b.json", numericAnswerBase: 1 }).chapters[0].questions;
    expect(a.stemMedia).toHaveLength(1);
  });
});
