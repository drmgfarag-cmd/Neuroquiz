import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ContentKind } from "../src/lib/content-manifest";

type SourceBook = {
  id: string;
  title: string;
  kind?: ContentKind;
  schema?: string;
  adapter?: string;
  quizEligible?: boolean;
};

const books = (JSON.parse(readFileSync(new URL("../library/books.json", import.meta.url), "utf8")) as { books: SourceBook[] }).books;

describe("library content manifest", () => {
  it("classifies every configured entry before it can be imported", () => {
    expect(books).toHaveLength(51);
    expect(books.every((book) => book.kind && book.schema && book.adapter && typeof book.quizEligible === "boolean")).toBe(true);
    expect(books.filter((book) => book.kind === "question-bank")).toHaveLength(19);
    expect(books.filter((book) => book.kind === "hybrid-question-bank")).toHaveLength(2);
    expect(books.filter((book) => book.kind === "case-book")).toHaveLength(25);
    expect(books.filter((book) => book.kind === "visual-atlas")).toHaveLength(2);
    expect(books.filter((book) => book.kind === "reference-corpus")).toHaveLength(3);
    expect(books.filter((book) => book.status === "ready")).toHaveLength(51);
    expect(books.filter((book) => book.status === "review")).toHaveLength(0);
    expect(books.find((book) => book.id === "citow-comprehensive-neurosurgery-board-review-2020")).toMatchObject({
      title: "Comprehensive Neurosurgery Board Review (Citow et al., 2020)",
      quizEligible: false,
      kind: "reference-corpus"
    });
    expect(books.find((book) => book.id === "gh11-greenberg-handbook-neurosurgery-11e")).toMatchObject({
      title: "Greenberg Handbook of Neurosurgery, 11th Edition",
      quizEligible: false,
      kind: "reference-corpus",
      mediaSource: "media/GH11_reference_media_v38.zip"
    });
  });

  it("keeps case books and atlases out of scored question pools", () => {
    expect(books.filter((book) => !book.quizEligible).every((book) => book.kind === "case-book" || book.kind === "visual-atlas" || book.kind === "reference-corpus")).toBe(true);
  });

  it("ships importer-complete uploaded candidates while preserving source-review safeguards", () => {
    expect(books.filter((book) => ["nbr3", "greenberg-rapid-review-2017"].includes(book.id)).every((book) => book.status === "ready")).toBe(true);
  });
});
