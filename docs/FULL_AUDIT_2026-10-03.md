# NeuroQuiz Full Audit and Stabilization Report

**Audit date:** 2026-10-03  
**Scope:** archive integrity, source reproducibility, offline architecture, build/index pipeline, content/provenance, runtime safety, visual/UI design, accessibility, security, performance, and release documentation.

## Executive result

NeuroQuiz has a sound product direction: a local React/Vite PWA, static source-derived medical content, IndexedDB user state, explicit provenance, and on-demand book/media loading. The five-book import and 60-book rebuild are complete and the core regression suite is green.

The audit identified one confirmed reproducibility defect and several high-value stabilization opportunities. The reproducibility defect is fixed: library acceptance tests now use the same extracted-source fallback as the build when generated `public/library/` output is absent. Three additional low-risk hardening fixes are also implemented: a recoverable React error boundary, robust Electron path containment, and safer sync-server defaults with table allowlisting.

The app should not yet be described as fully release-hardened for low-memory Android or clinically authoritative content. Those are measurement/governance gaps, not evidence that the offline architecture is wrong.

## Archive reconciliation

The earlier 9.0 GB archive was oversized because it combined multiple representations:

| Component | Approximate uncompressed size | Assessment |
|---|---:|---|
| `content/public-library/` extracted source/runtime folders | 4.26 GB | Required authoritative extracted content |
| `project/library/` source archives and manifests | 0.53 GB | Required source-preserving archive tree |
| `project/dist-media/` | 3.66 GB | Generated duplicate distribution; not required in handoff |
| `project/dist-core/` | 0.45 GB | Generated duplicate distribution; not required in handoff |
| `ready-app-core/dist-core/` | 0.37 GB | Older generated duplicate distribution |
| generated index copies | 0.28 GB | Rebuildable duplicate |
| reports, plans, code, and metadata | under 0.05 GB | Required documentation and source |

Therefore, the 9.0 GB archive was not simply “the five zipped books plus their extracted versions.” It included the complete extracted library and source archives, **plus three generated distribution copies and duplicate generated indexes**.

The replacement archive is verified at **4.5 GB**. It contains the complete extracted library, source archives, application source, tests, manifests, plans, audit reports, remediation queue, validation reports, and checksum metadata. It excludes only `node_modules`, `dist`, `dist-media`, `dist-core`, `ready-app-core`, generated `public/library`, and generated index copies because these are reproducible outputs.

## Documentation and handoff completeness

The handoff contains the original project methods/plan, prior technical audit, continuation prompt, content remediation queue, remediation completion report, validation artifacts, JSON text audit, reference reports, source archives, extracted library folders, code, tests, and package metadata. A current checkpoint was appended to the continuation prompt so the older historical totals do not remain the only visible state.

The current structured handoff files are:

- `docs/CONTINUATION_HANDOFF_2026-10-03.md`
- `docs/FULL_AUDIT_2026-10-03.md`
- `docs/CONTENT_REMEDIATION_QUEUE.md`
- `docs/REMEDIATION_COMPLETION_REPORT.md`
- `docs/SOURCE_CHECKSUMS_2026-10-03.json`
- `NEUROQUIZ_PROJECT_METHODS_AND_PLAN.md`
- `NEUROQUIZ_AUDIT.md`
- `CONTINUATION_PROMPT.md`

## Confirmed fixes implemented in this audit

### 1. Extracted-source test reproducibility

`tests/library.test.ts` previously searched only `project/public/library/` when the original source archives were absent. The compact handoff intentionally excludes generated runtime output, so the tests reported missing sources for valid extracted books. The test helper now tries generated `public/library/` first and then `../../content/public-library/`, using the matching runtime index in either location.

### 2. Recoverable application failures

`src/components/AppErrorBoundary.tsx` now catches render/route failures and displays a recovery surface with Try again, Return home, Reload app, and technical details. This prevents an exception from leaving an empty `#root`, including the previously reported Settings-route failure mode in stale generated builds. A fresh production route-smoke pass is still recommended after the next rebuild.

### 3. Electron path traversal hardening

`desktop/main.cjs` now uses `path.relative()` and rejects absolute or `..`-escaping paths rather than relying on a fragile string-prefix comparison.

### 4. Sync-server safety defaults

The optional sync server now rejects sync requests with HTTP 503 unless `SYNC_TOKEN` is configured. Anonymous operation requires an explicit `SYNC_ALLOW_ANONYMOUS=1` opt-in for a trusted isolated LAN. Incoming tables are allowlisted to the eight intended sync tables, and oversized change batches are rejected. `SYNC_CORS_ORIGIN` can replace the permissive default wildcard when a deployment has a known origin.

### 5. Documentation totals

The project methods/plan now reflects the current 60-book state, current counts, and current PWA index scale. The continuation prompt contains a superseding 2026-10-03 checkpoint.

## Current validation evidence

- `npm test -- --run`: **21 test files / 165 tests passed** after the fallback and stabilization fixes.
- `npm run typecheck`: passed after the stabilization fixes.
- Sync-server regression: no-token sync returns 503; bad token returns 401; valid-token path remains available.
- Earlier final release run: `npm run validate-library` reported 60 ready books with 0 errors and 0 warnings; `npm run check-books` passed all 60 books; `npx vite build` passed and generated the PWA service worker.

## Remaining technical risks and recommended fixes

### P1 — Large metadata indexes and cold-start pressure

The current build precaches approximately 293 MB of metadata/index files. The largest historical indexes are references, links, questions, and cases. JSON parse overhead can substantially exceed file size on Android. The architecture already loads book bodies/media on demand, but metadata still needs a measured low-memory strategy.

Recommended next work: shard indexes by kind/book, defer reference/link indexes until those features are opened, measure parse/startup/peak memory on a low-end Android device, and add a recovery path for quota or parse failure. Do not reintroduce a bulk 3 GB hydration step.

### P1 — Route smoke coverage

The new error boundary prevents a blank shell, but route-level smoke tests are still valuable. Add a lightweight route matrix for Home, Library, Tests, Flashcards, Cases, Search, Atlas, Reference, Statistics, Import, Answer Check, Tagging, and Settings under an empty database, first-run setup, offline mode, and legacy settings payloads.

### P1 — Modal accessibility

`DialogHost` focuses the initial action and handles Escape but does not trap focus within the modal or restore focus to the invoking control. Add focus cycling on Tab, `aria-labelledby` with a stable heading, and focus restoration. Avoid backdrop-click dismissal for destructive or multi-choice actions unless the action is explicitly cancel-safe.

### P1 — Content trust model

The current provenance layer correctly leaves source-null records unscorable. The UI should make that distinction visible at the point of use: source-confirmed, source-derived but unreviewed, AI suggestion, and local correction should not look equivalent. Candidate references should be labeled “Suggested reading” until reviewed, not presented as clinical evidence.

### P1 — Key storage and sync deployment

Browser localStorage remains plaintext for provider keys. This is acceptable only with an explicit threat-model warning. Native builds should use platform secure storage where available, and Settings should provide a clear “remove all provider keys” action. The sync server should be deployed only with a token, restricted CORS origin, TLS/reverse proxy, backups, and rate limiting.

### P2 — Navigation density and mobile ergonomics

The desktop sidebar exposes many destinations and the Home grid repeats them. Mobile bottom navigation currently carries seven destinations at very small labels. A calmer study workflow would expose four primary mobile destinations—Home, Library, Study, and More—with administration/AI/reference tools under More or contextual actions. Keep the saturated hero gradient for the primary study action and reduce decorative color/emoji elsewhere.

### P2 — Maintainability

`normalize.ts`, `importer.ts`, `QuizRunner.tsx`, `ImageViewer.tsx`, `Library.tsx`, and `Flashcards.tsx` are large concentration points. Split them incrementally only when adding related features; do not perform a broad rewrite during content stabilization.

## Release recommendation

The current product is suitable for continued controlled testing and source-preserving content work. Before a broad medical-study release, complete route smoke tests, modal accessibility, low-memory/index measurements, visible trust labels, and deployment hardening for optional sync. Continue to keep the raw source archives/folders immutable and keep all answer corrections ID-scoped and evidence-linked.
