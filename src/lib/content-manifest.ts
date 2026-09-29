/** Content kinds that can be shipped in the local NeuroQuiz library. */
export type ContentKind =
  | "question-bank"
  | "hybrid-question-bank"
  | "case-book"
  | "visual-atlas"
  | "reference-corpus";

export type ContentStatus = "draft" | "review" | "ready" | "retired";

export interface LibrarySourceManifest {
  id: string;
  title: string;
  kind: ContentKind;
  schema: string;
  adapter: string;
  source: string | string[];
  primaryJson?: string;
  /** Whether content from this entry may enter scored question pools. */
  quizEligible: boolean;
  /** Human/content-pipeline state; runtime never treats draft entries as ready. */
  status?: ContentStatus;
  /** Source content version, independent of the generated asset hash. */
  sourceVersion?: string;
  licenseStatus?: "unknown" | "review" | "cleared";
  referencedAssetsOnly?: boolean;
  questionImages?: "referenced-only";
  webMaxPx?: number;
  webQuality?: number;
}

export interface LibraryManifest {
  books: LibrarySourceManifest[];
}

/** Runtime output generated into public/library/index.json. */
export interface BundledContentManifest {
  id: string;
  title: string;
  kind: ContentKind;
  schema: string;
  adapter: string;
  quizEligible: boolean;
  status: ContentStatus;
  sourceVersion?: string;
  version: string;
  files: string[];
  packs?: string[];
}

export interface BundledLibraryIndex {
  generatedAt?: string;
  format: 2;
  books: BundledContentManifest[];
}
