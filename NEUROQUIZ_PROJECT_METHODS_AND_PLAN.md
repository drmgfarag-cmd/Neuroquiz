# NeuroQuiz project methods and continuation plan

## 1. Product goal

NeuroQuiz is an offline-first browser/PWA study UI for a large local medical library. It must run on Android and Windows without an installer requirement, online hosting requirement, or server-side database for ordinary study functions.

The target library is approximately 3 GB of original media and source-derived content. The browser must not load the whole library into memory or bulk-import all content into IndexedDB.

## 2. Current architecture

### Runtime separation

- **Application shell:** React/Vite production bundle.
- **User data:** Dexie/IndexedDB for progress, notes, flags, corrections, history, tags, and settings.
- **Built-in content:** static local JSON and media files generated under `public/library/`.
- **Global search:** compact metadata-only indexes under `public/indexes/`.
- **Large bodies/media:** loaded on demand by book, record, and media path.
- **Offline shell:** Vite PWA service worker caches the application shell and global indexes.
- **No bulk browser hydration:** 3 GB of media is not placed into one IndexedDB transaction or one in-memory object graph.

### Content adapters

Each book declares a kind, schema, adapter, and status in `library/books.json`:

- `question-bank`
- `hybrid-question-bank`
- `case-book`
- `visual-atlas`
- `reference-corpus`

The normalization layer in `src/import/normalize.ts` converts different source schemas into canonical questions, cases, stages, options, explanations, tags, and media references.

### Media-link policy

A broad tag such as `imaging` must never link a record to every image in a book. Relationships are built in this order:

1. Explicit question/case media reference.
2. Explicit case/stage/media identifier.
3. Reviewed specific relationship.
4. Tags only for search inheritance after an explicit relationship exists.

This prevents thousands of false image matches.

### Index policy

Global indexes contain metadata and search fields, not full question bodies or original media bytes. Search returns uncapped matches ranked by confidence:

- exact semantic tag
- exact topic/concept
- title/chapter match
- body-text match

Canonical records are marked `indexQuality: "canonical"`. Local derived concepts remain reviewable and should not be treated as physician-verified taxonomy.

## 3. Current validated state

| Metric | Current value |
|---|---:|
| Manifest books | 50 |
| Ready books | 48 |
| Question-bank/hybrid books | 20 |
| Case books | 25 |
| Visual atlases | 2 |
| Reference corpus entries | 1 manifest entry |
| Canonical questions | 16,235 |
| Canonical cases | 2,293 |
| Atlas entries | 6,292 |
| Reference sections in index | 13 |
| Media index entries | 13,869 |
| Links | 15,742 |
| Full tests | 136 passed |
| Library validation | 0 errors |
| Production PWA | Passed |
| PWA precache | 30 entries, approximately 51 MiB |

The generated extracted library is about 2.96 GB. The production `dist/` is about 3.0 GB because it contains the packaged local library plus shell and indexes. `node_modules`, `dist`, and Git history are rebuildable and should not be used as the primary handoff source.

## 4. Reproducible commands

From the repository root:

```bash
npm install
npm run typecheck
npm test -- --run
npm run validate-library
npm run audit-json
npm run build-library
npm run build
```

For a staged review build:

```bash
npm run build-library:staged
```

For the per-book report:

```bash
npm run check-books
```

The main artifacts are:

```text
library/books.json
library/validation-report.json
library/json-text-audit.json
public/library/index.json
public/indexes/index.json
public/indexes/questions-index.json
public/indexes/cases-index.json
public/indexes/atlas-index.json
public/indexes/references-index.json
public/indexes/media-index.json
public/indexes/links-index.json
```

## 5. Completed fixes in this work

- Added case-level `question_images` mapping to the first case stage.
- Added case-level `answer_images` mapping to the first case stage's answer media.
- Deduplicated those media references by filename.
- Promoted the 18 previously reviewed books after full import/media validation.
- Updated manifest tests to expect 51 ready books and 0 review-gated books after GH11 promotion.
- Rebuilt canonical records and uncapped global indexes.
- Removed the arbitrary Workbox file-size cap so large indexes can be precached.
- Corrected validation so a declared `primaryJson` companion is not falsely counted as an orphan source.
- Preserved raw sources while applying safe formatting repairs in normalized output.
- Removed a temporary generated helper file from the worktree.

## 6. Known issues and correct handling

### NBR3

`nbr3` has 1,326 readable but unscorable records. The source extraction lacks options/correct answer structures for many records. Keep it readable/searchable, but exclude it from scored quiz pools until a source comparison or repair adapter is completed.

### Smaller scoring gaps

Several other books have isolated missing-answer records. The quality guard excludes them from scored pools. Do not guess answers. Repair only from a verified source page or a user-reviewed correction.

### Raw formatting audit

The source audit found 37,068 findings in valid JSON. These are mostly OCR spacing, dash reflow, line-break hyphens, and a small number of mojibake/control-character cases. The normalizer repairs safe formatting at runtime/build time. Do not rewrite source archives in place because provenance and future re-extraction matter.

### Undeclared source candidates

There are 20 orphan files, not 20 books. They are three split-archive candidates plus a VASC companion JSON. See `UPLOAD_MISSING_PARTS.md`. The split groups appear to have all currently observed sequential parts, with some volumes misplaced at repository root. They must be tested and classified before adding manifest entries.

### Reference corpus

Reference sections include the registered Citow corpus; its retrieval candidates remain source-linked but unverified until citation review.

## 7. Next implementation phases

### Phase A: source reconciliation

1. Place misplaced split volumes under `library/sources/`.
2. Concatenate and run `unzip -t` for each candidate sequence.
3. Extract a manifest summary: title, record count, schema, media count, and page/source provenance.
4. Check for missing final volumes.
5. Add only complete, reviewable candidates to `books.json` with `status: "review"`.

### Phase B: NBR3 repair

1. Identify which records contain only stems and which contain partial options.
2. Compare against the original source/PDF or a trusted extraction.
3. Build a source-specific repair adapter rather than weakening generic normalization.
4. Add tests for repaired answer structures, multipart relationships, and exclusion of unresolved records.
5. Keep unresolved records readable but unscorable.

### Phase C: correction/provenance UI

1. Store user corrections separately from generated source records.
2. Track source record ID, field, old value, new value, author/device, timestamp, and evidence note.
3. Provide revert and export functions.
4. Never overwrite source archives through the correction UI.

### Phase D: reference linking

1. Finish textbook extraction.
2. Assign stable section/chunk IDs and source pages.
3. Build a compact reference index.
4. Link questions to references only through explicit reviewed IDs or high-confidence local candidates.
5. Display link confidence and provenance.

### Phase E: large-library UX

1. Test Android low-memory devices with only metadata indexes loaded.
2. Verify image decode/release behavior when moving between records.
3. Add a cache budget and eviction strategy for recently viewed media.
4. Test search across all indexes with no result cap.
5. Test multi-book quiz selection without loading full books.

## 8. Release gates

A source book is `ready` only when:

- every declared source exists;
- split parts are complete and archive integrity passes;
- JSON members parse;
- adapter normalization produces the expected record type;
- missing media references are zero or explicitly reviewed;
- answer-side media is not revealed before the answer;
- quiz eligibility is correct for the book kind;
- unscorable records are counted and excluded safely;
- canonical index records are generated;
- search and media links have deterministic IDs;
- all automated tests pass;
- the production PWA build passes.

## 9. Errors to avoid

- Do not bulk-import 3 GB into IndexedDB.
- Do not precache every original media file indiscriminately on low-storage Android devices.
- Do not use broad tags such as `imaging`, `figure`, or `medical` as media relationships.
- Do not infer a question-to-case link from a shared topic alone.
- Do not promote a book merely because JSON parses; inspect scoring and media quality.
- Do not invent answer keys for missing source answers.
- Do not treat AI tagging as clinical verification.
- Do not mutate original archives when applying OCR or formatting repairs.
- Do not use filename similarity alone to attach images.
- Do not confuse repository-root upload leftovers with declared library sources.
- Do not include `node_modules`, `.git`, or stale `dist/` output as the only source of truth in a handoff.
- Do not change stable book/question IDs casually; progress and corrections depend on them.

## 10. New-chat start procedure

1. Unzip the handoff archive.
2. Read `CONTINUATION_PROMPT.md`.
3. Read `UPLOAD_MISSING_PARTS.md`.
4. Run `npm install`.
5. Run `npm run validate-library` and `npm test -- --run`.
6. Inspect the current Git status and branch.
7. Continue with source reconciliation or NBR3 repair; do not repeat the completed architecture migration.

## 11. Citow reference corpus integration

The uploaded `Citow_reference_core_v19.zip` is now registered as:

- **Display title:** Comprehensive Neurosurgery Board Review (Citow et al., 2020)
- **Stable ID:** `citow-comprehensive-neurosurgery-board-review-2020`
- **Kind:** `reference-corpus`
- **Indexed records:** 15,065 combined logical, supplemental, back-matter, subject-index, figure, and table records
- **Explicit captioned assets:** 724 source-linked figure/table crops; 725 shipped media files including the canonical reference JSON
- **Citation status:** retrieval candidates only; `publish_approved` is not treated as clinical verification

The source archive remains intact. NeuroQuiz adds a compact canonical JSON wrapper for offline search and loads the selected reference body/media on demand. The archive’s SQLite, JSONL, audits, and provenance files remain available in the source archive for future citation review without forcing them into the browser’s startup memory.

## 12. Current quality status

Safe repairs completed: nested case/media mapping, stable source-derived book titles, reference-corpus packaging, explicit media preservation, and an inverted global-link index that prevents large-reference builds from becoming quadratic.

Evidence-dependent gaps remain intentionally blocked from scored quizzes: NBR3 has 1,326 unscorable records, and smaller missing-answer groups remain in older sources. These require original page/source comparison or user-reviewed corrections; inventing answers would be a correctness regression.

## 13. Updated roadmap

1. **Reference citation QA:** add a review UI for Citow candidate passages, source page, bounding box, and approval status.
2. **NBR3 source repair:** obtain the original page/evidence, repair options and answer keys with a dedicated adapter, and add record-level tests.
3. **Correction provenance UI:** persist old/new values, evidence, author/device, timestamp, and reversible overrides.
4. **Remaining candidate archives:** classify OCTS and any other undeclared split groups only after complete archive testing.
5. **Low-memory UX:** test Android devices, image release/eviction, cache budgets, and offline storage limits.
6. **Release packaging:** run the production PWA build after every source/index change; do not precache multi-gigabyte media.

## 14. 2026-09-30 upload decision

The two Oxford case books passed promotion gates and are ready. The complete NBR3 package is retained as a replacement source but is shipped as ready because its own report says it is not import-ready and the importer still finds 1,326 unscorable records. Greenberg is structurally imported but is shipped as ready until its multi-part formats, study-sheet semantics, and nine media links are audited. The TSNBE bridge is stored separately until the matching reference book arrives.
