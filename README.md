# NeuroQuiz – neurosurgery question bank

An offline-first quiz app for question banks extracted from neurosurgery books. It imports JSON files with their images, tags each question by topic with Claude, and gives you several test modes, flashcards with spaced repetition, and case discussions. The same app runs on **Windows** and **Android**, and your progress syncs between them.

## Features

| Area | What you get |
|---|---|
| **Import** | JSON files, folders or ZIPs. A book can be one file or one file per chapter. Images, figures and tables are linked by file name from questions, options, explanations, flashcards and cases. Field names are flexible (see below). Re-importing a book replaces its content and keeps your progress. |
| **AI tagging** | Claude reads each question with its answer and explanation. It assigns a topic and subtopic from a built-in neurosurgery taxonomy (16 topics, ~80 subtopics), plus concept tags, search keywords and synonyms, a difficulty, a high-yield flag and a one-line teaching point. An offline keyword tagger runs on every import as a first pass. You can correct tags by hand. |
| **Search** | Full-text search with fuzzy and prefix matching, weighted by tags and topics. **Smart search** lets Claude turn a plain-language request into topics and synonyms. You can browse by topic and turn any result set into a test. |
| **Test modes** | **Tutor** shows the answer and explanation after each question. **Timed exam** runs a countdown and grades at the end. **Untimed exam** also grades at the end, without a clock. **Read/review** lets you browse questions with answers shown. |
| **Revision** | Filter by status: unused, incorrect, correct, flagged, or due for revision, or only questions with images (radiology/figure practice). Missed questions come back on a spaced-repetition schedule. You can also filter by book, chapter, topic, subtopic, difficulty or high-yield. Other tools: retry incorrect, flag, cross out options, notes, keyboard shortcuts. |
| **Flashcards** | Cards come from imported flashcards, from questions (one tap), from Claude (short one-fact cards) or from you. Study with SM-2 spaced repetition or cram mode. |
| **Cases** | Imported case scenarios reveal step by step: presentation, then stages, each with a question and model answer, then a discussion. Claude can write oral-board style cases from your own questions, and an **AI examiner** chat discusses each case with you. |
| **Image viewer** | Tap any figure, radiology image or cropped table to open it. You can zoom with the mouse wheel, pinch, double-tap or the +/− buttons, up to 1200% or actual pixels (1:1). Drag to pan. Swipe, use the arrow keys or pick a thumbnail to move between all the images of a question, including its options and explanation. There are brightness and contrast controls: a **W/L** (window/level) drag like a PACS viewer, or right-drag at any time. You can also invert, rotate, flip and go full screen. **Dock** keeps the viewer beside the question on wide screens and follows you to the next question, so you can study a scan while choosing an answer. Keys: `+` `-` `0` `←` `→` `I` `R` `Esc`. |
| **Fix questions** | Use **Edit question** to correct a question's text, options, answer key or explanation, for example an OCR error. Corrections survive book updates, sync between devices and can be reverted. **Report a problem** keeps a list of questions to fix later (Library → Reported problems), with a copyable list. |
| **AI answer check** | Claude audits a book or chapter and flags answer keys that look wrong, contradict their explanation or are garbled. You can apply its suggested answer, edit the question, or dismiss the flag. |
| **Mock exam** | A timed, board-style exam mixing several books by weight (e.g. 60/20/20). It prefers questions you haven't answered and keeps linked questions together. |
| **Image atlas** | Every figure, scan and table image of a book in one grid, filterable by chapter and by question vs. answer image. Each links to its question, and you can make a test from the image questions. |
| **AI tutor** | Ask Claude about any question: why each option is right or wrong, mnemonics, related facts. |
| **Stats** | Accuracy by book, topic and weakest subtopic, plus 14-day activity. Tap a weak area to build a test from it. |
| **Offline** | Everything except the AI features and sync works with no connection: import, tests, flashcards, cases, search, the viewer and stats. The web app installs itself for offline use on first visit. The Android and Windows apps load from local files. AI buttons are disabled while offline, and AI tagging stops cleanly if the connection drops, then continues from where it stopped when you run it again. Sync catches up automatically when you reconnect. |
| **Sync** | Progress, flags, notes, tags, history and generated cards and cases sync through a small self-hosted server or a backup file. |

## Quick start (development)

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + integration tests
npm run build        # production build in dist/
```

Open **Import → Load sample book** to try it with the bundled sample (`samples/sample-book/`, three JSON files in three different formats plus images).

To use the AI features, add your Anthropic API key in **Settings**. The key stays on that device and is never synced. The default model is `claude-opus-5`. For bulk tagging of large books you can switch to a cheaper model in Settings. Tagging runs in batches of 12 with the taxonomy prompt cached, and you can stop and resume it.

## Running on Windows and Android

The app is one web build (`dist/`) packaged three ways:

1. **Installable web app (fastest).** Host `dist/` anywhere (or run `npm run preview` on your PC). Open it in Edge or Chrome and choose **Install app**. On Android, open it in Chrome and choose **Add to Home screen**. It then works offline.
2. **Android APK (Capacitor)**
   ```bash
   npm run android:add      # once – creates android/
   npm run android:sync     # build web + copy into android/
   npm run android:open     # opens Android Studio → Run / Build APK
   ```
3. **Windows installer (Electron)**
   ```bash
   npm run build
   cd desktop && npm install
   npm start                # run the desktop app
   npm run dist:win         # NSIS installer + portable .exe in desktop/dist/ (build on Windows)
   ```

The **NeuroQuiz apps** GitHub Actions workflow (`.github/workflows/apps.yml`, run it manually from the Actions tab or push a `v*` tag) builds the Android APK and the Windows installer for you and attaches them as artifacts.

On Android, choose a **ZIP** (or multi-select JSON and image files) when importing. Folder picking only works on desktop.

## Using both devices at the same time (sync)

Books and images are imported on each device; a ZIP per book makes this easy. Everything you *do* syncs.

**Option A – sync server (automatic).** Run it on any always-on machine: your Windows PC, a Raspberry Pi or a small VPS.

```bash
SYNC_TOKEN=pick-a-secret PORT=8787 npm run sync-server
```

On each device, open **Settings → Sync** and enter `http://<pc-ip>:8787` and the token. Each device syncs when the app starts, every 5 minutes and when you reopen the app. You can also press **Sync now**. For access away from home, put the server behind HTTPS (e.g. a reverse proxy or Tailscale). The server stores only progress data (JSON in `sync-server/data/`).

**Moving books without internet.** **Library → Export ZIP** packs a book with its images and AI tags into one file. Import that ZIP on the other device (on Android it opens the share sheet, so you can send it to Drive, Files, etc.). Question IDs come out identical, so progress and tags line up between devices.

**Option B – backup file (manual).** In Settings, use **Export progress file** on one device. Move the file with Drive, OneDrive or USB, then use **Merge progress file** on the other. Merging works in both directions: for each item, the newest change wins, and deletions carry over.

## JSON format

The importer recognises many shapes and field names. The key parts are:

```jsonc
{
  "book": "Book title",                       // or "title" next to "chapters"
  "chapters": [{
    "title": "Chapter 3 – Vascular",
    "questions": [{
      "id": 12,                                // number / qno / question_number
      "question": "Stem… see [Figure: fig_12.png]",   // stem / text / prompt
      "images": ["fig_12.png"],               // figures / media / image
      "options": {"A": "…", "B": "…"},        // or ["A. …", "B. …"], or [{"text": "…", "correct": true}], or option_a/option_b…
      "answer": "B",                           // "B", "B. text", "A, C", ["A","C"], 2 (1-based by default), answer text, true/false
      "explanation": "… ![](table_3.png) …",   // rationale / discussion; markdown & HTML tables allowed
      "explanation_images": [{"file": "fig_12b.jpg", "caption": "Angiogram"}],
      "tables": [["Grade", "Feature"], ["1", "…"]],
      "tags": ["aneurysm"]
    }],
    "flashcards": [{"front": "…", "back": "…"}],          // or term/definition
    "cases": [{
      "title": "…", "presentation": "…", "images": ["ct.png"],
      "stages": [{"title": "Imaging", "content": "…", "question": "…", "answer": "…", "images": ["mri.png"]}],
      "discussion": "…"
    }]
  }]
}
```

- A plain array of questions works, as does `{ "questions": [...] }`. A flat array with a `chapter` field on each question is grouped into chapters.
- When a book is split across files, name the book in the files (`"book": …`) or keep the files in one folder. Import mode **"All selected files are chapters of ONE book"** forces this.
- Images are matched by file name, ignoring folders and letter case, from `images`/`figures` fields, markdown `![](x.png)`, `<img src>`, `[Figure: x.png]`, `{{x.png}}` or a bare `x.png` in the text. After import you get a list of any referenced images that were not found.
- **Question types.** Besides single-best-answer and select-all questions, the importer recognises:
  - **true/false statement sets**: `option_verdicts: {"A": "TRUE", "B": "FALSE"}`, or an `answer_key_map` of TRUE/FALSE values. You mark each statement.
  - **EMI sets stored as separate questions** that repeat one option list and share an `emi_set_id` are merged into one EMI question: the option list once, one item per scenario, with the lead-in taken from `case_groups`.
  - **extended matching (EMI)**: `answer_key_map: {"A": "IV", "B": "I"}`. The answer list comes from `choice_list`, or is read from the question text ("i. GBM ii. Meningioma …"). You pick from a drop-down for each item. Items with no text (structures a–e on a diagram) are supported.
  - **multi-part questions**: `parts: [{part, text, answers, correct_answer | answer_key_map}]`. These become questions 3a, 3b, 3c…, sharing the case and images.

  Both itemised types (true/false and matching) show a score such as "4 / 5 correct" and count as correct only when every item is right.
- Case text in `case_scenario` is placed before the question. Images in `question_images` are shown with the question and `answer_images` only with the answer, even when a generic `images` list mixes both. Hard line breaks and page breaks from PDF/OCR extraction are joined back into paragraphs.
- For numeric answers, you choose in the import screen whether `1` means the first option (default) or `0` does. `answer_index` is always 0-based.

## Project layout

```
src/import/normalize.ts   JSON shape detection & field aliases
src/import/importer.ts    files/zip → books, chapters, questions, media (IndexedDB)
src/ai/claude.ts          Claude calls: tagging, smart search, flashcards, cases, tutor chat
src/ai/taxonomy.ts        neurosurgery taxonomy + offline keyword tagger
src/lib/quiz.ts           pools, sessions, grading, revision scheduling
src/lib/sync.ts           last-writer-wins sync + backup files
sync-server/server.mjs    zero-dependency sync server
desktop/                  Electron shell for Windows
capacitor.config.ts       Android shell
```
