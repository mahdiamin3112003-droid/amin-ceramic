/**
 * Collections and brands — the two members of docs/04 §14.1's family that
 * are not keyed lookups.
 *
 * A collection is a merchandising object, not a vocabulary term: it has a
 * slug, a hero image, a publishing state and an ordered set of products.
 * That is why it does not share `domain/admin/taxonomy.ts` — the shared
 * contract in §14.1 covers list/activate/reorder, and everything below is
 * the part collections do not share.
 *
 * `domain/` imports nothing (ADR-0003).
 */

import type { ProductStatus } from "@/domain/admin/product";

export interface CollectionTranslation {
  readonly locale: string;
  readonly name: string;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

export interface CollectionRow {
  readonly id: string;
  readonly slug: string;
  readonly brandId: string | null;
  readonly brandName: string | null;
  readonly heroMediaId: string | null;
  readonly heroUrl: string | null;
  readonly status: ProductStatus;
  readonly isFeatured: boolean;
  readonly sortOrder: number;
  readonly publishedAt: Date | null;
  readonly translations: readonly CollectionTranslation[];
  readonly productCount: number;
}

export interface BrandRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly originCountry: string | null;
  readonly websiteUrl: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly productCount: number;
  readonly collectionCount: number;
}

/**
 * What stops a collection going live.
 *
 * Deliberately stricter than a product's: a collection page with no
 * products is a dead end a customer can reach from navigation, which is
 * worse than a product that merely lacks a description. The hero image is
 * required for the same reason — a collection IS its imagery.
 */
export function collectionPublishBlockers(
  collection: Pick<CollectionRow, "translations" | "heroMediaId" | "productCount">,
  requiredLocales: readonly string[],
): readonly string[] {
  const blockers: string[] = [];

  for (const locale of requiredLocales) {
    const translation = collection.translations.find((t) => t.locale === locale);
    if (!translation || translation.name.trim() === "") {
      blockers.push(`Missing ${locale.toUpperCase()} name`);
    }
  }

  if (collection.heroMediaId === null) blockers.push("No hero image");

  if (collection.productCount === 0) {
    blockers.push(
      "No products — a published collection with nothing in it is a dead end",
    );
  }

  return blockers;
}

/**
 * Brands are deactivated, never deleted, and not while products point at
 * them — the same rule as the taxonomy family (§14.1), for the same reason:
 * hiding a brand would blank a spec row on every product carrying it.
 */
export function brandDeactivationBlockedReason(
  brand: Pick<BrandRow, "productCount" | "collectionCount">,
): string | null {
  if (brand.productCount > 0) {
    const n = brand.productCount;
    return `${String(n)} product${n === 1 ? "" : "s"} still carry this brand`;
  }
  if (brand.collectionCount > 0) {
    const n = brand.collectionCount;
    return `${String(n)} collection${n === 1 ? "" : "s"} still belong to this brand`;
  }
  return null;
}
