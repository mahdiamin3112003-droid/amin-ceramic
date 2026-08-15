import { describe, expect, it } from "vitest";

import { explainMatch } from "./explanation";

const PRODUCT = {
  colorFamily: "beige",
  surfaceLook: "concrete",
  finish: "matte",
  nominalFormat: "60×120",
};

describe("explainMatch", () => {
  it("names what agreed", () => {
    const result = explainMatch({ colorFamily: "beige", finish: "matte" }, PRODUCT);
    expect(result.sentence).toBe("Same beige colour and matte finish.");
    expect(result.matched).toEqual(["colour", "finish"]);
  });

  it("names what differed, stating the PRODUCT's value", () => {
    const result = explainMatch({ colorFamily: "grey" }, PRODUCT);
    // "this tile is beige" — a fact from the row. Never "your photo is grey",
    // which would assert something about an image we cannot vouch for.
    expect(result.sentence).toContain("beige colour");
    expect(result.differed).toEqual(["colour"]);
  });

  it("combines agreement and difference in one sentence", () => {
    const result = explainMatch(
      { colorFamily: "beige", surfaceLook: "marble" },
      PRODUCT,
    );
    expect(result.matched).toEqual(["colour"]);
    expect(result.differed).toEqual(["look"]);
    expect(result.sentence).toBe(
      "Same beige colour; differs in look (this tile is concrete look).",
    );
  });

  /**
   * The grounding guarantee, asserted directly: a field the vision model
   * said nothing about must not appear. This is what stops the sentence
   * drifting into a spec sheet nobody verified.
   */
  it("never mentions an attribute the model did not report", () => {
    const result = explainMatch({ colorFamily: "beige" }, PRODUCT);
    expect(result.sentence).not.toContain("matte");
    expect(result.sentence).not.toContain("concrete");
    expect(result.sentence).not.toContain("60×120");
  });

  it("treats an absent reading as silence, not disagreement", () => {
    const result = explainMatch(
      { colorFamily: "beige", surfaceLook: null, finish: undefined },
      PRODUCT,
    );
    expect(result.differed).toEqual([]);
  });

  it("ignores a product field that is itself null", () => {
    const result = explainMatch(
      { formatGuess: "60x120" },
      { ...PRODUCT, nominalFormat: null },
    );
    expect(result.matched).toEqual([]);
    expect(result.differed).toEqual([]);
    expect(result.sentence).toBe("");
  });

  it("returns an empty sentence when nothing is comparable, rather than inventing one", () => {
    expect(explainMatch({}, PRODUCT).sentence).toBe("");
  });

  it("compares case- and underscore-insensitively", () => {
    const result = explainMatch(
      { surfaceLook: "Solid_Color" },
      {
        ...PRODUCT,
        surfaceLook: "solid color",
      },
    );
    expect(result.matched).toEqual(["look"]);
  });
});
