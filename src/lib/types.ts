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

export interface Question {
  id: string;
  bookId: string;
  chapterId: string;
  number: string;
  stem: string;
  options: Option[];
  /** Keys of the correct options (multiple for "select all that apply"). */
  answer: string[];
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
}

export interface CaseScenario {
  id: string;
  bookId?: string;
  chapterId?: string;
  title: string;
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
}

export type QuizMode = "tutor" | "timed" | "exam" | "review";

export interface SessionAnswer {
  questionId: string;
  selected: string[];
  correct?: boolean;
  timeMs: number;
  flagged?: boolean;
  /** Eliminated options (strike-through) in the UI */
  struck?: string[];
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
}
