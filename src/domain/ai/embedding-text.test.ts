import { describe, expect, it } from "vitest";

import { affectsEmbedding, buildEmbeddingText } from "./embedding-text";

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

/**
 * A product row as the admin update path sees it — only the fields
 * `affectsEmbedding` inspects, plus a few it must ignore.
 */
const ROW = {
  materialId: "m1",
  finishId: "f1",
  surfaceLookId: "s1",
  colorFamilyId: "c1",
  applicationIds: ["floor", "wall"],
  primaryMediaId: "media-1",
  basePrice: 42,
  sku: "AC-TEST-0612",
  widthMm: 600,
};

describe("affectsEmbedding", () => {
  it("is false when nothing changed", () => {
    expect(affectsEmbedding(ROW, { ...ROW })).toBe(false);
  });

  it.each([
    ["materialId", "m2"],
    ["finishId", "f2"],
    ["surfaceLookId", "s2"],
    ["colorFamilyId", "c2"],
    ["primaryMediaId", "media-2"],
  ])("is true when %s changes", (field, next) => {
    expect(affectsEmbedding(ROW, { ...ROW, [field]: next })).toBe(true);
  });

  it("is true when the primary photo is removed", () => {
    expect(affectsEmbedding(ROW, { ...ROW, primaryMediaId: null })).toBe(true);
  });

  // The regression this guards: editing a price must never evict a product
  // from search, which is what retiring its embedding would do.
  it.each([
    ["basePrice", 99],
    ["sku", "AC-OTHER-0612"],
    ["widthMm", 1200],
  ])("is false when only %s changes", (field, next) => {
    expect(affectsEmbedding(ROW, { ...ROW, [field]: next })).toBe(false);
  });

  it("compares applicationIds by content, not identity", () => {
    // A form round-trip rebuilds the array; reference equality would call
    // every save a change and retire the embedding on every edit.
    expect(
      affectsEmbedding(ROW, { ...ROW, applicationIds: ["floor", "wall"] }),
    ).toBe(false);
  });

  it("is true when an application is added", () => {
    expect(
      affectsEmbedding(ROW, {
        ...ROW,
        applicationIds: ["floor", "wall", "outdoor"],
      }),
    ).toBe(true);
  });

  it("is true when an application is removed", () => {
    expect(affectsEmbedding(ROW, { ...ROW, applicationIds: ["floor"] })).toBe(true);
  });

  it("is true when applications are reordered to a different set", () => {
    expect(
      affectsEmbedding(ROW, { ...ROW, applicationIds: ["wall", "outdoor"] }),
    ).toBe(true);
  });
});
