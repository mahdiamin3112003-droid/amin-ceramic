/**
 * Product — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing.
 *
 * Deliberately not the shape of the `product` table (~35 columns) joined
 * with `product_translation`: this carries what a catalog read needs —
 * proportionate to what Phase 1's product-repository actually serves, not
 * an exhaustive mirror of every spec column. Fields the admin/spec views
 * need but the catalog read doesn't (cost, supplier SKU, search boost, …)
 * are added when the phase that needs them lands, per CLAUDE.md's
 * no-speculative-abstraction rule.
 */

export type ProductId = string & { readonly __brand: "ProductId" };

export type ProductStatus =
  "draft" | "review" | "published" | "archived" | "discontinued";
export type PriceVisibility = "public" | "trade_only" | "on_request";

export interface Product {
  readonly id: ProductId;
  readonly sku: string;
  /** Locale-specific — resolved by the repository's translation join. */
  readonly locale: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly description: string | null;

  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly nominalFormat: string | null;

  readonly piecesPerBox: number;
  readonly m2PerBox: number;
  readonly kgPerBox: number;

  /** Denormalised current public-tier price (§3.7) — null when not yet priced. */
  readonly basePrice: number | null;
  readonly currency: string;
  readonly priceVisibility: PriceVisibility;

  readonly status: ProductStatus;
  readonly primaryMediaId: string | null;
}

/** Is this product visible on the public catalogue right now? */
export function isPubliclyVisible(product: Product): boolean {
  return product.status === "published";
}
