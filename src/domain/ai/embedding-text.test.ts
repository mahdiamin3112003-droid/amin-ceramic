import { describe, expect, it } from "vitest";

import { buildEmbeddingText } from "./embedding-text";

const BASE = {
  name: "Alissa Beige Matte",
  description: null,
  material: "porcelain",
  finish: "matte",
  surfaceLook: "concrete",
  colorFamily: "beige",
  applications: ["floor", "wall"],
};

describe("buildEmbeddingText", () => {
  it("joins the product's fields into one string", () => {
    expect(buildEmbeddingText(BASE)).toBe(
      "Alissa Beige Matte. porcelain tile. matte finish. concrete look. beige colour. floor, wall",
    );
  });

  it("includes the description when present", () => {
    const text = buildEmbeddingText({
      ...BASE,
      description: "A warm, large-format tile.",
    });
    expect(text).toContain("A warm, large-format tile.");
  });

  it("omits a null description rather than inserting an empty segment", () => {
    const text = buildEmbeddingText(BASE);
    expect(text).not.toContain("..");
  });

  it("omits applications entirely when the list is empty, rather than a trailing empty segment", () => {
    const text = buildEmbeddingText({ ...BASE, applications: [] });
    expect(text.endsWith("beige colour")).toBe(true);
  });
});
