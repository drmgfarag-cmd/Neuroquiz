# Citow reference integration

## Source identity

- **Archive:** `library/sources/Citow_reference_core_v19_neuroquiz.zip`
- **Display name:** **Comprehensive Neurosurgery Board Review (Citow et al., 2020)**
- **Stable app ID:** `citow-comprehensive-neurosurgery-board-review-2020`
- **Source PDF SHA-256 recorded by the archive:** `2652ceffc25ad54d916acf6008ce9a6ad97834c18e57ea910de46dca50d`
- **Archive integrity:** `unzip -t` passed.

## Imported structure

The source archive remains unchanged in substance and contains the extraction’s JSONL, SQLite, audit, navigation, provenance, and image assets. NeuroQuiz adds `Citow_reference_items.json` to the packaged copy as an app-facing compact wrapper.

The wrapper contains:

- 10,604 logical reference items
- 949 supplemental items
- 1,824 back-matter items
- 966 subject-index entries
- 665 figure-reference records
- 59 table-reference records
- 15,065 total de-duplicated reference records

The runtime package includes **724 explicit captioned figure/table crops** plus the canonical JSON file. Original media is loaded on demand; it is not bulk-imported into IndexedDB.

## Trust model

The extraction is high quality but is not a page-by-page clinical verification. Search results and citation candidates retain source IDs, page numbers, hierarchy, coordinates where available, and review status. Candidate passages must remain marked as unverified until a user reviews the source evidence.

The reference corpus is not quiz-eligible and does not provide answer keys automatically.

## Build commands

```bash
npm run build-library
npm run validate-library
npm test -- --run
npm run audit-json
npm run build
```

## Known limitations

- The original PDF is not bundled; the archive records its hash and extraction provenance.
- Some figure/native/layout associations remain provisional according to the source QA report.
- The next feature should be a citation-review UI with approve/reject/revert actions, not automatic answer citation publication.
