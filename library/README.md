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

If a book prints teaching figures on the question page and they give the
answer away (labelled diagrams, as in book 09), add
`"questionImages": "referenced-only"`. A question then keeps its image only
when its text refers to it ("shown below", "pictured", "an MRI was
performed"…). Other images move to the answer explanation.

Images: the Android and Windows apps ship every image as the original file,
untouched. Only the web preview, which has a 64 MB limit, gets smaller WebP
copies (at most 1200 px). A book with many large scans can be squeezed further
for the web preview only, with `"webMaxPx": 720, "webQuality": 38` (as for
INBR). Standalone answer-key files (`*answer_key*.json`) are skipped when the
questions already carry their answers.

## Source titles

The numbered uploads were compared with their source PDFs and publisher
catalogs. Books 01, 05, 07, and 08 have identifiable published titles; book
NBR3 names its full title and edition in the extracted JSON. The abbreviated
INBR suffix has been removed from its display title. These title changes do
not change book or question IDs, so saved study activity stays attached.

The supplied PDFs for **02** (100 spine questions) and **09** (1,000
neurosurgery questions) start with questions and do not contain a title page,
ISBN or embedded title. Their current names are descriptive placeholders;
replace them when a cover or original bibliographic details are supplied.
Book 09's own extraction README also explicitly notes the absent title.

Publisher records used for matching: [Thieme book 05](https://shop.thieme.de/en/The-Comprehensive-Neurosurgery-Board-Preparation-Book/9781626232808),
[Springer book 07](https://link.springer.com/book/10.1007/978-3-031-69332-8),
[Thieme book 08](https://shop.thieme.com/en/Thieme-Test-Prep-for-the-USMLE-Medical-Neuroscience-Q-A/9781626235373).

The web preview link holds at most about 60 MB of books in total. Past that,
use the Android/Windows apps for the full library.
