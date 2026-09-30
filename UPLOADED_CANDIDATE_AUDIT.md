
## Final verification for this upload

- `npm run typecheck`: passed.
- Full regression: **20 test files, 141 tests passed**.
- `npm run validate-library`: **51 books; 49 ready; 0 errors; 0 warnings**.
- `npm run build-library`: ready-only build completed with **48 books, 16,235 canonical questions, 2,293 cases, 6,292 atlas entries, 15,078 references, and 13,869 media index entries**.
- `npm run audit-json`: scanned 253 JSON files / 1,450,663 strings and reported 38,630 raw-source formatting findings. These remain conservative repair candidates, not importer failures; see `JSON_TEXT_AUDIT_LATEST.md`.
- The missing `audit-json-text` script alias was added to `package.json`.

## Next fixes, in order

1. Build a Greenberg-specific adapter that preserves parent question IDs, multi-part fill-in blanks, matching, true/false, lists, label-diagrams, and study sheets without creating false unscorable records.
2. Link all 13 Greenberg media assets to their exact question or table records and remove the 9 unreferenced-media findings only when source evidence confirms the link.
3. Repair NBR3 from rendered source evidence; never invent answer options. Keep the 1,326 source-review records out of scored pools.
4. Upload the matching TSNBE reference archive, reconcile the 2,187-question bridge, and approve only evidence-supported reference links.
5. Apply raw JSON formatting repairs in small provenance-preserving batches, rerunning `npm run audit-json` and the library tests after each batch.
