# NeuroQuiz complete organized handoff package

## Purpose

This is the complete offline NeuroQuiz working package as of 2026-09-30. It contains the application source, extracted/generated library data, global indexes, reference-hub linkage reports, tests, repair reports, design plans, and continuation roadmap.

The package is intentionally **not a collection of nested ZIP files**. Original source ZIP archives are excluded because their extracted content is already present in `content/public-library/` and/or the generated app content. The package is therefore directly inspectable and auditable.

## Layout

- `project/` — React/Vite/TypeScript source, scripts, tests, manifest, package lock, and documentation.
- `content/public-library/` — full extracted runtime library, including JSON bodies and media organized by book.
- `content/public-indexes/` — compact global question, case, atlas, reference, media, and link indexes.
- `ready-app-core/` — runnable media-free offline app build. It works with JSON/index data without requiring the large media tree.
- `reference-bridges/` — extracted bridge files and audit metadata; no bridge ZIP containers.
- `reports/` — copied machine-readable validation, text audit, and reference-hub coverage reports.

## Run from source

```bash
cd project
npm install
npm run build-library
npm run build
npm run preview
```

For local browser use, open the generated `project/dist/` through a static local server. Do not use `file://` for the Vite service worker; use `npm run preview` or another local static server.

## Run the included core app

The `ready-app-core/` directory is the media-free app distribution. It includes the app shell, JSON records, indexes, and linkage metadata. Copy a matching extracted media tree into its `library/` directory only when image/figure viewing is needed.

## Main design

- Offline-first browser/PWA operation on Windows and Android.
- Large content remains in local static files and is loaded on demand; user edits remain in IndexedDB.
- Citow and Greenberg Handbook 11e (GH11) are the two central reference hubs.
- Question books, cases, atlases, and reference corpora remain separate content kinds.
- Global indexes are metadata-only and uncapped; record bodies/media are fetched only when selected.
- Links are explicit, deterministic, auditable, and marked unverified until source-page review.

## Important limitations

- Generated topic links are navigation suggestions, not verified clinical answer citations.
- Source-quality warnings are preserved rather than silently inventing answers.
- The package excludes `node_modules`, `.git`, caches, temporary files, and original ZIP containers.
- The full extracted media tree is large; the core app is intentionally usable without it.

## First continuation actions

1. Read `CONTINUATION_PROMPT.md` and `NEUROQUIZ_PROJECT_METHODS_AND_PLAN.md`.
2. Inspect `CENTRAL_REFERENCE_ARCHITECTURE.md` and `reports/reference-hub-coverage.json`.
3. Improve low-coverage canonical tags before adding broad/fuzzy linkage.
4. Build explicit source-reference bridges where stable source IDs exist.
5. Add UI controls for filtering references by hub: Citow, GH11, or both.
6. Run typecheck, tests, library validation, JSON audit, and the reference-hub audit before each release.
