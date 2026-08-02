import { describe, expect, it } from "vitest";

import {
  calculateAreaWithWastage,
  calculateBoxesNeeded,
  calculateWeightKg,
  estimateQuantity,
} from "./calculator";

describe("calculateAreaWithWastage", () => {
  it("adds the wastage percentage to the area", () => {
    expect(calculateAreaWithWastage(100, 10)).toBeCloseTo(110);
  });

  it("allows zero wastage", () => {
    expect(calculateAreaWithWastage(50, 0)).toBeCloseTo(50);
  });

  it("throws for zero area", () => {
    expect(() => calculateAreaWithWastage(0, 10)).toThrow(RangeError);
  });

  it("throws for negative area", () => {
    expect(() => calculateAreaWithWastage(-5, 10)).toThrow(RangeError);
  });

  it("throws for negative wastage", () => {
    expect(() => calculateAreaWithWastage(100, -1)).toThrow(RangeError);
  });
});

describe("calculateBoxesNeeded", () => {
  it("rounds up a partial box", () => {
    expect(calculateBoxesNeeded(10, 1.44)).toBe(7);
  });

  it("returns an exact box count without rounding up unnecessarily", () => {
    expect(calculateBoxesNeeded(2.88, 1.44)).toBe(2);
  });

  it("allows zero area (zero boxes)", () => {
    expect(calculateBoxesNeeded(0, 1.44)).toBe(0);
  });

  it("throws for negative area", () => {
    expect(() => calculateBoxesNeeded(-1, 1.44)).toThrow(RangeError);
  });

  it("throws for zero box size", () => {
    expect(() => calculateBoxesNeeded(10, 0)).toThrow(RangeError);
  });

  it("throws for negative box size", () => {
    expect(() => calculateBoxesNeeded(10, -1.44)).toThrow(RangeError);
  });
});

describe("calculateWeightKg", () => {
  it("multiplies boxes by weight per box", () => {
    expect(calculateWeightKg(7, 30)).toBe(210);
  });

  it("allows zero boxes (zero weight)", () => {
    expect(calculateWeightKg(0, 30)).toBe(0);
  });

  it("throws for negative boxes", () => {
    expect(() => calculateWeightKg(-1, 30)).toThrow(RangeError);
  });

  it("throws for a non-integer box count", () => {
    expect(() => calculateWeightKg(1.5, 30)).toThrow(RangeError);
  });

  it("throws for zero weight per box", () => {
    expect(() => calculateWeightKg(7, 0)).toThrow(RangeError);
  });

  it("throws for negative weight per box", () => {
    expect(() => calculateWeightKg(7, -30)).toThrow(RangeError);
  });
});

describe("estimateQuantity", () => {
  it("composes area, box and weight calculations", () => {
    const result = estimateQuantity(10, 10, 1.44, 30);
    expect(result.areaWithWastageM2).toBeCloseTo(11);
    expect(result.boxes).toBe(8);
    expect(result.weightKg).toBe(240);
  });

  it("propagates a RangeError from the underlying calculation", () => {
    expect(() => estimateQuantity(-10, 10, 1.44, 30)).toThrow(RangeError);
  });
});
