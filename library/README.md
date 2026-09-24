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

GitHub's web upload accepts files up to 25 MB, so split a larger book into
chapter ZIPs.

The web preview link holds at most about 60 MB of books in total. Past that,
use the Android/Windows apps for the full library.
