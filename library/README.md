# Built-in library

Books listed in `books.json` ship inside the app (web preview, Android and
Windows). On first launch they are imported automatically; later versions
show up under **Library → Included books** as "Updated version available".
Updating keeps progress, notes, flags and tags, because question ids come
from the question text rather than the file.

## Adding a book

1. Upload the extraction to `library/sources/` (GitHub → *Add file → Upload
   files*). One book can be:
   - one JSON file, or
   - a ZIP containing the JSON and an `images/` folder, or
   - several chapter files (list them all in `source`, see below).
2. Add an entry to `books.json`:

   ```json
   { "id": "04", "title": "Title shown in the app", "source": "sources/04.zip" }
   ```

   ```json
   { "id": "05", "title": "Book split into chapters",
     "source": ["sources/05_ch01.zip", "sources/05_ch02.zip"] }
   ```

   `id` must stay the same forever (lower-case letters, digits, dashes).
   The title can be changed at any time, in this file or in the app.
3. Check it: `npm run check-books` prints, per book, the chapters, question
   types, images, missing images and warnings.

GitHub's web upload accepts files up to 25 MB. For a bigger ZIP either split
the book into chapter ZIPs, or split the ZIP itself into numbered parts with
7-Zip ("Split to volumes": `book.zip.001`, `book.zip.002` …) and list only the
first part: `"source": "sources/book.zip.001"`. The parts are joined
automatically.

A book's images can also come as a separate ZIP next to the JSON:
`"source": ["sources/05.json", "sources/05_images.zip.001"]`.

## Waiting for files

- `sources/05_images.zip.001/.002`: images for book 05 (10 chapters plus a
  5-section practice exam, 353 images). Its question JSON hasn't been
  uploaded yet, so it isn't listed in `books.json`.

The web preview link holds at most about 60 MB of books in total. Past that,
use the Android/Windows apps for the full library.
