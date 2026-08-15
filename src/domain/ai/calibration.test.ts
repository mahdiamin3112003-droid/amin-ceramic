import { describe, expect, it } from "vitest";

import { calibrateScore, isConfidentMatch } from "./calibration";

/**
 * Real cosine distances measured across all 132 pairs of DIFFERENT products
 * in the catalogue. These are the numbers the mapping is anchored to, so
 * they are the numbers worth asserting against — a change that quietly
 * re-generous-ifies the curve fails here.
 */
const UNRELATED = {
  closestPair: 0.0882, // p01
  p05: 0.1128,
  p10: 0.1456,
  median: 0.2232,
  mostDissimilarPair: 0.4385,
} as const;

describe("calibrateScore", () => {
  it("maps an exact match to 100%", () => {
    expect(calibrateScore(0).percent).toBe(100);
  });

  it("is monotonic non-increasing across the measured range", () => {
    const distances = [0, 0.05, 0.09, 0.12, 0.15, 0.2, 0.2232, 0.3, 0.4385, 1.2];
    const percents = distances.map((d) => calibrateScore(d).percent);
    for (let i = 1; i < percents.length; i++) {
      const current = percents[i];
      const previous = percents[i - 1];
      expect(current).toBeDefined();
      expect(current).toBeLessThanOrEqual(previous ?? 100);
    }
  });

  it("flags every result as provisional", () => {
    expect(calibrateScore(0.05).isProvisional).toBe(true);
    expect(calibrateScore(UNRELATED.median).isProvisional).toBe(true);
  });

  it("throws for a negative distance", () => {
    expect(() => calibrateScore(-0.1)).toThrow(RangeError);
  });

  /**
   * The regression this file exists for.
   *
   * The original mapping scored these 93%, 81% and 64% — every unrelated
   * pair in the catalogue read as a confident match, and nothing was ever
   * rejected. Each assertion below is the specific number that was wrong.
   */
  describe("the noise floor is not presented as a match", () => {
    it("scores the CLOSEST unrelated pair well under the old 93%", () => {
      const score = calibrateScore(UNRELATED.closestPair);
      expect(score.percent).toBeLessThanOrEqual(65);
      expect(score.percent).toBeGreaterThan(0); // still notable, not dismissed
    });

    it("scores the MEDIAN unrelated pair as near-noise, not 81%", () => {
      expect(calibrateScore(UNRELATED.median).percent).toBeLessThanOrEqual(15);
    });

    it("scores the two most dissimilar tiles at 0%, not 64%", () => {
      expect(calibrateScore(UNRELATED.mostDissimilarPair).percent).toBe(0);
    });
  });
});

describe("confidence bands", () => {
  it("calls an exact match strong", () => {
    expect(calibrateScore(0).band).toBe("strong");
  });

  it("does not call the median unrelated pair a match at all", () => {
    expect(calibrateScore(UNRELATED.median).band).toBe("none");
  });

  it("treats the closest unrelated pair as strong-but-borderline", () => {
    // p01 sits exactly on the strong/moderate boundary by construction:
    // closer than 99% of coincidences is the most generous reading that is
    // still defensible.
    expect(calibrateScore(UNRELATED.closestPair).band).toBe("strong");
    expect(calibrateScore(UNRELATED.p05).band).toBe("moderate");
    expect(calibrateScore(UNRELATED.p10).band).toBe("moderate");
  });

  it("degrades through the bands as distance grows", () => {
    expect(calibrateScore(0.05).band).toBe("strong");
    expect(calibrateScore(0.12).band).toBe("moderate");
    expect(calibrateScore(0.2).band).toBe("weak");
    expect(calibrateScore(0.3).band).toBe("none");
  });
});

describe("isConfidentMatch", () => {
  it("accepts strong and moderate", () => {
    expect(isConfidentMatch(calibrateScore(0))).toBe(true);
    expect(isConfidentMatch(calibrateScore(0.12))).toBe(true);
  });

  /**
   * At 12 products a "weak" top result is almost always the nearest of
   * twelve unrelated tiles rather than a real answer, so it must route to
   * docs/02 §3.4's STATE 4 rather than render as a result.
   */
  it("rejects weak and none, sending the visitor to the low-confidence path", () => {
    expect(isConfidentMatch(calibrateScore(0.2))).toBe(false);
    expect(isConfidentMatch(calibrateScore(UNRELATED.median))).toBe(false);
    expect(isConfidentMatch(calibrateScore(UNRELATED.mostDissimilarPair))).toBe(
      false,
    );
  });
});
