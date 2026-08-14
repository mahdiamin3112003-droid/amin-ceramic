import { describe, expect, it } from "vitest";

import { fuseRankings } from "./retrieval-fusion";

describe("fuseRankings", () => {
  it("ranks a product appearing first in both lists above one appearing in only one", () => {
    const visual = [
      { productId: "a", distance: 0.1 },
      { productId: "b", distance: 0.3 },
    ];
    const semantic = [
      { productId: "a", distance: 0.2 },
      { productId: "c", distance: 0.4 },
    ];

    const result = fuseRankings(visual, semantic);

    expect(result[0]?.productId).toBe("a");
    expect(result.map((r) => r.productId)).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
  });

  it("gives a product in both lists a higher fused score than one in only one list", () => {
    const visual = [
      { productId: "a", distance: 0.1 },
      { productId: "b", distance: 0.15 },
    ];
    const semantic = [{ productId: "a", distance: 0.1 }];

    const result = fuseRankings(visual, semantic);
    const a = result.find((r) => r.productId === "a");
    const b = result.find((r) => r.productId === "b");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.fusedScore).toBeGreaterThan(b?.fusedScore ?? Infinity);
  });

  it("carries visual and semantic distances through separately, not conflated", () => {
    const visual = [{ productId: "a", distance: 0.2 }];
    const semantic = [{ productId: "a", distance: 0.5 }];

    const [result] = fuseRankings(visual, semantic);

    expect(result?.visualDistance).toBe(0.2);
    expect(result?.semanticDistance).toBe(0.5);
  });

  it("leaves calibratedScore null for a semantic-only match", () => {
    const result = fuseRankings([], [{ productId: "a", distance: 0.3 }]);

    expect(result[0]?.visualDistance).toBeNull();
    expect(result[0]?.calibratedScore).toBeNull();
  });

  it("sets calibratedScore from the visual distance when present", () => {
    const result = fuseRankings([{ productId: "a", distance: 0 }], []);

    expect(result[0]?.calibratedScore?.percent).toBe(100);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(fuseRankings([], [])).toEqual([]);
  });

  it("sorts strictly descending by fused score", () => {
    const visual = [
      { productId: "a", distance: 0.1 },
      { productId: "b", distance: 0.2 },
      { productId: "c", distance: 0.3 },
    ];

    const result = fuseRankings(visual, []);
    for (let i = 1; i < result.length; i++) {
      const current = result[i];
      const previous = result[i - 1];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect(current?.fusedScore).toBeLessThanOrEqual(
        previous?.fusedScore ?? Infinity,
      );
    }
  });
});
