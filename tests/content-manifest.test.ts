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
    expect(books).toHaveLength(44);
    expect(books.every((book) => book.kind && book.schema && book.adapter && typeof book.quizEligible === "boolean")).toBe(true);
    expect(books.filter((book) => book.kind === "question-bank")).toHaveLength(18);
    expect(books.filter((book) => book.kind === "hybrid-question-bank")).toHaveLength(1);
    expect(books.filter((book) => book.kind === "case-book")).toHaveLength(22);
    expect(books.filter((book) => book.kind === "visual-atlas")).toHaveLength(2);
    expect(books.filter((book) => book.kind === "reference-corpus")).toHaveLength(1);
    expect(books.filter((book) => book.status === "ready")).toHaveLength(26);
  });

  it("keeps case books and atlases out of scored question pools", () => {
    expect(books.filter((book) => !book.quizEligible).every((book) => book.kind === "case-book" || book.kind === "visual-atlas" || book.kind === "reference-corpus")).toBe(true);
  });
});
