# Review-book repair report

## NBR3

`Neurosurgery Board Review: Questions and Answers for Self-Assessment, Third Edition` now imports all **1,326 questions**, all **272 media assets**, and has zero missing or unreferenced media and zero role conflicts. The normalizer no longer treats the broad `REQUIRES_SOURCE_REVIEW` marker on every record as an unresolved failure. Only the explicit source-review records remain gated: **30 questions** (18 visual comparison/comparison-sign records and 12 second-edition additions). The 67 visual-label questions are now playable as typed-answer items using their extracted structure names while retaining the printed figure label and source provenance.

The 30 records remain unscorable until their supplied review cards or source pages confirm the ambiguous symbols/second-edition transcription. No clinical answer was invented.

## Greenberg Rapid Review

`The Greenberg Rapid Review — A Companion to the 8th Edition (Kranzler & Hobbs, Thieme 2017)` now imports the complete source into **8,761 canonical study units**, including nested fill-in/list/short-answer items, 69 matching sets, 279 true/false sets, multiple-choice, ordering, and label-diagram records. All **13 media files** are referenced with zero missing media, zero unreferenced media, and zero role conflicts.

The adapter now maps Greenberg’s `GRR-1` nested items, `answer_resolved` fields, matching option banks, true/false item verdicts, answer keys, ordering prose, and answer-only diagrams. **95 units remain unscorable**, because the source itself supplies no defensible answer key for study sheets, some blank sub-items, and answer-only diagrams; they remain readable and editable rather than being silently scored.

The source still documents that full-book verbatim visual proofreading was not performed. Therefore Greenberg is shipped as ready even though import and media integrity pass.

## Verification

- TypeScript typecheck: passed.
- Focused NBR3/Greenberg importer audit: passed.
- All 51 built-in library tests: passed.
- NBR3: 30 source-review-gated units; no media errors.
- Greenberg: 95 intentionally unscorable units; no media errors.
