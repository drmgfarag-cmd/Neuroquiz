# NeuroQuiz source upload inventory

**Generated:** 2026-09-29
**Repository branch:** `offline-content-architecture`

## Important correction

The validator found **20 undeclared source files**, not 20 separate books. They belong to **four source groups**:

- **19 split-archive parts** belonging to three candidate books/groups.
- **1 duplicate companion JSON** for the already-imported `vasc2017` book.

No part is proven damaged from its byte signature alone. The split parts use the expected 17,825,792-byte volume size except for final volumes, and the first parts have ZIP signatures. The groups are not currently manifest entries because they have not yet undergone extraction/schema review.

## Exact files currently present but undeclared

### 1. Neuroradiology Boards Favorites Case Extraction

Present in `library/sources/`:

```text
Neuroradiology_Boards_Favorites_Case_Extraction.zip.001
Neuroradiology_Boards_Favorites_Case_Extraction.zip.002
Neuroradiology_Boards_Favorites_Case_Extraction.zip.003
Neuroradiology_Boards_Favorites_Case_Extraction.zip.006
Neuroradiology_Boards_Favorites_Case_Extraction.zip.007
Neuroradiology_Boards_Favorites_Case_Extraction.zip.008
Neuroradiology_Boards_Favorites_Case_Extraction.zip.009
```

Present at the repository root but misplaced outside `library/sources/`:

```text
Neuroradiology_Boards_Favorites_Case_Extraction.zip.004
Neuroradiology_Boards_Favorites_Case_Extraction.zip.005
```

**Parts present after combining locations:** `.001` through `.009`.

**Upload request:** no missing numbered part is currently identifiable. If the original archive has a `.010` or later volume, upload it; otherwise the current sequence appears complete. The `.004` and `.005` files need to be placed beside the other parts under `library/sources/` before archive testing.

### 2. Neurosurgery integrated examinations 2003–2020 scored

Present in `library/sources/`:

```text
Neurosurgery_exams_integrated_2003_01_20_scored.zip.001
Neurosurgery_exams_integrated_2003_01_20_scored.zip.002
Neurosurgery_exams_integrated_2003_01_20_scored.zip.003
Neurosurgery_exams_integrated_2003_01_20_scored.zip.004
Neurosurgery_exams_integrated_2003_01_20_scored.zip.005
Neurosurgery_exams_integrated_2003_01_20_scored.zip.006
Neurosurgery_exams_integrated_2003_01_20_scored.zip.007
Neurosurgery_exams_integrated_2003_01_20_scored.zip.008
Neurosurgery_exams_integrated_2003_01_20_scored.zip.009
Neurosurgery_exams_integrated_2003_01_20_scored.zip.010
Neurosurgery_exams_integrated_2003_01_20_scored.zip.013
```

Present at the repository root but misplaced:

```text
Neurosurgery_exams_integrated_2003_01_20_scored.zip.011
Neurosurgery_exams_integrated_2003_01_20_scored.zip.012
```

**Parts present after combining locations:** `.001` through `.013`.

**Upload request:** no missing numbered part is currently identifiable. If the original archive has `.014` or later, upload it; otherwise the current sequence appears complete. Move `.011` and `.012` into `library/sources/` before archive testing.

### 3. OCTS TIA and Stroke

Present in `library/sources/`:

```text
OCTS_TIA_and_Stroke.zip.001
```

Present at the repository root but misplaced:

```text
OCTS_TIA_and_Stroke.zip.002
```

**Parts present after combining locations:** `.001` and `.002`.

**Upload request:** no missing numbered part is currently identifiable. If the original archive has `.003` or later, upload it; otherwise `.002` appears to be the final volume. Move `.002` into `library/sources/` before archive testing.

### 4. VASC2017 companion extraction JSON

```text
library/sources/VASC2017_extraction.json
```

This is a duplicate/companion extraction JSON for the already-declared `vasc2017` bundle. It is **not a missing book** and does not need to be uploaded again. The validator has been corrected so a declared `primaryJson` companion is not incorrectly reported as an orphan.

## What to upload next

If the files above are already available locally, do not upload duplicates. First place the misplaced parts in the correct directory:

```bash
mv Neuroradiology_Boards_Favorites_Case_Extraction.zip.004 library/sources/
mv Neuroradiology_Boards_Favorites_Case_Extraction.zip.005 library/sources/
mv Neurosurgery_exams_integrated_2003_01_20_scored.zip.011 library/sources/
mv Neurosurgery_exams_integrated_2003_01_20_scored.zip.012 library/sources/
mv OCTS_TIA_and_Stroke.zip.002 library/sources/
```

Then test each sequence by concatenating its volumes into a temporary file and running `unzip -t`. Do not add a book to `library/books.json` until its JSON schema, image references, scoring quality, and title are reviewed.

**The only genuinely missing information is whether additional final volumes exist beyond `.009`, `.013`, or `.002`.** If they do, upload:

```text
Neuroradiology_Boards_Favorites_Case_Extraction.zip.010+
Neurosurgery_exams_integrated_2003_01_20_scored.zip.014+
OCTS_TIA_and_Stroke.zip.003+
```

If no such files exist, upload nothing for these groups; the current parts appear complete but remain uncataloged candidates.

## Current known content errors that cannot be safely guessed

These require source repair or human medical review, not automatic invention:

- `nbr3`: 1,326 extracted records lack usable answer/options structures; do not mark it scored-ready.
- Book `07`: 6 questions have no reliable correct answer in the supplied extraction.
- Book `09`: 1 question has no reliable correct answer because the source ends after question 1000.
- `pnsbr2023`: 22 records are not scorable from the supplied extraction.
- Smaller isolated unscorable records remain in `nbr2013`, `nper`, `ntmcq2022`, `raj2009`, and `vasc2017`.
- Raw source text audit: 36,452 formatting findings across valid JSON; safe normalization is applied at import/index time, while originals are preserved.

Never invent answer keys or clinical corrections from filenames, AI guesses, or broad image tags. Use the source page/PDF and record every manual correction as a provenance-preserving override.
