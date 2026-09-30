# NeuroQuiz handoff archive contents

This package contains the complete source work and hydrated source inputs needed to continue NeuroQuiz in a new chat.

## Included

- React/Vite/TypeScript application source (`src/`, `tests/`, scripts, configuration).
- `library/books.json` with all 44 ready books.
- `library/sources/` hydrated source archives and JSON files.
- Repository-root source uploads and candidate split parts that were present in the working tree.
- Generated canonical metadata and audit reports.
- `public/indexes/` global search indexes.
- `README.md`, `library/README.md`, and project validation documentation.
- `CONTINUATION_PROMPT.md` for starting a new chat.
- `UPLOAD_MISSING_PARTS.md` with exact orphan-file inventory and upload guidance.
- `NEUROQUIZ_PROJECT_METHODS_AND_PLAN.md` with architecture, methods, release gates, future phases, and error-avoidance rules.

## Intentionally excluded

These are rebuildable or transient and are not needed as source-of-truth:

- `.git/` history and Git worktree metadata.
- `node_modules/`; restore with `npm install`.
- `dist/`; regenerate with `npm run build`.
- `public/library/`; regenerate with `npm run build-library` or `npm run build`.
- TypeScript/Vite caches and logs.

The archive therefore avoids duplicating the approximately 3 GB generated library and does not hide source archives behind a stale build output. The hydrated original sources remain included under `library/sources/`.

## Restore

```bash
unzip neuroquiz-handoff.zip
cd neuroquiz-work
npm install
npm run validate-library
npm test -- --run
npm run build
```

If the archive is split, concatenate or use a split-aware extraction tool according to the archive part instructions in the delivery message.
