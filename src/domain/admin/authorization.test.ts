import { describe, expect, it } from "vitest";

import { requiresMfa } from "@/domain/admin/permissions";
import {
  MANUAL_MOVEMENT_TYPES,
  requiresReason,
  signedQuantity,
  type ManualMovementType,
} from "@/domain/admin/inventory";
import {
  canTransition,
  publishBlockers,
  PRODUCT_STATUSES,
  STATUS_TRANSITIONS,
  type AdminProductDetail,
  type ProductStatus,
} from "@/domain/admin/product";
import { isHighSeverity } from "@/domain/admin/audit";
import { missingAltLocales } from "@/domain/admin/media";

/**
 * These cover the Phase 4 rules where being wrong is expensive and silent:
 * who is forced through TOTP, what may be published, and which direction a
 * stock movement pushes the ledger.
 *
 * Authorisation is asserted NEGATIVELY as well as positively — the point is
 * not that the right people get in, it is that the wrong ones do not.
 */

// The seeded vocabulary (prisma/seed.ts). Duplicated deliberately: if the
// seed changes, one of these tests should fail rather than quietly agree.
const READ_ONLY = [
  "product.read",
  "inventory.read",
  "price.trade.read",
  "request.read",
  "ai.costs.read",
  "analytics.read",
  "audit.read",
];

const MUTATING = [
  "product.create",
  "product.update",
  "product.publish",
  "product.delete",
  "inventory.adjust",
  "price.base.write",
  "price.trade.write",
  "request.respond",
  "media.manage",
  "content.manage",
  "ingestion.run",
  "ingestion.approve",
  "ai.configure",
  "connector.manage",
  "user.invite",
  "user.manage",
  "role.manage",
  "settings.write",
  "tenant.manage",
];

describe("requiresMfa", () => {
  it("does not force a second factor on a purely read-only role", () => {
    // The seeded `viewer` role.
    expect(requiresMfa(["product.read", "inventory.read", "request.read"])).toBe(
      false,
    );
  });

  it("forces a second factor for every mutating permission, individually", () => {
    for (const permission of MUTATING) {
      expect(requiresMfa([permission]), `${permission} should require MFA`).toBe(
        true,
      );
    }
  });

  it.each(MUTATING.filter((p) => !/\.(write|manage|approve|adjust)$/.test(p)))(
    "covers %s, which docs/04 §4.3's four suffixes miss",
    (permission) => {
      // The reason `requiresMfa` is an inversion rather than a suffix match.
      // `product.delete` and friends are mutations that end in none of
      // `.write`/`.manage`/`.approve`/`.adjust`.
      expect(requiresMfa([permission])).toBe(true);
    },
  );

  it("treats every read-only key as not requiring MFA", () => {
    expect(requiresMfa(READ_ONLY)).toBe(false);
  });

  it("requires MFA if even one permission in a mixed set mutates", () => {
    expect(requiresMfa([...READ_ONLY, "product.delete"])).toBe(true);
  });

  it("requires nothing of a role with no permissions", () => {
    expect(requiresMfa([])).toBe(false);
  });
});

describe("product status transitions", () => {
  it("makes discontinued terminal", () => {
    expect(STATUS_TRANSITIONS.discontinued).toEqual([]);
    for (const to of PRODUCT_STATUSES) {
      expect(canTransition("discontinued", to)).toBe(false);
    }
  });

  it("never allows a transition to itself", () => {
    for (const status of PRODUCT_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("does not allow jumping straight from draft to discontinued", () => {
    // Discontinuing something customers never saw is meaningless; archive is
    // the correct terminus for a draft.
    expect(canTransition("draft", "discontinued")).toBe(false);
    expect(canTransition("draft", "archived")).toBe(true);
  });

  it("allows an archived product back into draft", () => {
    expect(canTransition("archived", "draft")).toBe(true);
  });
});

describe("publishBlockers", () => {
  const complete: Pick<
    AdminProductDetail,
    "translations" | "media" | "basePrice" | "priceVisibility"
  > = {
    translations: [
      {
        locale: "en",
        name: "Carrara Bianco",
        slug: "carrara-bianco",
        shortDescription: null,
        description: "A marble-look porcelain.",
        installationNotes: null,
        careInstructions: null,
        seoTitle: null,
        seoDescription: null,
        tags: [],
      },
      {
        locale: "ar",
        name: "كرارا بيانكو",
        slug: "كرارا-بيانكو",
        shortDescription: null,
        description: "بورسلين بمظهر الرخام.",
        installationNotes: null,
        careInstructions: null,
        seoTitle: null,
        seoDescription: null,
        tags: [],
      },
    ],
    media: [
      {
        mediaAssetId: "a",
        role: "primary",
        url: "https://example.test/a.webp",
        altText: "tile",
        sortOrder: 0,
      },
    ],
    basePrice: 42,
    priceVisibility: "public",
  };

  it("passes a complete bilingual product", () => {
    expect(publishBlockers(complete, ["en", "ar"])).toEqual([]);
  });

  it("blocks a product with no Arabic translation", () => {
    const enOnly = {
      ...complete,
      translations: complete.translations.filter((t) => t.locale === "en"),
    };
    const blockers = publishBlockers(enOnly, ["en", "ar"]);
    expect(blockers).toContain("Missing AR name");
    expect(blockers).toContain("Missing AR description");
  });

  it("blocks a product with no imagery", () => {
    expect(publishBlockers({ ...complete, media: [] }, ["en", "ar"])).toContain(
      "No images",
    );
  });

  it("blocks a publicly-priced product with no price", () => {
    expect(publishBlockers({ ...complete, basePrice: null }, ["en"])).toContain(
      "No price",
    );
  });

  it("does NOT require a price when the price is on request", () => {
    // A slab quoted per project legitimately has no public number.
    expect(
      publishBlockers(
        { ...complete, basePrice: null, priceVisibility: "on_request" },
        ["en", "ar"],
      ),
    ).toEqual([]);
  });

  it("treats whitespace-only copy as missing", () => {
    const blank = {
      ...complete,
      translations: complete.translations.map((t) =>
        t.locale === "en" ? { ...t, name: "   " } : t,
      ),
    };
    expect(publishBlockers(blank, ["en"])).toContain("Missing EN name");
  });
});

describe("signedQuantity", () => {
  it("adds stock for a receipt regardless of the sign entered", () => {
    expect(signedQuantity("receipt", 12.5)).toBe(12.5);
    // Someone typing "-12.5" into a receipt means twelve and a half in.
    expect(signedQuantity("receipt", -12.5)).toBe(12.5);
  });

  it("removes stock for damage and write-offs regardless of the sign entered", () => {
    expect(signedQuantity("damage", 4)).toBe(-4);
    expect(signedQuantity("damage", -4)).toBe(-4);
    expect(signedQuantity("write_off", 9.75)).toBe(-9.75);
  });

  it("adds stock for a customer return", () => {
    expect(signedQuantity("return", 3)).toBe(3);
  });

  it("passes a stocktake correction through unchanged, in both directions", () => {
    // The one case where the direction is genuinely the user's to state.
    expect(signedQuantity("count_correction", 6)).toBe(6);
    expect(signedQuantity("count_correction", -6)).toBe(-6);
  });

  it("assigns a direction to every manual movement type", () => {
    for (const type of MANUAL_MOVEMENT_TYPES) {
      expect(Number.isFinite(signedQuantity(type, 1))).toBe(true);
    }
  });
});

describe("requiresReason", () => {
  it("demands a reason exactly for adjustment, damage and write-off", () => {
    const demanded = MANUAL_MOVEMENT_TYPES.filter((t: ManualMovementType) =>
      requiresReason(t),
    );
    expect([...demanded].sort()).toEqual(["adjustment", "damage", "write_off"]);
  });
});

describe("isHighSeverity", () => {
  it("flags deletions and permission changes", () => {
    expect(isHighSeverity("product.delete")).toBe(true);
    expect(isHighSeverity("media.delete")).toBe(true);
    expect(isHighSeverity("role.manage")).toBe(true);
    expect(isHighSeverity("user.suspend")).toBe(true);
    expect(isHighSeverity("inventory.write_off")).toBe(true);
  });

  it("leaves routine edits unflagged", () => {
    expect(isHighSeverity("product.update")).toBe(false);
    expect(isHighSeverity("media.upload")).toBe(false);
    expect(isHighSeverity("inventory.receipt")).toBe(false);
  });
});

describe("missingAltLocales", () => {
  it("reports a locale with no translation row at all", () => {
    expect(missingAltLocales({ altText: { en: "a tile" } }, ["en", "ar"])).toEqual([
      "ar",
    ]);
  });

  it("treats an empty or whitespace-only string as missing", () => {
    expect(
      missingAltLocales({ altText: { en: "", ar: "   " } }, ["en", "ar"]),
    ).toEqual(["en", "ar"]);
  });

  it("treats an explicit null as missing", () => {
    expect(
      missingAltLocales({ altText: { en: null, ar: "بلاط" } }, ["en", "ar"]),
    ).toEqual(["en"]);
  });

  it("reports nothing when both locales are present", () => {
    expect(
      missingAltLocales({ altText: { en: "a tile", ar: "بلاط" } }, ["en", "ar"]),
    ).toEqual([]);
  });
});

describe("status transition table completeness", () => {
  it("has an entry for every status, referencing only known statuses", () => {
    for (const status of PRODUCT_STATUSES) {
      const targets: readonly ProductStatus[] = STATUS_TRANSITIONS[status];
      expect(targets).toBeDefined();
      for (const target of targets) {
        expect(PRODUCT_STATUSES).toContain(target);
      }
    }
  });
});
