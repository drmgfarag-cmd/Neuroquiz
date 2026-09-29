# NeuroQuiz Full Library Validation Report

**Repository:** `drmgfarag-cmd/Neuroquiz`  
**Branch:** `offline-content-architecture`  
**Validation date:** 2026-09-29  
**Validated revision:** `43f2b1a` plus subsequent working-tree validation and index/PWA fixes

## Executive result

The actual source archives were hydrated and validated.

| Gate | Result |
|---|---:|
| Manifest entries | 44 |
| Ready manifest entries | 26 |
| Review-stage manifest entries | 18 |
| Declared source files | 45 |
| Source archive/JSON integrity | PASS |
| Missing declared sources | 0 |
| Broken split archives | 0 |
| Full library packaging | PASS |
| Generated catalog books by default | 26 ready books |
| Generated canonical questions | 13,572 |
| Generated canonical cases | 874 |
| Generated atlas entries | 833 |
| Generated reference sections | 13 |
| Generated media files | 5,512 |
| Generated deterministic links | 5,741 |
| TypeScript check | PASS |
| Production PWA build | PASS |
| Automated tests | 117 passed / 117 total, plus search-ranking regression |
| JSON files audited | 111 |
| Text-quality findings in raw source | 36,452 |

## Archive and source validation

All declared sources were checked against the hydrated `library/sources` directory.

- Direct JSON sources parsed successfully.
- Direct ZIP archives opened successfully.
- Split ZIP archives were concatenated in order and opened successfully.
- ZIP integrity checks reported no corrupt members.
- Sampled JSON members inside archives parsed successfully.
- No declared source was missing.

The declared source set occupies approximately **3.1 GB** in the repository. The generated application library occupies approximately **1.4 GB** after extraction and media retention.

## Full packaging result

The default packaging pipeline continues to package only the 26 `ready` books. The 18 newly classified books are in `review` status and are available through the same manifest, validation, normalization, and optional staged-build pipeline without being shipped to the runtime bundle prematurely.

```text
npm run build-library
node scripts/build-indexes.mjs
```

Before global indexing, `scripts/build-canonical-records.mjs` bundles and runs the existing `src/import/normalize.ts` implementation. This is the same normalization path used by the runtime importer. The global index then consumes the normalized questions and cases rather than classifying raw nested JSON independently.

Canonical normalization covered all **26/26 books** and produced **13,572 questions** and **874 cases**. Visual-atlas entries continue to come from their atlas schema, because the question/case normalizer correctly does not reinterpret atlas rows as questions.

Semantic tags and navigation context are separate fields. A source chapter is stored as `contextTags` (for example `chapter:neuroanatomy`), not as the question's semantic `tags`. Local concept extraction adds specific concepts from normalized question text, such as `brachial plexus`. These derived tags are marked `tagQuality: "derived-local"` until reviewed or enriched.

Generated outputs:

```text
public/library/index.json
public/indexes/index.json
public/indexes/questions-index.json
public/indexes/cases-index.json
public/indexes/atlas-index.json
public/indexes/references-index.json
public/indexes/media-index.json
public/indexes/links-index.json
```

Every file listed in the generated catalog exists on disk.

## JSON index readiness assessment

The raw JSON files are **readable and packageable**, but they are not all ready to serve as an authoritative semantic index without normalization.

The current global index generator consumes adapter-normalized records. It is authoritative for normalized structure, while locally derived semantic tags remain reviewable:

- source tags and normalized annotation tags are preserved;
- chapter and section values are stored as `contextTags`, not semantic question tags;
- missing semantic tags receive deterministic local concept candidates and are marked `tagQuality: "derived-local"`;
- shared broad terms such as `imaging`, `image`, `figure`, and `medical` are not used as media relationships;
- 3,068 question-to-media links are based on explicit image/media references on the question record, not shared broad tags;
- question tags are inherited only onto the directly referenced media records;
- source-specific answer structures, EMI relationships, multipart questions, and case-stage relationships are not fully represented by the raw scan;
- generated question and case records are marked `indexQuality: "canonical"`.

The implemented pipeline now normalizes each book through the existing adapter-compatible `normalizeBookJson` path first, then generates canonical indexes from normalized records. AI tagging and reference linking remain a separate enrichment step and are marked unverified until reviewed.

### Precise image relationship result

The linker now distinguishes:

```text
question → media       basis: explicit-media
case → media            basis: explicit-media
question → case         basis: shared-specific-tag
```

An `imaging` tag alone cannot link a question to every image in a book. The image must first be explicitly referenced by that question or case. Only then are the question/case tags inherited by that media record.

The current full canonical build produced **3,068 question-to-media links** and **2,673 case-to-media links**. Inferred question-to-case links are intentionally disabled: a shared topic is not proof that a case belongs to a question. Future question-to-case links should come from explicit source group IDs, case IDs, or reviewed reference enrichment. All question and case records in the global indexes are marked `indexQuality: "canonical"`.

## Data-quality findings

### 1. `nbr3` requires remediation before being treated as a scored question bank

The library test reports:

```text
1,326 questions
1,326 unscorable
134 warnings
```

The warnings indicate that many records have:

- no correct answer;
- no options;
- extracted question text without a usable answer structure.

These questions remain readable content but are excluded from scored quiz pools by the existing quality guard. The book should be marked `review` or assigned a repair adapter before being considered fully quiz-ready.

### 2. Other smaller unscorable groups

| Book | Unscorable records | Main reason |
|---|---:|---|
| `nbr2013` | 4 | missing/invalid answer data |
| `07` | 6 | missing correct answers |
| `09` | 1 | missing correct answer |
| `nper` | 1 | quality failure |
| `pnsbr2023` | 22 | incomplete scoring data in extracted records |
| `ntmcq2022` | 1 | incomplete scoring data |
| `raj2009` | 5 | incomplete scoring data |
| `vasc2017` | 1 | incomplete scoring data |

These are isolated and are already protected from scored pools by `unscorableReason()`.

### 3. Undeclared future source groups

There are **20 remaining undeclared/incomplete source files or groups**. Eighteen complete groups were added to the manifest in `review` status; four incomplete or invalid groups remain outside the manifest until their missing parts are supplied. They include:

- `CBBI`
- `CBINR`
- `NBE_CV`
- `NBE_NO`
- `NBE_NT`
- `NBE_PD`
- `NBE_SP`
- `NCBA`
- `NRCR`
- `NSCB`
- `Neuroradiology_Boards_Favorites_Case_Extraction`
- `Neurosurgery_exams_integrated_2003_01_20_scored`
- `Radiology_Case_Review_Brain_Imaging_extracted`
- `Radiology_Case_Review_Spine_extracted`
- `Ward_Rounds_Clinical_Neurology_extracted`
- `practical neurosurgery cases`
- several additional board-review and case-review archives

The newly added books remain staged until each source receives:

1. extraction-quality review;
2. media/reference-link validation;
3. a final quiz-eligibility decision;
4. promotion from `review` to `ready`.

Use `npm run build-library:staged` to package them for review without repeating the architecture or indexing work.

### 5. Full text-quality audit

`npm run audit-json` scanned **111 JSON files** and **557,416 strings** across declared sources. It found:

| Finding | Count | Handling |
|---|---:|---|
| Repeated spacing | 18,608 | Removed in normalized output |
| Mixed dash spacing | 11,608 | Preserved/normalized during text reflow |
| Line-break hyphens | 5,288 | Rejoined during text reflow |
| Space before punctuation | 864 | Removed in normalized output |
| Mojibake | 30 | Known UTF-8 repair mappings applied |
| Control characters | 54 | Comparison symbols restored where identified; other controls removed |

The original archives remain unchanged for provenance. Safe repairs occur in the shared normalizer, so imported questions, search indexes, and reference text use corrected normalized text. The audit report is written to `library/json-text-audit.json` for source-level review.

### 6. Uncapped confidence-ranked search

Global search no longer truncates results to 100 or 500 records. Every matching result is returned with `searchConfidence`, sorted descending. Exact semantic tags rank above topic matches, title matches, and body-text matches. The Search page now uses this confidence score when combining local database and global-index results.

### 4. Reference corpus is not yet declared

The current manifest contains zero `reference-corpus` entries. The generated index nevertheless contains 13 reference sections discovered in existing JSON content. The unfinished textbook extraction is still not declared as a separate corpus.

## PWA/offline finding fixed during validation

The full generated question index is approximately 16.8 MiB. The previous Workbox limit caused the production PWA build to fail because the index exceeded the configured precache threshold.

The arbitrary per-file limit has now been removed in `vite.config.ts` by setting Workbox's maximum to `Number.MAX_SAFE_INTEGER`. The production build completes and precaches approximately 20.6 MiB of application/index assets.

## Final recommendations

1. **Do not promote `nbr3` to fully scored status** until its answer/options extraction is repaired.
2. Keep the remaining incomplete source groups outside `books.json` until missing parts are supplied.
3. Promote the 18 review-stage books only after their book-level extraction checks pass.
4. Add the extracted reference textbook as a dedicated `reference-corpus` manifest entry when its extraction is complete.
5. Keep full question bodies and media outside global indexes; continue loading them on demand.
6. Run this release gate after every source import or adapter change.
