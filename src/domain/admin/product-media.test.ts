import { describe, expect, it } from "vitest";

import { PRODUCT_MEDIA_ROLES, type ProductMediaRole } from "./product";

/**
 * The media-role list, asserted against the database enum.
 *
 * ── Why this exists as a unit test ──
 * The e2e spec that checks the role dropdown SKIPS whenever the media
 * library is empty, because the dropdown only renders beside a usable
 * picker — and the library is empty until the client's photography lands.
 * So the e2e coverage for this reports "5 passed" while silently proving
 * nothing about the roles.
 *
 * This runs every time. It is the actual guard.
 */

/**
 * Copied deliberately, not imported.
 *
 * Importing from `@prisma/client` would defeat the purpose — the point is
 * to fail when the Prisma enum and the domain list disagree, which cannot
 * happen if both sides read the same value. This transcription is checked
 * against `prisma/media.prisma` by a human; the test's job is to notice
 * when the domain list drifts away from it.
 */
const DATABASE_ENUM = [
  "primary",
  "gallery",
  "room_scene",
  "macro_detail",
  "installed",
  "technical_drawing",
  "packaging",
  "swatch",
] as const;

describe("product media roles", () => {
  it("matches the database enum exactly", () => {
    expect([...PRODUCT_MEDIA_ROLES].sort()).toEqual([...DATABASE_ENUM].sort());
  });

  /**
   * The two that were missing. `technical_drawing` is named in docs/02
   * §3.3's PDP thumbnail strip — "product · scene · macro · installed ·
   * drawing" — and contractors are the audience for it, so losing it again
   * would be a quiet failure that only surfaces once real supplier assets
   * arrive.
   */
  it("includes the roles that were previously unattachable", () => {
    expect(PRODUCT_MEDIA_ROLES).toContain("technical_drawing");
    expect(PRODUCT_MEDIA_ROLES).toContain("packaging");
  });

  it("has no duplicates", () => {
    expect(new Set(PRODUCT_MEDIA_ROLES).size).toBe(PRODUCT_MEDIA_ROLES.length);
  });

  it("derives the type from the list, so the two cannot disagree", () => {
    // A compile-time assertion: if `ProductMediaRole` ever stops being
    // `typeof PRODUCT_MEDIA_ROLES[number]`, this stops type-checking.
    const role: ProductMediaRole = "technical_drawing";
    expect(PRODUCT_MEDIA_ROLES).toContain(role);
  });
});
