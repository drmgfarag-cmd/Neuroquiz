// ---------------------------------------------------------------------------
// Content (imported from books – re-importable, identical on every device)
// ---------------------------------------------------------------------------

export interface Book {
  id: string;
  title: string;
  /** Original file names this book was built from. */
  sources: string[];
  importedAt: number;
  questionCount: number;
  flashcardCount: number;
  caseCount: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
}

/** A figure/table image referenced from JSON by file name. */
export interface MediaRef {
  file: string;
  caption?: string;
}

export interface Option {
  key: string; // "A", "B", ...
  text: string;
  media: MediaRef[];
}

/**
 * single     – one best answer (default)
 * multi      – select all that apply
 * truefalse  – mark every statement (option) true or false
 * matching   – extended matching (EMI): pick one choice from a shared list per item
 * ordering   – put the options in the right sequence (answer = keys in order)
 * text       – type the answer (cloze / short answer), graded against `accepted`
 * hotspot    – click the right place on the question's first image (`regions`)
 * sct        – script concordance: rate how new information changes a hypothesis
 *              (−2…+2); partial credit from an expert panel (`panel`)
 */
export type QuestionFormat = "single" | "multi" | "truefalse" | "matching" | "ordering" | "text" | "hotspot" | "sct";

/** Area on an image, as fractions (0–1) of its width and height. */
export type HotspotRegion = { x: number; y: number; w: number; h: number; label?: string } | { x: number; y: number; r: number; label?: string };

export interface MatchChoice {
  key: string; // "i", "ii", … or "1", "2", …
  text: string;
}

export interface Question {
  id: string;
  bookId: string;
  chapterId: string;
  number: string;
  stem: string;
  options: Option[];
  /** Keys of the correct options (multiple for "select all that apply"; the TRUE statements for truefalse). */
  answer: string[];
  format?: QuestionFormat;
  /** truefalse: correct verdict per option key */
  verdicts?: Record<string, boolean>;
  /** matching: the shared list to choose from … */
  choices?: MatchChoice[];
  /** … and the correct choice key per item (option key) */
  matches?: Record<string, string>;
  /** text: accepted answers (case and punctuation are ignored, small typos allowed) */
  accepted?: string[];
  /** hotspot: where a click counts as correct */
  regions?: HotspotRegion[];
  /** sct: expert panel votes per option key (the modal answer gets full credit) */
  panel?: Record<string, number>;
  /** Questions sharing a case, an EMI answer list or a parent question; kept together when shuffled. */
  groupId?: string;
  /** true when the learner's correction is applied (see Correction) */
  edited?: boolean;
  /** the source's own question id (e.g. "Q17", "07_089") */
  sourceId?: string;
  /** warning from the book's extraction (unresolved mismatch, needs review…) */
  sourceWarning?: string;
  /** Source transcription is pending verification; excluded from scored tests until corrected. */
  sourceReviewRequired?: boolean;
  explanation: string;
  stemMedia: MediaRef[];
  explanationMedia: MediaRef[];
  /** Tags that came with the source JSON (never overwritten). */
  sourceTags: string[];
  order: number;
}

export interface Flashcard {
  id: string;
  bookId?: string;
  chapterId?: string;
  questionId?: string;
  front: string;
  back: string;
  frontMedia: MediaRef[];
  backMedia: MediaRef[];
  sourceTags: string[];
  /** "imported" | "generated" | "user" */
  origin: "imported" | "generated" | "user";
  createdAt: number;
  updatedAt?: number;
}

export interface CaseStage {
  title: string;
  content: string;
  question?: string;
  answer?: string;
  media: MediaRef[];
  /** Figures shown only after revealing the answer. */
  answerMedia?: MediaRef[];
}

export interface CaseScenario {
  id: string;
  bookId?: string;
  chapterId?: string;
  title: string;
  /** Book chapters of short-answer questions are read in the Cases area. */
  kind?: "qa";
  presentation: string;
  presentationMedia: MediaRef[];
  stages: CaseStage[];
  discussion: string;
  sourceTags: string[];
  origin: "imported" | "generated" | "user";
  createdAt: number;
  updatedAt?: number;
}

export interface MediaFile {
  /** `${bookId}/${normalised file name}` */
  id: string;
  bookId: string;
  name: string;
  blob: Blob;
}

/** A standalone visual reference, independent of quiz questions or cases. */
export interface AtlasEntry {
  id: string;
  bookId: string;
  chapterId: string;
  file: string;
  title: string;
  description?: string;
  kind: "figure" | "table" | "diagram" | "radiology" | "note";
  sourcePage?: number;
  sourceTags: string[];
  /** Shared identifier for distinct photographs of the same atlas subject. */
  groupId?: string;
}

// ---------------------------------------------------------------------------
// User data (synced between devices, keyed so re-imports don't lose it)
// ---------------------------------------------------------------------------

export type Difficulty = "easy" | "medium" | "hard";

/** Tags/categories for a question, flashcard or case (AI, local or manual). */
export interface Annotation {
  /** id of the annotated item (question, flashcard or case id) */
  id: string;
  kind: "question" | "flashcard" | "case";
  topic: string;
  subtopic: string;
  tags: string[];
  keywords: string[];
  difficulty?: Difficulty;
  highYield?: boolean;
  summary?: string;
  source: "ai" | "local" | "manual";
  updatedAt: number;
}

export interface QuestionState {
  questionId: string;
  timesSeen: number;
  timesCorrect: number;
  lastCorrect?: boolean;
  lastSeenAt?: number;
  flagged: boolean;
  note: string;
  /** confidence given with the last answer: 1 guess, 2 unsure, 3 sure */
  lastConfidence?: Confidence;
  /** Problem reported by the learner (wrong key, OCR error, missing image …) */
  issue?: string;
  srs: SrsState;
  updatedAt: number;
}

export interface CardState {
  cardId: string;
  srs: SrsState;
  suspended: boolean;
  updatedAt: number;
}

export interface SrsState {
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
  due: number; // epoch ms
  /** FSRS memory state (days until recall probability falls to 90%, difficulty 1–10) */
  stability?: number;
  difficulty?: number;
  lastReview?: number;
}

export type Confidence = 1 | 2 | 3;

export type QuizMode = "tutor" | "timed" | "exam" | "review";

export interface SessionAnswer {
  questionId: string;
  selected: string[];
  correct?: boolean;
  /** The response was submitted even though the source has no verified key. */
  unscoredSubmitted?: boolean;
  /** Tutor feedback has been shown, but study statistics are pending until finish. */
  pendingResult?: boolean;
  timeMs: number;
  flagged?: boolean;
  /** Eliminated options (strike-through) in the UI */
  struck?: string[];
  /** 1 guess, 2 unsure, 3 sure */
  confidence?: Confidence;
  /** Text the learner highlighted in the stem */
  highlights?: string[];
  /** recall mode: the options were shown after the learner committed to an answer in their head */
  optionsShown?: boolean;
}

export interface QuizSession {
  id: string;
  mode: QuizMode;
  title: string;
  questionIds: string[];
  answers: Record<string, SessionAnswer>;
  current: number;
  startedAt: number;
  /** Active time spent in the session (excludes pauses). */
  elapsedMs?: number;
  finishedAt?: number;
  /** Seconds for the whole exam (timed mode) */
  timeLimitSec?: number;
  shuffleOptions: boolean;
  /** Hide the options until the learner has an answer in mind (active recall). */
  recall?: boolean;
  /** Ask how sure the learner is with every answer. */
  askConfidence?: boolean;
  optionOrder?: Record<string, string[]>;
  score?: number;
  updatedAt: number;
}

export interface Settings {
  apiKey: string;
  model: string;
  numericAnswerBase: 0 | 1;
  syncUrl: string;
  syncToken: string;
  deviceName: string;
  theme: "system" | "light" | "dark";
  fontScale: number;
  /** AI provider for every AI feature ("anthropic" = Claude, the default) */
  provider?: "anthropic" | "openai" | "gemini" | "xai";
  /** API keys and models for the other providers (Claude uses apiKey/model) */
  keys?: Partial<Record<"openai" | "gemini" | "xai", string>>;
  models?: Partial<Record<"openai" | "gemini" | "xai", string>>;
  /** spaced-repetition scheduler for flashcards and question revision */
  scheduler?: "fsrs" | "sm2";
}

/** Fields of a question the learner can correct. */
export type EditableFields = Partial<Pick<Question, "stem" | "options" | "answer" | "verdicts" | "matches" | "choices" | "accepted" | "explanation">>;

/** A learner's fix to an imported question; re-applied after every re-import and synced. */
export interface Correction {
  questionId: string;
  changes: EditableFields;
  /** the imported values, for "Revert to original" */
  original: EditableFields;
  updatedAt: number;
}

/** Claude's opinion on a question's answer key. */
export interface AiReview {
  questionId: string;
  verdict: "agree" | "disagree" | "unsure";
  /** option keys Claude considers correct (single/multi questions) */
  suggestedKeys: string[];
  suggestion: string;
  reason: string;
  model: string;
  dismissed?: boolean;
  updatedAt: number;
}
