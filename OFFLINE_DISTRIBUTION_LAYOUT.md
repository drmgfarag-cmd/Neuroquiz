# NeuroQuiz offline distribution layout

## Ready-to-run outputs

The complete browser/PWA build is produced in `dist/`. It contains the offline shell, global indexes, JSON bodies, and the optional local media files. It can be served from any static local web server or opened through the project’s supported browser/PWA workflow; it does not require an online content service.

The `dist-core/` output is the lightweight audit and study core. It keeps the app shell, `library/index.json`, all book JSON files, canonical records, and global indexes, but removes raster and vector media. Search, metadata browsing, question text, case text, reference text, and linkage auditing remain available. Missing images are resolved as unavailable rather than causing a crash.

The `dist-media/` output contains only the media tree matching the full build. To restore media to a core copy, copy `dist-media/library/<book-id>/` over `dist-core/library/<book-id>/`. The media files are never imported into IndexedDB; the browser opens them only when a user requests them.

## Source-of-truth organization

`library/books.json` is the manifest. `library/sources/` contains compact JSON/core archives and original book extraction sources. `library/media/` contains standalone media archives, including `GH11_reference_media_v38.zip`. `library/reference-metadata/` contains audit-oriented topic, summary, and media manifests that are not required for the core runtime. `library/bridges/` contains provenance-preserving cross-book linkage packages.

The GH11 runtime core has 56,422 searchable reference units, 5,391 topic routes, and 1,075 deduplicated media files. The source archive’s intermediate audits, scripts, duplicate generations, SQLite database, and unrelated files are not included in the runtime core. The original uploaded archive remains available outside the runtime package for provenance recovery.

## Build commands

```bash
npm install
npm run validate-library
npm test -- --run
npm run build
npm run package:offline
```

`npm run build` produces the full `dist/` application. `npm run package:offline` derives `dist-core/` and `dist-media/` from that verified build. The package command is reversible and does not modify `dist/`.

## Promotion and linkage policy

The manifest currently contains 51 books: 51 ready and 0 review-gated. NBR3 and Greenberg are import-complete but are shipped as ready for explicit source-quality reasons documented in `REVIEW_BOOK_REPAIR_REPORT.md`. NBR3 has 30 explicit source-review records protected from scoring, and Greenberg has 95 intentionally unscorable study/diagram units; both adapters and media mappings are complete.

The GH11 reference package is ready for search and reference navigation. The TSNBE bridge is preserved separately because its 2,187 question IDs (`TSNBE:*`) do not occur in the current integrated-examination source IDs. It must not be auto-applied until the matching TSNBE question package or an explicit ID map is supplied. Its topic suggestions remain review candidates, not answer-level clinical citations.

## Removal safety

Removing `dist-media/` or the media subdirectories inside `dist-core/` does not remove book JSON, indexes, user progress, or source linkage. Reinstalling the media tree is a file-copy operation. Do not delete `library/sources/`, `library/reference-metadata/`, or `library/bridges/` merely to reduce an app bundle; those directories preserve auditability and future reconstruction capability.
