import { describe, expect, it } from "vitest";

import {
  calibrateScore,
  isConfidentMatch,
  MINIMUM_CONFIDENT_MATCH_PERCENT,
} from "./calibration";

describe("calibrateScore", () => {
  it("maps zero distance to 100%", () => {
    expect(calibrateScore(0).percent).toBe(100);
  });

  it("maps distance at the floor to 0%", () => {
    expect(calibrateScore(1.2).percent).toBe(0);
  });

  it("clamps distance past the floor to 0%, not negative", () => {
    expect(calibrateScore(2).percent).toBe(0);
  });

  it("is monotonic: closer distance never scores lower", () => {
    const distances = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.2];
    const percents = distances.map((d) => calibrateScore(d).percent);
    for (let i = 1; i < percents.length; i++) {
      const current = percents[i];
      const previous = percents[i - 1];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect(current).toBeLessThanOrEqual(previous ?? 0);
    }
  });

  it("flags every result as provisional", () => {
    expect(calibrateScore(0.3).isProvisional).toBe(true);
    expect(calibrateScore(1).isProvisional).toBe(true);
  });

  it("throws for negative distance", () => {
    expect(() => calibrateScore(-0.1)).toThrow(RangeError);
  });
});

describe("isConfidentMatch", () => {
  it("accepts a score at or above the threshold", () => {
    expect(
      isConfidentMatch({
        percent: MINIMUM_CONFIDENT_MATCH_PERCENT,
        isProvisional: true,
      }),
    ).toBe(true);
    expect(isConfidentMatch({ percent: 100, isProvisional: true })).toBe(true);
  });

  it("rejects a score below the threshold", () => {
    expect(
      isConfidentMatch({
        percent: MINIMUM_CONFIDENT_MATCH_PERCENT - 1,
        isProvisional: true,
      }),
    ).toBe(false);
    expect(isConfidentMatch({ percent: 0, isProvisional: true })).toBe(false);
  });
});
