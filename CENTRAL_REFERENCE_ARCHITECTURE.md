# NeuroQuiz central reference architecture

## Purpose

Citow and Greenberg Handbook 11e (GH11) are independent reference corpora. They are not question banks and are not merged into the quiz books. Their role is to provide on-demand supplementary reading for question and case records across the library.

```text
Question books / case books / visual atlases
                 |
        semantic reference links
          /                    \
Citow Comprehensive              Greenberg Handbook
Neurosurgery Board Review         of Neurosurgery, 11e
```

## Link layers

1. **Reference-hub-topic** — deterministic semantic match from canonical source tags to reference heading/text; confidence is 0.72 for a full token match and 0.86 when the topic phrase appears in the target heading/text.
2. **Shared-specific-tag** — existing generic fallback links retained for navigation compatibility.
3. **Explicit/source-reference** — reserved for future book-specific bridges such as source page/reference IDs.
4. **Verified/manual** — must never be inferred from a topic match; requires source-page or editorial confirmation.

All generated links have `verified: false` until reviewed. A reference link is a reading suggestion, not an answer-level clinical citation.

## Current generated state

- Citow reference records: **15,065**
- GH11 reference records: **56,422**
- Indexed source books audited: **47**
- Total generated links: **283,632**
- Explicit Citow hub links: **84,038**
- Explicit GH11 hub links: **104,692**

The detailed per-book report is `library/REFERENCE_HUB_COVERAGE.md` and the machine-readable report is `library/reference-hub-coverage.json`.

## Examples of coverage

- Greenberg Rapid Review: **64.8%** of indexed records linked to Citow and **98.1%** linked to GH11.
- Book 05: **42.4%** linked to each hub.
- NBR3: **17.6%** linked to each hub.
- Integrated Neurosurgery Question Bank: **18.2%** linked to each hub.

These are first-pass semantic coverage measurements. Lower coverage means the source has sparse or missing canonical topic tags; it does not mean the book is unsupported. The next enrichment phase should improve canonical tags and add explicit source-reference mappings, not lower the matching threshold indiscriminately.

## Bridge policy

A book-specific bridge is used only when a source provides stable provenance-preserving identifiers. The existing TSNBE-to-GH11 bridge remains specialized to TSNBE and must not be applied to unrelated books. Future bridges should include source question ID, target reference unit ID, confidence, evidence, and review status.
