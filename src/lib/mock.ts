import { db } from "./db";
import { buildPool, emptyFilter, toUnits } from "./quiz";
import type { Question, QuestionFormat } from "./types";
import { shuffle } from "./util";

export interface MockSpec {
  total: number;
  /** relative weight per book id (0 = leave out) */
  weights: Record<string, number>;
  preferUnused: boolean;
  formats: QuestionFormat[];
}

export interface MockPlan {
  questions: Question[];
  perBook: { bookId: string; wanted: number; got: number; available: number }[];
}

/** Split `total` by weight with whole numbers that add up exactly (largest remainder). */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  if (!sum) return {};
  const raw = entries.map(([id, w]) => ({ id, exact: (total * w) / sum }));
  const out = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of raw.sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    out[r.id]++;
  }
  return out;
}

export async function buildMockExam(spec: MockSpec): Promise<MockPlan> {
  const quotas = allocate(spec.total, spec.weights);
  const chosenUnits: Question[][] = [];
  const perBook: MockPlan["perBook"] = [];
  for (const [bookId, wanted] of Object.entries(quotas)) {
    const pool = await buildPool({ ...emptyFilter(), bookIds: [bookId], formats: spec.formats });
    let units = shuffle(toUnits(pool));
    if (spec.preferUnused) {
      const states = new Map((await db.questionStates.bulkGet(pool.map((q) => q.id))).filter((s) => !!s).map((s) => [s!.questionId, s!]));
      const unused = (u: Question[]) => u.every((q) => !states.get(q.id)?.timesSeen);
      units = [...units.filter(unused), ...units.filter((u) => !unused(u))];
    }
    let got = 0;
    for (const u of units) {
      if (got >= wanted) break;
      chosenUnits.push(u);
      got += u.length;
    }
    perBook.push({ bookId, wanted, got, available: pool.length });
  }
  return { questions: shuffle(chosenUnits).flat(), perBook };
}
