import { getSettings } from "./settings";
import type { SrsState } from "./types";

const DAY = 86_400_000;

export type Grade = "again" | "hard" | "good" | "easy";

export function newSrs(now = Date.now()): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now };
}

/** Schedules the next review with the scheduler chosen in Settings (FSRS by default). */
export function review(s: SrsState, grade: Grade, now = Date.now(), scheduler = getSettings().scheduler ?? "fsrs"): SrsState {
  return scheduler === "sm2" ? reviewSm2(s, grade, now) : reviewFsrs(s, grade, now);
}

/** SM-2 variant (the classic Anki/SuperMemo scheduler). */
export function reviewSm2(s: SrsState, grade: Grade, now = Date.now()): SrsState {
  let { ease, interval, reps, lapses } = s;
  if (grade === "again") {
    reps = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    // back in 10 minutes
    return { ease, interval: 0, reps, lapses, due: now + 10 * 60_000 };
  }
  if (grade === "hard") ease = Math.max(1.3, ease - 0.15);
  if (grade === "easy") ease = ease + 0.15;

  if (reps === 0) interval = grade === "easy" ? 4 : grade === "hard" ? 1 : 1;
  else if (reps === 1) interval = grade === "easy" ? 7 : grade === "hard" ? 3 : 4;
  else {
    const mult = grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease;
    interval = Math.max(interval + 1, Math.round(interval * mult));
  }
  reps += 1;
  return { ease, interval, reps, lapses, due: now + interval * DAY };
}

// ---------------------------------------------------------------------------
// FSRS-5 (Free Spaced Repetition Scheduler, default parameters). Needs 20–30%
// fewer reviews than SM-2 for the same retention. https://github.com/open-spaced-repetition
// ---------------------------------------------------------------------------

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
/** target probability of recall when a card comes due */
const RETENTION = 0.9;
const G = { again: 1, hard: 2, good: 3, easy: 4 } as const;
const clampD = (d: number) => Math.min(10, Math.max(1, d));
const initD = (g: number) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);

export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function fsrsInterval(stability: number): number {
  const days = (stability / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return Math.min(36500, Math.max(1, Math.round(days)));
}

export function reviewFsrs(s: SrsState, grade: Grade, now = Date.now()): SrsState {
  const g = G[grade];
  let stability: number;
  let difficulty: number;
  const seen = s.reps > 0 || s.lapses > 0;
  if (!seen && s.stability === undefined) {
    stability = W[g - 1];
    difficulty = initD(g);
  } else {
    // cards scheduled by SM-2 so far start from their current interval and ease
    const S = s.stability ?? Math.max(W[2], s.interval || W[2]);
    const D = s.difficulty ?? clampD(5 + (2.5 - s.ease) * 4);
    const last = s.lastReview ?? s.due - Math.max(s.interval, 0) * DAY;
    const elapsed = Math.max(0, (now - last) / DAY);
    const dD = -W[6] * (g - 3);
    difficulty = clampD(W[7] * initD(4) + (1 - W[7]) * (D + (dD * (10 - D)) / 9));
    if (elapsed < 1) {
      // same-day review
      stability = S * Math.exp(W[17] * (g - 3 + W[18]));
      if (g >= 3) stability = Math.max(stability, S);
    } else {
      const R = retrievability(elapsed, S);
      if (g === 1) stability = Math.min(S, W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
      else stability = S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
    }
  }
  stability = Math.max(0.01, stability);
  // SM-2 fields are kept up to date so switching schedulers works both ways
  const ease = Math.min(3.5, Math.max(1.3, 2.5 - (difficulty - 5) / 4));
  if (g === 1) return { ease, interval: 0, reps: 0, lapses: s.lapses + 1, due: now + 10 * 60_000, stability, difficulty, lastReview: now };
  const interval = fsrsInterval(stability);
  return { ease, interval, reps: s.reps + 1, lapses: s.lapses, due: now + interval * DAY, stability, difficulty, lastReview: now };
}

/** Human-readable preview of the next interval for a grade button. */
export function previewInterval(s: SrsState, grade: Grade): string {
  const next = review(s, grade, Date.now());
  if (next.interval === 0) return "10m";
  if (next.interval < 30) return `${next.interval}d`;
  if (next.interval < 365) return `${Math.round(next.interval / 30)}mo`;
  return `${(next.interval / 365).toFixed(1)}y`;
}
