# NeuroQuiz — Independent Audit & Phased Roadmap

Branch audited: `offline-library-handoff-2026-10-03` @ `eb9e981` (2026-10-03).
Method: read README, `NEUROQUIZ_PROJECT_METHODS_AND_PLAN.md`, `docs/*`, `library/books.json`; ran `npm ci`, `tsc -b`, `vitest`, `build-library`, `vite build`; reviewed key source files; online research (sources at the end).

---

## 1. Scope & goals (as documented)

Offline-first neurosurgery study app (React 19 + Vite PWA, Dexie/IndexedDB, Capacitor Android, Electron Windows, optional zero-dependency sync server, BYO-key AI: Claude/OpenAI/Gemini/Grok). Library: 60 books (~32.8k questions, 2.4k cases, 6.3k atlas entries, 72k reference links, 16.8k media). Goals: no server needed for study; never bulk-hydrate 3 GB; provenance-first (never invent answer keys); stable IDs so progress survives re-imports.

## 2. Audit findings

Severity: **P0** blocks use/release · **P1** high value · **P2** polish.

### A. Repo / build integrity

| # | Sev | Finding | Evidence |
|---|---|---|---|
| A1 | P0 | **A fresh clone cannot build.** `npm run dev` / `build` run `prebuild`→`build-library.mjs`, which crashes with `ENOENT … NBR3_with_second_edition_additions_complete.zip`. **15 of 60 manifest books point at files that are not in the repo** (nbr3, citow, ochn, octs, greenberg-rapid-review, gh11, neuropathology, pediatric-mcqs, surgical-neuro-oncology, imaging-spine, colen, egyptian, neuroicu, arab-board, complete-neurosurgery). The extracted fallback `../content/public-library` is not in the repo either. | `node scripts/build-library.mjs` |
| A2 | P0 | **Handoff docs describe a different tree than the repo.** Docs cite `project/`, `npm run validate-library`, `audit-json`, `build-library:staged`, 165 tests / 21 files, `NEUROQUIZ_AUDIT.md`, `UPLOAD_MISSING_PARTS.md`. Repo has none of those scripts/files; 17 test files / 95 non-library tests pass. The 60-book validation claims cannot be reproduced from GitHub. | `package.json`, `ls` |
| A3 | P0 | **Architecture drift.** The plan says "no bulk IndexedDB hydration, metadata indexes on demand" and builds `public/indexes/*`, but **`src/` never reads those indexes**. The app still imports every bundled book into Dexie on first launch (`src/lib/library.ts`) and does `db.questions.toArray()` for search (`search.ts`), pools (`quiz.ts`), Home stats, tagging. At 32.8k questions + text this is the real low-memory/cold-start risk; the generated 293 MB index set is unused by the UI. | grep `indexes/` in `src` → 0 hits |
| A4 | P1 | Repo is **3.4 GB** (`library/sources` 3.3 GB + 14 loose zip volumes/zips at root, ~200 MB). Orphan/misplaced volumes (`NRCR.zip.004/.005`, `Neuroradiology…zip.004/.005`, `Neurosurgery_exams…011/.012`, `OCHN…001/.002`, `OCTS…002`, `Surgical_Instruments…part004`) plus 4 unregistered books (ACNCM, Absolute Case-Based Neurology, Absolute Neurocritical Care, Epilepsy Board Review 2026). Git history cannot shrink these later without rewriting history. | `git ls-files` |
| A5 | P1 | CI (`apps.yml`) runs `npm test` + `npm run build`; A1 makes it red on every PR. No library gate on a pipeline that can't see the library. | workflow |
| A6 | P2 | `tests/library.test.ts` silently yields zero tests when sources are absent → false green. | test header |

### B. Legal / content governance

| # | Sev | Finding |
|---|---|---|
| B1 | **P0** | The **public** repo contains ~60 commercial textbooks/question banks (Thieme, Springer, Greenberg, Citow, etc.) with `licenseStatus: "unknown"` / `"user-supplied-extraction"`. Public hosting of unlicensed copyrighted text is a DMCA-takedown and personal-liability risk; GitHub also posts notices publicly. **Make the repo private (or remove content) before anything else**; ship code-only publicly. |
| B2 | P1 | Clinical-authority labelling is not visible in the UI (source-confirmed vs unreviewed vs AI vs user-corrected). Citow candidate links should read "Suggested reading". Already identified in the prior audit — still open. |
| B3 | P1 | Dated-guideline items (2010 ICH, 7th ACCP, 2016 text) need an "outdated — see current guideline" badge system, not one-off warnings. |
| B4 | P2 | 15k+ spacing / 28k dash / 5k hyphen / 30 mojibake / 135 control-char findings are runtime-normalised only; keep it that way, but add a visible "report text error" shortcut on each record (exists for questions; extend to cases/atlas). |

### C. Code, correctness & security

| # | Sev | Finding |
|---|---|---|
| C1 | P1 | `DEFAULT_MODEL = "claude-opus-5"` — verify against the live model list; the current IDs are versioned (e.g. `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5-20251001`). Make the default fetched from "Load models" and fall back gracefully on 404. |
| C2 | P1 | **API keys in `localStorage` plaintext** (`settings.ts`) and browser-direct calls (`dangerouslyAllowBrowser`). Use Keystore-backed secure storage on Android (e.g. `capacitor-secure-storage`, AES-GCM with Android Keystore) and OS keychain/`safeStorage` in Electron; keep web as "session-only by default" with a warning. Add "Remove all provider keys". |
| C3 | P1 | Sanitizer (`markdown.ts`) is a hand-written DOM allow-list that removes only script/style/iframe/object by name and keeps `ALLOWED_ATTR`; replace with DOMPurify (small, audited) and add a CSP (`default-src 'self'; connect-src` limited to the 4 AI hosts + user sync URL; `img-src 'self' blob: data:`). `dangerouslySetInnerHTML` in `Rich.tsx` is the only XSS sink, so one fix covers it. |
| C4 | P1 | Sync server: CORS `*` default, 50 MB body, no rate limit, plaintext HTTP. Document/automate: token required (done), `SYNC_CORS_ORIGIN`, TLS via reverse proxy/Tailscale, per-device tokens. Consider end-to-end encryption of rows. |
| C5 | P1 | **One 1.07 MB (319 KB gz) JS chunk**; no `React.lazy` routes. Anthropic SDK is bundled even for users who never use AI (only when `provider=claude`). Code-split by route and dynamic-import each AI provider. |
| C6 | P1 | Search index is rebuilt in the main thread from `toArray()` of all questions/cards/cases with a count-based signature (`search.ts`). Move to a Web Worker, persist the serialised MiniSearch snapshot in IndexedDB/OPFS, update incrementally per book. At 30k+ docs the first search will freeze low-end phones. |
| C7 | P1 | FSRS is **FSRS-5 (19 weights)**. FSRS-6 (21 weights: same-day-review term + per-user forgetting-curve decay) is current; add the parameters, a retention slider (80–97 %) and a local optimizer from review history. |
| C8 | P1 | Workbox: `maximumFileSizeToCacheInBytes 6 MB`, `globIgnores library/**`, books copied to IndexedDB. Fine for the dev build but incompatible with the new "static library + indexes" plan (A3). Needs a decided strategy (see Phase 2). |
| C9 | P2 | Dialog focus-trap **is implemented** (`Dialog.tsx`), so the prior audit's "P1 modal a11y" item is stale — only `aria-labelledby`/`role="dialog" aria-modal` verification remains. Only 63 `aria-`/`role` attributes across the whole UI → needs a real a11y pass (images in viewer, drag-ordering, hotspot questions need keyboard/AT alternatives). |
| C10 | P2 | Large files: `normalize.ts` (1.6k lines), `importer.ts`, `QuizRunner`, `ImageViewer`, `Library`, `Flashcards`. Split only when touched. |
| C11 | P2 | Mixed tooling versions to confirm in CI (TypeScript ^7, Vite ^8, Vitest ^5 resolve and pass here — pin via lockfile, add Renovate). |

### D. UX / visual (from docs + CSS review; run a Lighthouse + device pass to confirm)

- Navigation overload: desktop sidebar + Home grid duplicate ~13 destinations; mobile bottom bar has 7 tiny items → move to **Home · Library · Study · Stats · More**.
- Saturated gradient + emoji everywhere competes with content; keep colour for primary action and status only.
- Only 11 `@media` rules / one `prefers-color-scheme`; no density setting, no font-size control, no high-contrast theme.
- Touch targets: audit against WCAG 2.2 SC 2.5.8 (≥ 24×24 CSS px; aim 44 px for primary study controls).
- Study flow gaps: no resume banner after a killed app, no per-question timer pacing, no "why I missed it" capture.

---

## 3. Research-backed enhancement opportunities

| Area | Idea | Basis |
|---|---|---|
| Exam realism | Mock exams already include 375 q. Align weights to the **ABNS 2026 blueprint** (Neurosurgery 22 %, Critical care 17 %, Neuroimaging 15 %, Neuroanatomy 13 %, Neuropathology 12 %, Neurology 11 %, Neurosciences 8 %, Core competencies 2 %) and report performance per blueprint category. | ABNS |
| Readiness | Competitor Qbanks (UWorld, AMBOSS) differentiate on **score predictors, study planners, adaptive weak-area selection, cross-linked reference library**. Build local equivalents: predicted-% by blueprint category with confidence interval, exam-date study planner, "weakness-first" pools. | Qbank comparisons |
| SRS | FSRS-6 + optimizer; "leech" handling; daily new/review caps; suspend/bury; per-deck retention. | FSRS refs |
| Storage | Request `navigator.storage.persist()`, show `storage.estimate()` meter, store media in **OPFS** with LRU eviction; Chrome/Edge allow large quotas but may evict non-persistent origins. | MDN/Edge/web.dev |
| Search | Keep MiniSearch (7 KB, serialisable snapshots) for offline; consider FlexSearch if > 100k docs; run in a worker; shard per kind. | Library comparisons |
| Secrets | Native secure storage plugins (Keystore/Keychain). | Capacitor plugins |
| Accessibility | WCAG 2.2 AA: 4.5:1 text, 3:1 controls, 24 px targets, equal contrast in dark mode. | W3C |
| AI | Local-first "explain why" caching, answer-grounded tutor that cites the book record/page, Socratic oral-board examiner with rubric scoring, voice mode for oral-board practice, image-differential trainer for atlas cases. All AI output labelled "AI — unverified". | feature gap analysis |

---

## 4. Phased plan

### Phase 0 — Stop the bleeding (1–3 days)
1. **Make the repo private** (or strip `library/sources` + root zips) — B1.
2. Move 14 root-level zips/volumes into `library/sources/` or delete; register or park the 4 unregistered books (`status: "review"`).
3. Reconcile manifest ↔ files: add the 15 missing sources (or `LIBRARY_EXTRACTED_DIR`) and make `build-library.mjs` fail with a **clear list of missing sources** instead of a stack trace; add `npm run validate-library`, `audit-json` the docs promise (or fix docs).
4. Move large binaries to **Git LFS / release assets / external storage**; keep only manifest + checksums in git (`docs/SOURCE_CHECKSUMS` already exists).
5. CI: split into `code` job (typecheck, unit tests, `LIBRARY_BUNDLE=none` build — always green) and `library` job (full validation, nightly/manual). `library.test.ts` must **fail**, not skip, when sources are absent in the library job.
6. Correct handoff docs to the real repo layout and real test counts.
**Exit:** fresh clone → `npm ci && npm test && npm run build` green; docs match reality.

### Phase 1 — Safety & trust (1 week)
1. DOMPurify + CSP; test XSS payloads from extracted HTML tables (C3).
2. Secure key storage per platform + "remove keys" (C2); verify model IDs (C1).
3. Provenance badges on every record: *source-confirmed / source-derived unreviewed / AI suggestion / user correction / outdated-guideline*; "Suggested reading" wording for candidate links (B2, B3).
4. Sync hardening: per-device tokens, rate limit, TLS docs, optional E2E encryption (C4).
5. Route smoke tests (all 13 routes × empty DB / first-run / offline / legacy settings) and AppErrorBoundary tests.
**Exit:** security checklist signed; no unlabeled unverified content.

### Phase 2 — Performance & the real offline architecture (2–3 weeks)
1. **Decide A3**: (a) keep Dexie-per-book import but make it lazy (import a book only when opened/selected) **or** (b) implement the planned static-index architecture. Recommended: (b) for global search/metadata (sharded by kind/book, loaded on demand), Dexie only for user data + imported-on-demand book bodies.
2. Replace every `db.questions.toArray()` with indexed/paged queries or index lookups (search, Home, quiz pool, tagging).
3. Search in a Web Worker with persisted snapshot; incremental updates (C6).
4. Route-level `React.lazy`; dynamic AI-provider imports; target initial JS < 300 KB gz (C5).
5. Storage manager: `persist()`, `estimate()` UI, OPFS media store with LRU budget; image decode/release when leaving a record; thumbnails (WebP/AVIF) for atlas grids.
6. PWA strategy: precache shell + small indexes only; runtime-cache media with a budget (C8).
7. Measure on a low-end Android (2–3 GB RAM): cold start, peak memory, first search, 375-q mock load. Set budgets in CI (Lighthouse CI + custom size check).
**Exit:** cold start < 3 s and no OOM on target device with the full 60-book library.

### Phase 3 — UI/UX redesign (2 weeks)
1. 5-tab mobile nav; collapsible desktop sidebar; Home = "Continue", "Due today", "Weak areas", "Exam countdown".
2. Design tokens (spacing, type scale, 2 accent colours), calmer palette, remove decorative emoji; light/dark/high-contrast themes, font-size and density settings.
3. WCAG 2.2 AA pass: contrast, 24/44 px targets, focus rings, `aria-live` for timers/results, keyboard alternatives for ordering/hotspot, alt text/captions for atlas images, screen-reader test (TalkBack, NVDA).
4. Study ergonomics: resume session, swipe between questions, per-question pacing indicator, quick-flag/note/strike-out options, side-by-side image + stem on tablets/desktop, picture-in-picture lab-value/normal-values reference sheet.
5. Onboarding: exam-date + target exam (ABNS primary / oral / FRCS / neurology / radiology) → pre-built plan.
**Exit:** usability test with ≥ 5 residents; Lighthouse a11y ≥ 95.

### Phase 4 — Learning-science features (3 weeks)
1. FSRS-6 + retention slider + optimizer from local history; leech/suspend/bury; daily caps (C7).
2. Blueprint-aligned mock exams and **readiness dashboard** (per-category predicted score, calibration of confidence vs correctness, time-management heatmap).
3. Adaptive pools: weakness-first, interleaving, "similar to missed" via tags/embeddings (local, small model optional).
4. Study planner: exam date → daily new/review targets → calendar export (.ics).
5. Error log with reason codes (knowledge gap / misread / second-guess / time) and a weekly review.
6. Streaks and goals that reward consistency (opt-in, non-gamified by default).
**Exit:** longitudinal stats exportable; scheduler regression tests vs reference ts-fsrs vectors.

### Phase 5 — Content quality & expansion (continuous)
1. Finish remediation queue: remaining unscorable units, NBR3 repairs, Greenberg 13 units, Book 07 ×3, Book 09 Q1000 — only from source evidence.
2. Reviewer workflow UI: correction + evidence + status (candidate/reviewed/rejected) + export; require two-person sign-off for answer-key changes.
3. Reference linking: reviewed links first, candidates labelled; per-link confidence and source page/bbox.
4. New content (only with licence/permission, or self-authored): current guideline summaries (ICH 2022, SAH, TBI, spine), eponym/classification cheat sheets (Hunt-Hess, Fisher, Spetzler-Martin, ASIA, AO spine…), operative-approach step lists, dosing/reversal protocols, normal values, ambiguity-free "pearls" cards, image-differential atlas drills, oral-board case scripts with rubrics.
5. Add the unregistered four books after licence/quality review.
6. Content versioning: per-book changelog and "what changed" screen after updates; stable IDs preserved.

### Phase 6 — AI features (2–3 weeks, optional/online only)
1. Grounded tutor: answers must cite the local record/reference section; refuse beyond source; label unverified.
2. Oral-board examiner: rubric-based scoring, follow-up probing, optional speech-to-text/TTS.
3. Auto-generated mnemonics / "teach-back" prompts cached locally; cost meter and per-day budget; provider fallbacks.
4. Optional **on-device** model path (WebGPU/WebLLM-class small models) for offline hints — evaluate quality before shipping.
5. Never let AI alter answer keys; AI answer-check only creates review flags.

### Phase 7 — Release engineering (1–2 weeks)
1. Signed Android release (AAB), Windows installer signing, auto-update channel; versioned data migrations with Dexie tests.
2. Backup/restore (progress export/import, scheduled local backup), crash reporting that is opt-in and local-first.
3. Telemetry-free analytics (local only); privacy policy; "not medical advice / educational use" disclaimer; licence screen listing each book's rights status.
4. Test matrix: Chrome/Edge/Safari (iOS PWA), Android 9–15, Windows 10/11; Playwright E2E for core flows (import → quiz → results → flashcards → search → offline).
5. Docs: contributor guide, architecture diagram, runbook for rebuilding library.

---

## 5. Suggested priority order
1. B1 (legal) → A1/A2/A5 (reproducible build) → C3/C2 (security) → A3/C6/C5 (performance) → UI redesign → FSRS-6/readiness → content/AI expansion.

## 6. Sources
- FSRS-6: [Sthabiso10/recall-srs PR #5](https://github.com/Sthabiso10/recall-srs/pull/5), [ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS), [Expertium benchmark](https://expertium.github.io/Benchmark.html)
- Storage: [Edge PWA storage docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/offline), [Kiwix case study (web.dev)](https://web.dev/case-studies/kiwix), [web storage overview](https://patrickbrosset.com/articles/2023-01-17-web-storage/)
- Qbank competitors: [iatrox comparison 2026](https://www.iatrox.com/blog/medical-exam-question-bank-comparison-2026-every-platform-ranked), [AMBOSS board review](https://www.amboss.com/us/board-review), [UWorld ABIM](https://medical.uworld.com/abim/)
- Secure storage: [aparajita/capacitor-secure-storage](https://github.com/aparajita/capacitor-secure-storage), [Capawesome secure preferences](https://capawesome.io/docs/sdks/capacitor/secure-preferences/)
- ABNS exam: [ABNS timeline](https://www.abns.org/content/abns-board-certification-timeline), [practice-exam blueprint summary](https://open-exam-prep.com/practice/abns-neurological-surgery)
- Accessibility: [WCAG 2.5.8 guide](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide), [contrast requirements](https://www.makethingsaccessible.com/guides/contrast-requirements-for-wcag-2-2-level-aa/)
- Copyright/DMCA: [GitHub DMCA policy](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy)
- Search: [FlexSearch vs MiniSearch](https://devpick.co/flexsearch-vs-minisearch), [Fuse/FlexSearch/Orama 2026](https://www.pkgpulse.com/guides/fusejs-vs-flexsearch-vs-orama-client-side-search-2026)

Note: the ABNS blueprint figures come from a third-party summary; verify against abns.org before using them for weighting. This audit is not legal advice.
