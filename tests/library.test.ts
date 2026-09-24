/**
 * Checks every book in library/books.json: it must import, and every image it
 * references must be present. Prints a report per book.
 *   npm run check-books
 */
import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectFiles, executeImport, planImport } from "../src/import/importer";
import { db } from "../src/lib/db";
import { formatOf } from "../src/lib/grading";

const LIB = new URL("../library/", import.meta.url);
const list: { id: string; title: string; source: string | string[]; questionImages?: string }[] = existsSync(new URL("books.json", LIB))
  ? JSON.parse(readFileSync(new URL("books.json", LIB), "utf8")).books
  : [];

/** Same rule as scripts/build-library.mjs: "x.zip.001" = parts .001, .002 … joined. */
function readSource(src: string): Buffer {
  if (!src.endsWith(".001")) return readFileSync(new URL(src, LIB));
  const parts: Buffer[] = [];
  for (let n = 1; existsSync(new URL(src.replace(/\.001$/, "." + String(n).padStart(3, "0")), LIB)); n++)
    parts.push(readFileSync(new URL(src.replace(/\.001$/, "." + String(n).padStart(3, "0")), LIB)));
  return Buffer.concat(parts);
}

describe.skipIf(!list.length)("built-in library", () => {
  for (const book of list) {
    it(`${book.id}: ${book.title}`, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
      const sources = Array.isArray(book.source) ? book.source : [book.source];
      const files = await collectFiles(sources.map((s) => new File([readSource(s)], s.split("/").pop()!.replace(/\.001$/, ""))));
      // Mirror build-library.mjs: this policy is written into the JSON shipped to users.
      if (book.questionImages === "referenced-only") {
        for (const f of files.filter((file) => /\.json$/i.test(file.path))) {
          const json = JSON.parse(await f.blob.text());
          if (json && typeof json === "object" && !Array.isArray(json)) f.blob = new Blob([JSON.stringify({ ...json, question_images_policy: "referenced_only" })]);
        }
      }
      const plan = await planImport(files, "single", 1);
      expect(plan.errors).toEqual([]);
      plan.books[0].id = book.id;
      const res = await executeImport(plan);
      const qs = await db.questions.toArray();
      const types: Record<string, number> = {};
      qs.forEach((q) => (types[formatOf(q)] = (types[formatOf(q)] ?? 0) + 1));
      const noExplanation = qs.filter((q) => !q.explanation.trim()).length;
      const withImages = qs.filter((q) => q.stemMedia.length || q.explanationMedia.length).length;
      const media = await db.media.toArray();
      // references may omit the extension ("…_figQ_p0001_01")
      const base = (f: string) => f.split("/").pop()!.toLowerCase().replace(/\.[a-z0-9]+$/, "");
      const used = new Set(qs.flatMap((q) => [...q.stemMedia, ...q.explanationMedia, ...q.options.flatMap((o) => o.media)].map((m) => base(m.file))));
      const unused = media.filter((m) => !used.has(base(m.name))).map((m) => m.name);
      console.log(
        [
          `\n== ${book.id} · ${book.title}`,
          `   ${res.chapters} chapters · ${res.questions} questions · ${res.flashcards} flashcards · ${res.cases} cases · ${res.images} images`,
          `   types: ${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(", ")}`,
          `   with images: ${withImages} · without explanation: ${noExplanation}`,
          `   missing images: ${res.missingImages.length}${res.missingImages.length ? " → " + res.missingImages.slice(0, 10).join(", ") : ""}`,
          `   images never referenced: ${unused.length}${unused.length ? " → " + unused.slice(0, 10).join(", ") : ""}`,
          `   warnings: ${res.warnings.length}${res.warnings.length ? "\n     - " + res.warnings.slice(0, 25).join("\n     - ") : ""}`,
          `   unscorable: ${res.unscorable.length} · unreferenced images: ${res.unreferencedImages.length} · role conflicts: ${res.conflictingImageRoles.length}`
        ].join("\n")
      );
      expect(res.questions).toBeGreaterThan(0);
      expect(res.missingImages).toEqual([]);
      expect(res.conflictingImageRoles).toEqual([]);
      if (book.id === "05") {
        const hemangioblastoma = qs.find((q) => q.stem.includes("MRI scans of the brain of a 33-year-old man"));
        expect(hemangioblastoma?.options.find((o) => o.key === "B")?.text).toBe("Hemangioblastoma");
        expect(hemangioblastoma?.answer).toEqual(["B"]);
        expect(res.unscorable).toEqual([]);
      }
    }, 120_000);
  }
});
