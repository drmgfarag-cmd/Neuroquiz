# Bundled content and image audit

Run `npm run check-books` to repeat the automated checks. The audit normalizes all nine bundled books, resolves question and explanation image references against their book's files, checks answer-labeled images do not appear before reveal, and reports missing keys and unused images. The checks are also part of the test suite.

| Book | Questions | Images | Missing references | Unused images | Unverified answer keys |
| --- | ---: | ---: | ---: | ---: | ---: |
| 01 | 112 | 27 | 0 | 0 | 0 |
| 02 | 88 | 34 | 0 | 0 | 0 |
| NBR2013 | 2,000 | 0 | 0 | 0 | 0 |
| 05 | 1,339 | 353 | 0 | 13 | 0 |
| 07 | 1,219 | 62 | 0 | 0 | 6 |
| 08 | 500 | 137 | 0 | 0 | 0 |
| 09 | 1,000 | 41 | 0 | 0 | 1 |
| NPQA2 | 686 | 106 | 0 | 0 | 0 |
| INBR | 1,300 | 270 | 0 | 0 | 0 |

Total: 8,244 normalized question records, 1,030 image assets, zero missing image references and zero detected answer-image role conflicts. Source entries in shared matching sets may combine into one playable record.

The 13 unused files in Book 05 remain unattached. In particular, `Book05_PracticeExam_Section4of5_Q72_image1.jpg` and `Book05_PracticeExam_Section5of5_Q1_image1.jpg` are stale, exchanged versions; the referenced `_CORRECTED.jpg` files match their respective questions on visual inspection. An unused image must never be assigned to a question solely because its filename resembles the question ID. Some questions legitimately share an image from the preceding question; this was checked against the source record for Book 02, NPQA2 and INBR.

Book 05 Practice Exam Section 5 Q1 had an answer of B but option B was absent from the extracted JSON. In the uploaded source PDF, page 356 (printed page 358), the missing option is **B. Hemangioblastoma**; the answer section on PDF page 419 confirms B. The option is restored. Book 05 now has no unscorable questions.

Seven questions without a reliable answer key remain readable in review and the Library's quality report. They are excluded from scored pools, grading, results denominators and revision statistics. The supplied Book 07 PDF omits explicit answer letters for its six affected questions; the Book 09 PDF stops after question 1000 without its answer. We did not guess any missing medical answer.

## Medical content review

The Book 05 source is a 2016 text. The supplied JSON contains mutually inconsistent claims: it asserts that all 1,339 questions were checked, but also says only about 100 were manually checked and includes a `known_unresolved_mismatches` list of 30 entries. These declarations cannot be treated as a reliable medical validation certificate. This audit resolved the demonstrable missing Q1 option and checked the high-risk dated guideline questions below; it did not perform a line-by-line clinical adjudication of 8,244 questions.

Book 05 Competencies Q8 asks explicitly about a **2010** intracerebral hemorrhage recommendation. Its D answer is retained as a historical classification exercise, with a warning that clinical advice should use the [2022 AHA/ASA ICH guideline](https://www.ahajournals.org/doi/10.1161/STR.0000000000000407). Book 05 Practice Exam Section 5 Q11 asks about the **7th ACCP** recommendations. Its B answer is retained as an answer to that named edition, with a warning that this is not a current perioperative protocol. Neither warning asserts that the source's historical answer has been disproved.

The Library's Content check links directly to source-flagged questions, including the `known_unresolved_mismatches` entries from the Book 05 metadata and the dated-guideline warnings. A flag calls for human review; it does not itself mean the printed key is wrong.

**Limits:** File resolution and role markers can be checked comprehensively, but a filename or JSON field cannot establish the clinical correctness of every figure or answer. Images with no clear question role are shown after answer reveal unless the stem refers to an image. The quality report surfaces missing references and unassigned assets for manual source review. A physician and the relevant current guidelines must adjudicate changes to clinical answers.
