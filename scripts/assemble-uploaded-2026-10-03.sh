#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/library/sources/uploaded-2026-10-03"
for base in \
  COLEN_FLASH_FINAL_STRICT_CROPS_2026-10-01.zip \
  Egyptian_Fellowship_review_questions.zip \
  The_NeuroICU_Board_Review_v25_content_complete_working.zip \
  arab_board.zip \
  neurosurgery_board_review_book_bundle.zip; do
  cat "$dir/$base."* > "$root/library/sources/$base"
done
printf 'Assembled five uploaded source archives under %s/library/sources\n' "$root"
