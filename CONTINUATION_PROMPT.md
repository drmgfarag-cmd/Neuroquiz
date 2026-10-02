# NeuroQuiz continuation prompt

> **Document note:** Sections before **Current checkpoint — 2026-10-03** preserve historical work logs. Use the superseding current checkpoint at the end of this document for active paths, totals, validation status, and next actions.

You are continuing work on the NeuroQuiz repository in `/home/ubuntu/neuroquiz-work`, branch `offline-content-architecture`.

## User goal

Audit and improve NeuroQuiz into a completely offline browser/PWA study UI for Android and Windows. It must support a large medical library of roughly 3 GB without crashing the browser, load book bodies and media on demand, search globally across all books, create quizzes across multiple question banks, support cases and visual atlases, and let users correct content without destroying source provenance. No APK or installer is required for the core product.

## Completed architecture

- React/Vite/TypeScript UI.
- Dexie/IndexedDB only for user data and corrections.
- Static local JSON/media for built-in books.
- Metadata-only global indexes for search and quiz selection.
- On-demand body/media loading.
- Book kinds: question banks, cases, visual atlases, reference corpus.
- Adapter-normalized canonical records.
- Explicit media references; broad tags never attach thousands of unrelated images.
- Uncapped global search with confidence-descending ranking.
- Vite PWA shell/index caching with the arbitrary Workbox file-size cap removed.

## Current validated totals

- 51 manifest books; 51 ready and 0 review-gated.
- 20 question-bank/hybrid books, 25 case books, 2 visual atlases, 2 reference entries.
- 16,235 canonical questions.
- 2,293 canonical cases.
- 6,292 atlas entries.
- 13,869 media index entries.
- reference-link generation optimized with an inverted tag index.
- Full test suite: 50 library tests passed; full suite pending final run.
- Library validation: 0 errors.
- Production build: passed.

## Files to read first

```text
NEUROQUIZ_PROJECT_METHODS_AND_PLAN.md
UPLOAD_MISSING_PARTS.md
NEUROQUIZ_FULL_LIBRARY_VALIDATION.md
library/books.json
scripts/validate-library.mjs
src/import/normalize.ts
```

## Recent fixes already completed

- Case-level `question_images` and `answer_images` are mapped onto the first case stage and deduplicated.
- All 18 previously review-stage books were promoted after full validation.
- Canonical records and global indexes were rebuilt.
- Primary companion JSON files are no longer falsely reported as orphan sources by the validator.
- Tests and generated validation/index artifacts were updated.

## The “20 books” correction

The prior warning was **20 orphan files, not 20 books**:

1. Neuroradiology Boards Favorites: parts `.001-.003` and `.006-.009` are under `library/sources`; `.004-.005` are at the repository root.
2. Neurosurgery integrated exams: parts `.001-.010` and `.013` are under `library/sources`; `.011-.012` are at the repository root.
3. OCTS TIA and Stroke: `.001` is under `library/sources`; `.002` is at the repository root.
4. `VASC2017_extraction.json` is a declared book companion JSON, not a missing book.

No missing numbered part is proven from the current tree. Do not claim corruption without concatenating the split parts and running `unzip -t`. See `UPLOAD_MISSING_PARTS.md` for exact filenames and possible final-volume names.

## Citow reference corpus

- Registered as `citow-comprehensive-neurosurgery-board-review-2020`.
- Display title: **Comprehensive Neurosurgery Board Review (Citow et al., 2020)**.
- 15,065 reference records and 724 explicit captioned figure/table assets are indexed; 725 package files are shipped.
- Candidate citations remain unverified and must not be presented as answer evidence without review.

## Known content gaps

- `nbr3`: 1,326 readable but unscorable records due to missing options/answer structures. Do not invent answers or mark it scored-ready.
- Smaller isolated unscorable records exist in `nbr2013`, `07`, `09`, `nper`, `pnsbr2023`, `ntmcq2022`, `raj2009`, and `vasc2017`.
- Raw audit found 37,068 formatting findings in valid JSON; safe normalizer repairs are already applied at normalized output time.
- Do not overwrite original source archives.

## First actions in the new chat

```bash
cd /home/ubuntu/neuroquiz-work
npm install
npm run validate-library
npm test -- --run
```

Then:

1. Reconcile the misplaced split volumes only if the user wants those candidates classified.
2. Concatenate/test the three candidate archives.
3. Inspect extracted contents and classify schemas.
4. Add only complete candidates to `library/books.json` with `status: "review"`.
5. Work on an NBR3 source-specific repair adapter with tests.
6. Rebuild indexes and run all release gates.

## Non-negotiable safeguards

- Keep original sources unchanged.
- Keep all user corrections as provenance-preserving overrides.
- Never use `imaging` or another broad tag as a media link.
- Never infer answer keys or clinical corrections without source evidence.
- Never bulk-hydrate the full library into browser memory or one IndexedDB transaction.
- Never repeat the completed architecture migration unless a regression is demonstrated.

## Latest uploaded candidate state (2026-09-30)

- Manifest now has 51 entries: 51 ready and 0 review-stage.
- Promoted: Oxford Case Histories in Neurosurgery (67 cases) and Oxford Case Histories in TIA and Stroke (51 cases).
- Review-stage: updated NBR3 complete package and Greenberg Rapid Review hybrid book.
- Greenberg currently yields 2,003 questions, 6,907 study cards, 491 unscorable records, 795 warnings, and 9 unreferenced media assets. Keep it out of ready builds until a format-specific adapter is implemented.
- NBR3 remains at 1,326 unscorable records; do not infer missing answer keys.
- GH11 is now installed and ready. The TSNBE bridge remains at `library/bridges/TSNBE_GH11_topic_bridge_v4.zip` but is not auto-applied because the current integrated-question source has no matching `TSNBE:*` IDs; see `library/reference-metadata/gh11/TSNBE_GH11_BRIDGE_RECONCILIATION.md`.
- No handoff ZIP has been created.

## Final verification and next work queue (2026-09-30)

- Typecheck passed; full regression passed with 20 test files and 141 tests.
- Library validator passed: 51 manifest entries, 51 ready, 0 errors, 0 warnings.
- `npm run audit-json` scanned 253 JSON files / 1,450,663 strings and found 38,630 raw-source formatting candidates. `npm run audit-json-text` is now an equivalent alias.
- Do not mass-rewrite raw source. Continue with provenance-preserving repairs and page/render validation.
- Highest-priority unfinished adapter: Greenberg mixed-format handling and exact media linking.
- Ship NBR3 with 1,326 imported records; 30 explicit source-review records remain protected from scoring until rendered-source confirmation.
- Keep the TSNBE bridge unregistered until the matching reference book upload arrives.
- No handoff ZIP has been created in this session.


## Review-book repair update (2026-09-30)

- NBR3 now imports all 1,326 questions and 272 media assets with zero media errors. Only 30 explicitly flagged records remain source-review-gated; 67 visual-label records are playable typed-answer items.
- Greenberg Rapid Review now imports 8,761 canonical study units across its mixed formats and all 13 media assets are referenced. 95 units remain intentionally unscorable because the source supplies no defensible key or is a study/diagram record.
- All 51 library tests pass and typecheck passes.
- Do not create a ZIP in the next step unless the user explicitly requests it. Build and inspect the ready-to-run directories first.
- Detailed findings are in `REVIEW_BOOK_REPAIR_REPORT.md`.


## Current checkpoint — 2026-10-03

This section supersedes older totals and paths above. The active handoff root is `/home/ubuntu/neuroquiz-audit/neuroquiz-handoff-organized/project`, with authoritative extracted content at `../content/public-library/`. The manifest contains **60 books, all status ready**: 25 question banks, 4 hybrid question banks, 26 case books, 2 visual atlases, and 3 reference corpora. The current global totals are **32,840 questions, 2,431 cases, 6,292 atlas entries, 72,153 references/links as reported by the rebuild, and 16,824 media records**. The full suite is green at **21 test files / 165 tests**, typecheck passes, and the production PWA build passed before generated outputs were excluded from the compact handoff archive.

The five uploaded books from `Download.zip` were imported as `colen-flash-review`, `egyptian-fellowship-review`, `neuroicu-board-review`, `arab-board-review`, and `complete-neurosurgery-board-review`. Their original archives are preserved under `library/sources/`; extracted source folders are under `../content/public-library/`. The test harness now resolves both generated `public/library/` output and the extracted fallback, so the source-preserving compact handoff can run its full tests without generated duplicates.

The most recent stabilization fixes are: a recoverable top-level React error boundary (`src/components/AppErrorBoundary.tsx`), stronger Electron path containment using `path.relative`, sync-server token enforcement by default with explicit `SYNC_ALLOW_ANONYMOUS=1` opt-in, server-side synced-table allowlisting, and the extracted-source test fallback. Continue with index-sharding/mobile cold-start measurement, dialog focus trapping, task-based mobile navigation, source-level content review, and a new production build after code changes. Do not infer medical answer keys.
