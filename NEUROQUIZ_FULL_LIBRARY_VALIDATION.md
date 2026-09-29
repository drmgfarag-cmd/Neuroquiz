# NeuroQuiz Full Library Validation Report

**Repository:** `drmgfarag-cmd/Neuroquiz`  
**Branch:** `offline-content-architecture`  
**Validation date:** 2026-09-29  
**Validated revision:** `43f2b1a` plus the Workbox cache-limit fix in the working tree

## Executive result

The actual source archives were hydrated and validated.

| Gate | Result |
|---|---:|
| Manifest entries | 26 |
| Declared source files | 27 |
| Source archive/JSON integrity | PASS |
| Missing declared sources | 0 |
| Broken split archives | 0 |
| Full library packaging | PASS |
| Generated catalog books | 26 |
| Generated questions | 18,083 |
| Generated cases | 818 |
| Generated atlas entries | 833 |
| Generated reference sections | 13 |
| Generated media files | 5,512 |
| Generated deterministic links | 800 |
| TypeScript check | PASS |
| Production PWA build | PASS |
| Automated tests | 117 passed / 117 total |

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

The unoptimized packaging pipeline completed for all 26 configured books:

```text
npm run build-library
node scripts/build-indexes.mjs
```

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

There are **22 undeclared source groups**, comprising **107 files**. They were not imported or added to the 26-book manifest. They include additional likely future books such as:

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

These should remain staged until each source receives:

1. a stable manifest ID;
2. a content kind;
3. a schema and adapter;
4. a quiz-eligibility decision;
5. extraction-quality review;
6. media/reference-link validation.

### 4. Reference corpus is not yet declared

The current manifest contains zero `reference-corpus` entries. The generated index nevertheless contains 13 reference sections discovered in existing JSON content. The unfinished textbook extraction is still not declared as a separate corpus.

## PWA/offline finding fixed during validation

The full generated question index is approximately 16.8 MiB. The previous Workbox limit caused the production PWA build to fail because the index exceeded the configured precache threshold.

The limit was increased from 6 MiB to 64 MiB in `vite.config.ts`. The production build now completes and precaches approximately 20.6 MiB of application/index assets.

## Final recommendations

1. **Do not promote `nbr3` to fully scored status** until its answer/options extraction is repaired.
2. Keep the 22 undeclared source groups outside `books.json` until individually classified.
3. Add the extracted reference textbook as a dedicated `reference-corpus` manifest entry when its extraction is complete.
4. Keep full question bodies and media outside global indexes; continue loading them on demand.
5. Run this release gate after every source import or adapter change.
