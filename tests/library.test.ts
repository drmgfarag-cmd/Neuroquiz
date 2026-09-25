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
import { auditBook, unscorableReason } from "../src/lib/quality";

const LIB = new URL("../library/", import.meta.url);
const list: { id: string; title: string; source: string | string[]; questionImages?: string; primaryJson?: string; referencedAssetsOnly?: boolean }[] = existsSync(new URL("books.json", LIB))
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
      let files = await collectFiles(sources.map((s) => new File([readSource(s)], s.split("/").pop()!.replace(/\.001$/, ""))));
      if (book.primaryJson) {
        const main = files.find((f) => f.path.split("/").pop() === book.primaryJson);
        expect(main).toBeDefined();
        const json = JSON.parse(await main!.blob.text());
        const linked = new Set<string>();
        if (book.referencedAssetsOnly) {
          type Ref = string | { file?: string; path?: string; filename?: string };
          type Item = { images?: Ref[]; question_images?: Ref[]; answer_images?: Ref[] };
          const records: Item[] = Array.isArray(json) ? json : Object.values(json.chapters ?? {}).flatMap((chapter: any) => [
            ...(chapter.questions ?? []), ...(chapter.qa_pairs ?? []), ...(chapter.cases ?? []),
          ]);
          for (const q of records)
            for (const value of [...(q.images ?? []), ...(q.question_images ?? []), ...(q.answer_images ?? [])]) {
              const name = typeof value === "string" ? value : value.file ?? value.path ?? value.filename;
              if (name) linked.add(name.split("/").pop()!.toLowerCase().replace(/\.[^.]+$/, ""));
            }
        }
        files = files.filter((f) => f === main || (!/\.json$/i.test(f.path) && (!book.referencedAssetsOnly || linked.has(f.path.split("/").pop()!.toLowerCase().replace(/\.[^.]+$/, "")))));
      }
      if (book.referencedAssetsOnly && !book.primaryJson) {
        const linked = new Set<string>();
        for (const f of files.filter((file) => /\.json$/i.test(file.path))) {
          const json = JSON.parse(await f.blob.text());
          for (const chapter of Object.values(json.chapters ?? {}) as { questions: { images?: string[]; question_images?: string[]; answer_images?: string[] }[] }[])
            for (const q of chapter.questions)
              for (const name of [...(q.images ?? []), ...(q.question_images ?? []), ...(q.answer_images ?? [])])
                linked.add(name.split("/").pop()!.toLowerCase().replace(/\.[^.]+$/, ""));
        }
        files = files.filter((f) => /\.json$/i.test(f.path) || linked.has(f.path.split("/").pop()!.toLowerCase().replace(/\.[^.]+$/, "")));
      }
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
      const cases = await db.cases.toArray();
      const types: Record<string, number> = {};
      qs.forEach((q) => (types[formatOf(q)] = (types[formatOf(q)] ?? 0) + 1));
      const noExplanation = qs.filter((q) => !q.explanation.trim()).length;
      const withImages = qs.filter((q) => q.stemMedia.length || q.explanationMedia.length).length;
      const media = await db.media.toArray();
      // references may omit the extension ("…_figQ_p0001_01")
      const base = (f: string) => f.split("/").pop()!.toLowerCase().replace(/\.[a-z0-9]+$/, "");
      const used = new Set([
        ...qs.flatMap((q) => [...q.stemMedia, ...q.explanationMedia, ...q.options.flatMap((o) => o.media)]),
        ...cases.flatMap((c) => [...c.presentationMedia, ...c.stages.flatMap((s) => [...s.media, ...(s.answerMedia ?? [])])])
      ].map((m) => base(m.file)));
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
      expect(res.questions + cases.filter((c) => c.kind === "qa").reduce((n, c) => n + c.stages.length, 0)).toBeGreaterThan(0);
      expect(res.missingImages).toEqual([]);
      expect(res.conflictingImageRoles).toEqual([]);
      if (book.id === "05") {
        expect(unused).toEqual([]);
        expect(res.unreferencedImages).toEqual([]);
        const hemangioblastoma = qs.find((q) => q.stem.includes("MRI scans of the brain of a 33-year-old man"));
        expect(hemangioblastoma?.options.find((o) => o.key === "B")?.text).toBe("Hemangioblastoma");
        expect(hemangioblastoma?.answer).toEqual(["B"]);
        expect(res.unscorable).toEqual([]);
        expect(auditBook(qs, media.map((m) => m.name)).sourceWarnings.length).toBeGreaterThanOrEqual(2);
      }
      if (book.id === "neurosurgery-rounds-2e") {
        expect(res.questions).toBe(0);
        expect(res.shortAnswers).toBe(1736);
        expect(res.clinicalCases).toBe(30);
        expect(cases.filter((c) => c.kind === "qa").reduce((n, c) => n + c.stages.length, 0)).toBe(1736);
        expect(cases.filter((c) => c.kind !== "qa")).toHaveLength(30);
        expect(res.unreferencedImages).toEqual([]);
        expect(unused).toEqual([]);
        const neuro = cases.find((c) => c.kind === "qa" && c.title.includes("Vasculature"))!;
        expect(neuro.stages[1].question).toContain("major branches of the ECA");
        expect(neuro.stages[1].answerMedia?.[0]?.file).toBe("fig_1_1.png");
        expect(neuro.stages[1].media).toEqual([]);
      }
      if (book.id === "nbr3" || book.id === "nper") {
        expect(unused).toEqual([]);
        expect(res.unreferencedImages).toEqual([]);
        expect(res.shortAnswers).toBe(0);
        if (book.id === "nbr3") {
          expect(qs).toHaveLength(1326);
          expect(qs.filter((q) => q.sourceId?.startsWith("NBR3_from2_"))).toHaveLength(12);
          expect(qs.every((q) => unscorableReason(q) === "Source transcription pending review")).toBe(true);
          const labeled = qs.find((q) => q.sourceId === "NBR3_s01_q001")!;
          expect(labeled.stemMedia[0]?.file).toContain("figQ");
          expect(labeled.explanationMedia[0]?.file).toContain("figA");
          expect(labeled.explanation).toContain("Printed figure label: D");
        }
        if (book.id === "nper") {
          expect(qs).toHaveLength(600);
          expect(qs.filter((q) => q.sourceReviewRequired)).toHaveLength(1);
          const first = qs.find((q) => q.sourceId === "NPER_t01_q001")!;
          expect(first.stemMedia).toEqual([]);
          expect(first.explanationMedia[0]?.file).toContain("figRef");
        }
      }
      if (book.id === "npbr") {
        expect(qs).toHaveLength(1577);
        expect(media).toHaveLength(474);
        expect(unused).toEqual([]);
      }
      if (book.id === "pnsbr2023") {
        expect(qs).toHaveLength(86);
        expect(cases.filter((c) => c.kind === "qa").reduce((n, c) => n + c.stages.length, 0)).toBe(5);
        expect(media).toHaveLength(25);
        expect(unused).toEqual([]);
      }
    }, 120_000);
  }
});
