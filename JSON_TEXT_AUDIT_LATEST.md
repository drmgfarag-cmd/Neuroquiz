# JSON/text audit — latest run

**Run:** 2026-09-30
**Command:** `npm run audit-json` (now also available as `npm run audit-json-text`)

The audit scanned **253 JSON files** and **1,450,663 strings** and reported **38,630 raw-source findings**:

| Finding | Count | Interpretation |
|---|---:|---|
| Repeated spacing | 18,700 | Source formatting cleanup candidates |
| Mixed dash spacing | 13,480 | Source typography normalization candidates |
| Space before punctuation | 952 | Source formatting cleanup candidates |
| Line-break hyphen | 5,407 | Potential OCR line-wrap repair candidates |
| Mojibake | 30 | Encoding repair candidates; must be reviewed conservatively |
| Control character | 61 | Control-character cleanup candidates |

These are **raw-source findings**, not proof that the browser importer loses content. The normalizer already applies safe repairs to generated canonical records. Do not mass-edit the source archives in place: each repair must preserve the original text and be validated against page/render evidence, especially for NBR3 and the Greenberg hybrid book.

The previous attempted `npm run audit-json-text` command failed only because the alias was missing from `package.json`; the alias has now been added and points to the same audited script.
