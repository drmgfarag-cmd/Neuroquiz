import { describe, expect, it } from "vitest";
import { newSrs, review, reviewFsrs, reviewSm2 } from "../src/lib/srs";

describe("srs", () => {
  it("SM-2 grows intervals on success and resets on lapse", () => {
    let s = newSrs(0);
    s = reviewSm2(s, "good", 0);
    expect(s.interval).toBe(1);
    s = reviewSm2(s, "good", 0);
    expect(s.interval).toBe(4);
    s = reviewSm2(s, "good", 0);
    expect(s.interval).toBe(10);
    const lapsed = reviewSm2(s, "again", 0);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due).toBe(10 * 60_000);
    expect(lapsed.ease).toBeCloseTo(2.3);
  });

  it("FSRS grows stability with successful reviews and shrinks it on a lapse", () => {
    const DAY = 86_400_000;
    let s = reviewFsrs(newSrs(0), "good", 0);
    expect(s.interval).toBe(3);
    expect(s.difficulty).toBeGreaterThan(1);
    const first = s.stability!;
    s = reviewFsrs(s, "good", s.due);
    expect(s.stability!).toBeGreaterThan(first * 2);
    expect(s.interval).toBeGreaterThan(8);
    const easy = reviewFsrs(s, "easy", s.due);
    const hard = reviewFsrs(s, "hard", s.due);
    expect(easy.interval).toBeGreaterThan(hard.interval);
    const lapsed = reviewFsrs(s, "again", s.due);
    expect(lapsed.stability!).toBeLessThan(s.stability!);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due).toBe(s.due + 10 * 60_000);
    // a card scheduled by SM-2 carries on from its interval
    const sm2 = { ease: 2.5, interval: 20, reps: 4, lapses: 0, due: 30 * DAY };
    expect(reviewFsrs(sm2, "good", 30 * DAY).interval).toBeGreaterThan(20);
    expect(review(sm2, "good", 30 * DAY, "sm2").interval).toBe(50);
  });
});
