# NeuroQuiz content remediation queue

## Purpose

This queue starts the content-quality phase without changing the supplied extracted source folders or inventing clinical answer keys. Every repair must preserve the raw source, retain record provenance, and include a focused regression test.

## Priority 0 — NBR3 source-review records

**Scope:** The original 30 NBR3 records were explicitly source-review-gated after the adapter repair; all 30 have now been source-confirmed and repaired or cleared through the ID-scoped normalizer layer.

- 18 visual comparison/comparison-sign records.
- 12 second-edition additions.
- 1,326 NBR3 questions are imported and readable.
- 272 media assets are imported with zero missing, unreferenced, or conflicting media.
- 67 visual-label questions are playable as typed-answer items.

**Acceptance criteria:**

1. Render each gated record with its supplied review card/source page.
2. Confirm the exact answer structure and any figure-label mapping.
3. Record the source page/card identifier in the correction/provenance report.
4. Only then remove the source-review gate for that record. **Completed for all 30 NBR3 records.**
5. If evidence is insufficient, keep the record readable but unscorable.

**Do not:** infer answers from topic tags, nearby questions, AI suggestions, or broad reference links.

## Priority 1 — Greenberg Rapid Review mixed-format cleanup

**Scope:** 8,754 canonical study units from the GRR-1 adapter; 13 media assets linked with no media integrity errors.

- 13 units remain intentionally unscorable after source-structure repair.
- Repaired Greenberg matching normalization so source answer menus are kept as choices and item prompts remain the scored options.
- Repaired nested matching items, figure-label matching (`GRR-01-031`), scalar true/false answers, and prose-wrapped multiple-choice answers where the source itself supplies the key.
- Remaining units include study sheets, blank sub-items, and answer-only diagrams where the source supplies no defensible key.
- The source records that full-book verbatim visual proofreading was not performed.

**Acceptance criteria:**

1. Keep unsupported study units in review/read mode.
2. Confirm nested fill-in, matching, true/false, ordering, and diagram records against the extracted source structure.
3. Require an explicit source answer/key before enabling scored mode.
4. Verify every media reference remains exact and local.

**Verified 2026-10-01:** Greenberg built-in library validation passes with 8,754 questions, 13 unscorable review/read units, zero missing images, zero unreferenced images, and zero role conflicts. The 13 remaining units are not promoted to scored mode.

## Priority 1.5 — Book 07 bounded answer-key repair

The supplied `07.pdf` was reviewed against the six currently unscorable MCQs. Three keys were explicit in the PDF and are now applied through stable source IDs: `07_089` → D (Kemp/Quadrant/extension-rotation test), `10_027` → C (chylothorax), and `12_102` → A (Rexed lamina I). The remaining three (`07_108`, `07_147`, `12_109`) remain unscorable because the supplied PDF does not provide a complete, unambiguous answer passage for those extracted records.

**Verified 2026-10-01:** Book 07 now has 1,219 playable questions, 3 intentionally unscorable units, zero missing/unreferenced/conflicting media, and zero source-review gates.

## Priority 1.6 — Book 09 source-omission governance

`09_s10_q1000` remains intentionally unscorable. The supplied `09.pdf` ends after its four choices; the source extraction audit records 999 answered records out of 1,000 and explicitly identifies question 1000 as missing its answer. No answer is inferred from general medical knowledge.

The normalized text layer also now repairs the reviewed 29 mojibake findings without modifying raw extracted JSON. Control-character findings remain classified as extraction artifacts or formula markers; their normalized display behavior is already covered by cleanup tests.

## Priority 2 — Source-text cleanup

The extracted-folder JSON audit currently reports formatting candidates rather than proven clinical errors:

- 15,123 repeated-spacing findings.
- 28,833 mixed-dash-spacing findings.
- 1,012 spaces before punctuation.
- 5,062 line-break hyphen candidates.
- 30 mojibake findings.
- 135 control-character findings.

Safe normalization is already applied to normalized runtime output. Raw extracted source must not be mass-rewritten. Each encoding/control-character finding requires context review before correction.

## Priority 3 — Reference-link review

Reference-link coverage is a candidate-link system, not proof of medical correctness. Candidate links must be reviewed before being described as answer evidence.

For each reviewed link/section, record:

- stable reference-section ID;
- candidate/reviewed/rejected status;
- confidence level;
- reviewer note;
- source page or section when available.

## Repair workflow

1. Select a bounded queue (maximum 30 records per review batch).
2. Render/read the source and the normalized record side by side.
3. Classify: confirmed, source ambiguity, extraction defect, or intentionally unscorable.
4. Apply only a provenance-preserving adapter/correction.
5. Add a regression fixture and test.
6. Rebuild indexes and rerun library validation.
7. Export the correction/provenance report.

## Release safeguards

- Original extracted folders remain unchanged.
- No answer key is inferred without source evidence.
- Source-review-gated records stay excluded from scored tests.
- Local corrections remain reversible.
- Reference links remain labeled as candidates until reviewed.
- Media links must remain explicit; broad topic tags cannot attach media.

## NBR3 explicit gated records

These were the 30 records carrying an explicit `review_required` marker at queue creation. They are now source-confirmed; the broad `REQUIRES_SOURCE_REVIEW` extraction marker is not itself treated as a defect.

| Record | Type | Reason | Question pages | Answer pages |
|---|---|---|---:|---:|
| NBR3_s01_q201 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s01_q202 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s02_q014 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s02_q021 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s02_q178 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s02_q222 | SBA | Source encoding anomaly | source record | source record |
| NBR3_from2_s03_q076 | EMI | Second-edition source check | source record | source record |
| NBR3_s04_q051 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q167 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q168 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q169 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q170 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q171 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s04_q176 | EMI | Source encoding anomaly | source record | source record |
| NBR3_from2_s04_q029 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s04_q128 | EMI | Second-edition source check | source record | source record |
| NBR3_s05_q103 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s05_q144 | SBA | Source encoding anomaly | source record | source record |
| NBR3_s06_q001 | SBA | Source encoding anomaly | source record | source record |
| NBR3_from2_s06_q049 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q050 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q051 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q052 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q053 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q054 | EMI | Second-edition source check | source record | source record |
| NBR3_from2_s06_q104 | SBA | Second-edition source check | source record | source record |
| NBR3_from2_s06_q108 | SBA | Second-edition source check | source record | source record |
| NBR3_s07_q073 | EMI | Source encoding anomaly | source record | source record |
| NBR3_s07_q113 | SBA | Source encoding anomaly | source record | source record |
| NBR3_from2_s07_q079 | EMI | Second-edition source check | source record | source record |

The normalized runtime record retains the exact page arrays. The reviewer must use those arrays when opening the supplied source rendering; the queue intentionally does not substitute inferred answers.

## Imported-book continuation — 2026-10-03

Five new source packages were extracted, preserved under `content/public-library/`, copied unchanged into `library/sources/`, normalized, and registered:

| Book ID | Imported records | Source-gated/unscorable | Media result | Release status |
|---|---:|---:|---|---|
| `colen-flash-review` | 996 questions | 30 | 249 referenced images; no missing media | Ready; source-null keys retained |
| `egyptian-fellowship-review` | 2,243 questions | 222 | 17 referenced images; no missing media | Ready; selected-only/missing-key records retained |
| `neuroicu-board-review` | 644 questions | 2 | Source package contains page images, but no JSON-linked media | Ready; provisional OCR/shared-stem limitations retained |
| `arab-board-review` | 763 questions | 699 | The supplied archive contains no crop files; normalized import omits broken references and records the omission | Ready; 64 source-marked/external keys retained |
| `complete-neurosurgery-board-review` | 290 questions + 28 cases | 0 questions | 37 referenced images; one unreferenced chapter plate excluded | Ready |

No answer was inferred from general medical knowledge. The five source archives remain byte-preserved and the derived correction layer remains reversible.
