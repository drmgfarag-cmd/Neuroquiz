import { describe, expect, it } from "vitest";
import { newSrs, review } from "../src/lib/srs";

describe("srs", () => {
  it("grows intervals on success and resets on lapse", () => {
    let s = newSrs(0);
    s = review(s, "good", 0);
    expect(s.interval).toBe(1);
    s = review(s, "good", 0);
    expect(s.interval).toBe(4);
    s = review(s, "good", 0);
    expect(s.interval).toBe(10);
    const lapsed = review(s, "again", 0);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due).toBe(10 * 60_000);
    expect(lapsed.ease).toBeCloseTo(2.3);
  });
});
