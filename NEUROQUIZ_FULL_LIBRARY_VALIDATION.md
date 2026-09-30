# NeuroQuiz full-library validation report

**Repository:** `drmgfarag-cmd/Neuroquiz`  
**Branch:** `offline-content-architecture`  
**Validation date:** 2026-09-29  
**Scope:** hydrated source archives, normalized library, global indexes, tests, and production PWA

## Executive result

The offline large-library architecture is operational. All 50 manifest books are promoted to `ready`, the complete source-derived library builds, global indexes are generated without a result cap, and the production PWA builds successfully.

| Gate | Result |
|---|---:|
| Manifest entries | 50 |
| Ready entries | 48 |
| Question-bank/hybrid books | 20 |
| Case books | 25 |
| Visual atlases | 2 |
| Reference entries | 2 |
| Canonical questions | 16,235 |
| Canonical cases | 2,293 |
| Atlas entries | 6,292 |
| Reference sections | 13 |
| Media index entries | 13,869 |
| Deterministic links | 15,742 |
| Library validation | 0 errors |
| Full test suite | 136 passed / 136 total |
| TypeScript check | PASS |
| Production PWA build | PASS |
| PWA precache | updated after final PWA audit |
| Generated extracted library | about 2.96 GB |

## Architecture validation

The application does not bulk-import the 3 GB library into IndexedDB. User data remains in Dexie/IndexedDB, while built-in bodies and media remain static local files. The browser loads record bodies and media when needed. Global search and quiz selection use compact metadata-only indexes.

The generated outputs are:

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

Global search is uncapped and confidence-ranked. Exact semantic tags rank above topic/concept matches, title/chapter matches, and body-text matches. Broad tags such as `imaging` are not used as media relationships.

## Import and media-link fixes

The case normalizer now handles case-level `question_images` and `answer_images` by assigning them to the first case stage's question and answer media collections. References are deduplicated by filename.

This corrected the staged radiology brain/spine case shape. Both radiology books now pass with zero missing image references, zero unreferenced images, and zero role conflicts.

## Source integrity

All 50 declared books have present source declarations and build successfully. Split archives used by declared books passed the existing source checks. The complete build produced:

```text
build-library: images 2963.6 MB → 2963.6 MB
canonical-records: 48 books, 16235 questions, 2293 cases
build-indexes: 16235 questions, 2293 cases, 6292 atlas entries, 15078 references, 13869 media
```

## Data-quality findings

These are source/extraction issues, not importer crashes:

| Book | Unscorable records | Handling |
|---|---:|---|
| `nbr3` | 1,326 | Readable/searchable, excluded from scored pools until source repair |
| `pnsbr2023` | 22 | Excluded from scored pools |
| `07` | 6 | Missing reliable correct answers; excluded |
| `nbr2013` | 4 | Incomplete answer data; excluded |
| `09` | 1 | Source answer missing; excluded |
| `nper` | 1 | Source-quality concern; excluded |
| `raj2009` | 5 | Incomplete scoring data; excluded |
| `ntmcq2022` | 1 | Incomplete scoring data; excluded |
| `vasc2017` | 1 | Incomplete scoring data; excluded |

No answer keys were invented. The quality guard excludes unresolved records from scored pools while retaining them for reading/search and future correction.

## Text audit

`npm run audit-json` scanned 111 valid JSON files, 557,416 strings, and 50,519,551 characters. It found 37,068 source-level formatting findings:

| Finding | Count | Handling |
|---|---:|---|
| Repeated spacing | 18,608 | Safe normalization |
| Mixed dash spacing | 11,608 | Normalized during text reflow |
| Line-break hyphens | 5,288 | Rejoined during reflow |
| Space before punctuation | 864 | Safe normalization |
| Mojibake | 30 | Known repair mappings |
| Control characters | 54 | Safe cleanup/comparison restoration where known |

Original source archives remain unchanged. Repairs are applied through the shared normalization path and reflected in generated canonical records/indexes.

## Undeclared source candidates

The prior warning represented **20 files, not 20 books**. They form four groups:

1. Neuroradiology Boards Favorites: `.001-.003`, `.006-.009` in `library/sources`; `.004-.005` at repository root.
2. Neurosurgery integrated exams: `.001-.010`, `.013` in `library/sources`; `.011-.012` at repository root.
3. OCTS TIA and Stroke: `.001` in `library/sources`; `.002` at repository root.
4. `VASC2017_extraction.json`: a companion JSON for declared `vasc2017`, not a missing book.

The validator was fixed to recognize a declared `primaryJson` companion. The remaining split groups are not manifest books and must not be added until their concatenated archives are integrity-tested and their schemas/content are reviewed. The exact inventory and upload guidance is in `UPLOAD_MISSING_PARTS.md`.

## PWA validation

The production build completed with:

```text
vite build: passed
PWA generateSW: passed
precache: 30 entries (51930.70 KiB)
dist/indexes/questions-index.json: 20,908,407 bytes
dist/indexes/cases-index.json: 14,756,933 bytes
dist/indexes/media-index.json: 6,359,824 bytes
dist/indexes/links-index.json: 5,208,777 bytes
```

`vite.config.ts` uses `Number.MAX_SAFE_INTEGER` for Workbox's maximum cacheable file size so the large metadata indexes do not fail the build. Original multi-gigabyte media remains on-demand rather than being forced into the precache.

## Release commands

```bash
npm install
npm run typecheck
npm test -- --run
npm run validate-library
npm run audit-json
npm run build-library
npm run build
```

## Next priorities

1. Reconcile and test the three undeclared split-archive candidates.
2. Add only complete candidates as `review` books.
3. Repair `nbr3` with source evidence and a dedicated adapter.
4. Add reviewed question-to-reference citations for Citow; never auto-publish candidate matches as verified.
5. Add correction provenance UI and source-page evidence fields.
6. Test media cache eviction and low-memory Android behavior.

Do not bulk-hydrate 3 GB into browser memory, use broad tags for media links, overwrite source archives, or invent missing clinical answers.
