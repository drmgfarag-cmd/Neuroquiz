/**
 * The "book_extraction.json" format produced by the PDF extraction pipeline
 * (fields such as printed_number, answers{}, answer_key_map, option_verdicts,
 * parts, question_images/answer_images, case_scenario). Content is made up.
 */
import { describe, expect, it } from "vitest";
import { normalizeBookJson, parseChoiceList, reflow } from "../src/import/normalize";
import { answerSummary, applyChoice, correctSelection, isComplete, isCorrect, score } from "../src/lib/grading";
import type { Question } from "../src/lib/types";

const book = {
  book_id: "01",
  book_title: null,
  chapters: [
    {
      chapter_id: "01",
      chapter_name: "Autoimmune conditions",
      questions: [
        {
          question_id: "ch01_q1",
          printed_number: "1",
          question: "A 43-year-old with small cell lung cancer has proximal weakness.\nWhat is the most likely diagnosis?",
          answers: { A: "Polymyositis", B: "Lambert-Eaton myasthenic syndrome" },
          correct_answer: "B",
          explanation: "Correct answer is B\n\nLEMS is caused by antibodies against\npresynaptic calcium channels. This is\n\nparaneoplastic in about half of cases.",
          question_images: [],
          answer_images: ["images/01_ch01_q1_illA.png"],
          images: ["images/01_ch01_q1_illA.png"],
          parts: [],
          question_type: "SBA"
        },
        {
          question_id: "ch01_q2",
          printed_number: "2",
          question: "With regard to myasthenia gravis, which statements are true and which are false?",
          answers: { A: "It is autoimmune.", B: "Weakness improves with activity.", C: "The thymus should be imaged." },
          correct_answer: null,
          option_verdicts: { A: "TRUE", B: "FALSE", C: "TRUE" },
          explanation: "a. TRUE - autoimmune.\n\nb. FALSE - worsens with activity.\n\nc. TRUE - thymoma.",
          question_type: "MULTI_STATEMENT",
          parts: []
        },
        {
          question_id: "ch01_q3",
          printed_number: "3",
          question: "Select the diagnosis for each finding. i. GBM ii. Meningioma iii. Schwannoma iv. Oligodendroglioma",
          answers: { A: "Fried-egg cells in the frontal lobe", B: "Pseudopalisading necrosis" },
          correct_answer: null,
          answer_key_map: { A: "IV", B: "I" },
          question_type: "EMI",
          parts: []
        },
        {
          question_id: "ch01_q4",
          printed_number: "4",
          question: "Label the structures a–b on the diagram. i. Putamen ii. Thalamus iii. Caudate nucleus",
          answers: {},
          correct_answer: null,
          answer_key_map: { A: "III", B: "I" },
          question_images: ["images/01_ch01_q4_illQ.png"],
          question_type: "EMI"
        },
        {
          question_id: "ch01_q5",
          printed_number: "5",
          question: "A 45-year-old man has pain and loss of vision in the left eye. Fundoscopy is shown.",
          answers: {},
          correct_answer: null,
          question_images: ["images/01_ch01_q5_figQ.png"],
          answer_images: [],
          explanation: "Part A … Part B …",
          parts: [
            { part: "A", text: "What does the fundus show?", answers: { A: "Normal", B: "Papilloedema" }, correct_answer: "B", explanation: "Papilloedema." },
            { part: "B", text: "Regarding MS, true or false?", answers: { A: "Most start relapsing-remitting", B: "PPMS is commonest" }, answer_key_map: { A: "TRUE", B: "FALSE" } }
          ],
          question_type: "K_TYPE"
        }
      ]
    }
  ]
};

const spine = {
  book_id: "02",
  chapter_name: "Spine",
  chapters: [
    {
      chapter_name: "Spine",
      questions: [
        {
          printed_number: "1",
          question: "What is the most likely diagnosis?",
          case_scenario: "Figures 1a-1d are MR images of a 56-year-old man with back pain.",
          answers: { "1": "Disk herniation", "2": "Muscle strain", "3": "Epidural abscess", "4": "Tumour" },
          correct_answer: "3",
          correct_answer_text: "Epidural  abscess",
          question_images: ["images/02_ch01_q1-3_figQ.png"],
          images: ["images/02_ch01_q1-3_figQ.png"]
        },
        {
          printed_number: "2",
          question: "A patient has a WBC count of 14000/µL (reference range [rr],",
          answers: { "4500": "11000/µL). What is the best treatment?", "1": "Antibiotics alone", "2": "Aspiration", "3": "Surgery and antibiotics" },
          correct_answer: "3"
        }
      ]
    }
  ]
};

const parse = (j: unknown) => normalizeBookJson(j, { fileName: "01/book_extraction.json", numericAnswerBase: 1 });
const asQ = (p: ReturnType<typeof parse>["chapters"][number]["questions"][number]): Question => ({ ...p, id: "x", bookId: "b", chapterId: "c", order: 0 });

describe("extraction format", () => {
  const r = parse(book);
  const qs = r.chapters[0].questions;

  it("reads chapter names, keeps questions with empty parts and warns about nothing", () => {
    expect(r.chapters.map((c) => c.title)).toEqual(["Autoimmune conditions"]);
    expect(qs.map((q) => q.number)).toEqual(["1", "2", "3", "4", "5a", "5b"]);
    expect(r.warnings).toEqual([]);
  });

  it("keeps answer images out of the question and repairs PDF line breaks", () => {
    expect(qs[0].stemMedia).toEqual([]);
    expect(qs[0].explanationMedia).toEqual([{ file: "images/01_ch01_q1_illA.png" }]);
    expect(qs[0].stem).toBe("A 43-year-old with small cell lung cancer has proximal weakness. What is the most likely diagnosis?");
    expect(qs[0].explanation).toBe(
      "Correct answer is B\n\nLEMS is caused by antibodies against presynaptic calcium channels. This is paraneoplastic in about half of cases."
    );
  });

  it("reads true/false statements", () => {
    expect(qs[1]).toMatchObject({ format: "truefalse", verdicts: { A: true, B: false, C: true }, answer: ["A", "C"] });
    expect(qs[1].explanation.split("\n\n")).toHaveLength(3); // statements stay separate
  });

  it("reads extended matching with the list taken from the stem", () => {
    expect(qs[2].format).toBe("matching");
    expect(qs[2].stem).toBe("Select the diagnosis for each finding.");
    expect(qs[2].choices).toEqual([
      { key: "i", text: "GBM" },
      { key: "ii", text: "Meningioma" },
      { key: "iii", text: "Schwannoma" },
      { key: "iv", text: "Oligodendroglioma" }
    ]);
    expect(qs[2].matches).toEqual({ A: "iv", B: "i" });
  });

  it("creates items for diagram labelling without item text", () => {
    expect(qs[3].options.map((o) => [o.key, o.text])).toEqual([["A", ""], ["B", ""]]);
    expect(qs[3].stemMedia).toEqual([{ file: "images/01_ch01_q4_illQ.png" }]);
  });

  it("splits multi-part questions, sharing the case and image", () => {
    const [a, b] = [qs[4], qs[5]];
    expect(a.stem).toBe("A 45-year-old man has pain and loss of vision in the left eye. Fundoscopy is shown.\n\n**Part A.** What does the fundus show?");
    expect(a.answer).toEqual(["B"]);
    expect(a.explanation).toBe("Papilloedema.");
    expect(b.format).toBe("truefalse");
    expect(b.verdicts).toEqual({ A: true, B: false });
    expect(b.explanation).toBe("Part A … Part B …"); // falls back to the parent explanation
    expect(a.stemMedia).toEqual(b.stemMedia);
  });

  it("handles numbered options, case scenarios and OCR-split stems", () => {
    const [q1, q2] = parse(spine).chapters[0].questions;
    expect(q1.stem.startsWith("Figures 1a-1d are MR images")).toBe(true);
    expect(q1.options.map((o) => o.key)).toEqual(["1", "2", "3", "4"]);
    expect(q1.answer).toEqual(["3"]);
    expect(q2.stem).toBe("A patient has a WBC count of 14000/µL (reference range [rr], 4500 11000/µL). What is the best treatment?");
    expect(q2.options.map((o) => o.key)).toEqual(["1", "2", "3"]);
    expect(q2.answer).toEqual(["3"]);
  });
});

describe("grading", () => {
  const qs = parse(book).chapters[0].questions.map(asQ);
  const [single, tf, emi] = qs;

  it("grades true/false per statement", () => {
    let sel: string[] = [];
    sel = applyChoice(tf, sel, "A", "T");
    sel = applyChoice(tf, sel, "B", "T");
    expect(isComplete(tf, sel)).toBe(false);
    sel = applyChoice(tf, sel, "C", "T");
    expect(isComplete(tf, sel)).toBe(true);
    expect(isCorrect(tf, sel)).toBe(false);
    expect(score(tf, sel)).toEqual({ right: 2, total: 3 });
    sel = applyChoice(tf, sel, "B", "F");
    expect(isCorrect(tf, sel)).toBe(true);
    expect(isCorrect(tf, correctSelection(tf))).toBe(true);
  });

  it("grades matching per item and summarises the key", () => {
    const sel = applyChoice(emi, applyChoice(emi, [], "A", "iv"), "B", "ii");
    expect(score(emi, sel)).toEqual({ right: 1, total: 2 });
    expect(isCorrect(emi, correctSelection(emi))).toBe(true);
    expect(answerSummary(emi)).toContain("iv. Oligodendroglioma");
  });

  it("keeps single-answer behaviour", () => {
    expect(isCorrect(single, applyChoice(single, [], "B"))).toBe(true);
    expect(isCorrect(single, ["A"])).toBe(false);
  });

  it("keeps the instruction that follows a leading answer list", () => {
    const q = parse({
      questions: [{ question: "i. Re-bleed ii. Hyponatraemia iii. Vasospasm Regarding aneurysmal SAH: which complication?", answers: { A: "Day 7 deficit" }, answer_key_map: { A: "III" } }]
    }).chapters[0].questions[0];
    expect(q.stem).toBe("Regarding aneurysmal SAH: which complication?");
    expect(q.choices?.map((c) => c.text)).toEqual(["Re-bleed", "Hyponatraemia", "Vasospasm"]);
    const bare = parse({ questions: [{ question: "i. Alpha ii. Beta iii. Gamma", answers: { A: "x" }, answer_key_map: { A: "II" } }] }).chapters[0].questions[0];
    expect(bare.stem).toBe("Match each item with the best answer from the list.");
  });

  it("finds numbered lists and rejects out-of-sequence markers", () => {
    expect(parseChoiceList("Pick: 1. Alpha 2. Beta 3. Gamma", true)?.choices.map((c) => c.text)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(parseChoiceList("vitamin iv. something v. else")).toBeNull();
  });

  it("reflow keeps lists and tables", () => {
    expect(reflow("Causes:\n- one\n- two")).toBe("Causes:\n- one\n- two");
    expect(reflow("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
  });
});
