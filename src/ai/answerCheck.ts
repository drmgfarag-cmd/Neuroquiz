import { db } from "../lib/db";
import { getSettings } from "../lib/settings";
import type { AiReview, Question } from "../lib/types";
import { chunk } from "../lib/util";
import { aiCheckAnswers } from "./claude";
import { questionText } from "./tagger";

export interface CheckProgress {
  done: number;
  total: number;
  failed: number;
  lastError?: string;
}

/** Ask Claude to audit answer keys; results are stored per question (synced). */
export async function runAnswerCheck(
  questions: Question[],
  onlyUnchecked: boolean,
  onProgress: (p: CheckProgress) => void,
  signal: AbortSignal,
  batchSize = 8,
  concurrency = 2
): Promise<CheckProgress> {
  let todo = questions;
  if (onlyUnchecked) {
    const existing = await db.aiReviews.bulkGet(questions.map((q) => q.id));
    todo = questions.filter((_, i) => !existing[i]);
  }
  const progress: CheckProgress = { done: 0, total: todo.length, failed: 0 };
  onProgress({ ...progress });
  const batches = chunk(todo, batchSize);
  const byId = new Map(todo.map((q) => [q.id, q]));
  const { model } = getSettings();
  let next = 0;
  let stopped = false;
  async function worker() {
    while (next < batches.length && !signal.aborted && !stopped) {
      const batch = batches[next++];
      try {
        const checks = await aiCheckAnswers(
          batch.map((q) => ({ id: q.id, text: questionText(q) })),
          signal
        );
        const now = Date.now();
        await db.aiReviews.bulkPut(
          checks.map(
            (c): AiReview => ({
              questionId: c.id,
              verdict: c.verdict,
              // keep only keys that exist on the question
              suggestedKeys: c.suggested_keys.map((k) => k.trim().toUpperCase()).filter((k) => byId.get(c.id)!.options.some((o) => o.key.toUpperCase() === k)),
              suggestion: c.suggestion,
              reason: c.reason,
              model,
              updatedAt: now
            })
          )
        );
        progress.done += checks.length;
        progress.failed += batch.length - checks.length;
      } catch (e) {
        if (signal.aborted) break;
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          stopped = true;
          progress.lastError = "Connection lost – stopped. Run again to continue where it stopped.";
          break;
        }
        progress.failed += batch.length;
        progress.lastError = e instanceof Error ? e.message : String(e);
      }
      onProgress({ ...progress });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  onProgress({ ...progress });
  return progress;
}
