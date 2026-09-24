import type { SrsState } from "./types";

const DAY = 86_400_000;

export type Grade = "again" | "hard" | "good" | "easy";

export function newSrs(now = Date.now()): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now };
}

/** SM-2 variant used by both flashcards and question revision. */
export function review(s: SrsState, grade: Grade, now = Date.now()): SrsState {
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

/** Human-readable preview of the next interval for a grade button. */
export function previewInterval(s: SrsState, grade: Grade): string {
  const next = review(s, grade, 0);
  if (next.interval === 0) return "10m";
  if (next.interval < 30) return `${next.interval}d`;
  if (next.interval < 365) return `${Math.round(next.interval / 30)}mo`;
  return `${(next.interval / 365).toFixed(1)}y`;
}
