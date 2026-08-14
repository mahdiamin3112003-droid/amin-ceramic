import type { ProductSummary } from "@/domain/product/entity";

/**
 * Catalog listing — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing outside
 * domain/ (ProductSummary is the one exception — same layer).
 *
 * docs/04-api-architecture.md §6.1: facet counts are computed server-side in
 * the same query as the listing (not derived client-side), and zero-count
 * options are disabled, not hidden (docs/02-ux-blueprint.md §3.2) — so the
 * shape below always carries every known option for a dimension, count
 * included, even when that count is zero.
 */

export interface FacetOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface ColorFacetOption extends FacetOption {
  readonly colorHex: string;
}

/** Min/max published price across the current (non-price) filter — the price-range slider's bounds. Null when nothing matches. */
export interface PriceBounds {
  readonly min: number;
  readonly max: number;
}

export interface Facets {
  readonly brand: readonly FacetOption[];
  readonly collection: readonly FacetOption[];
  readonly material: readonly FacetOption[];
  readonly finish: readonly FacetOption[];
  readonly surfaceLook: readonly FacetOption[];
  readonly colorFamily: readonly ColorFacetOption[];
  readonly application: readonly FacetOption[];
  readonly formatGroup: readonly FacetOption[];
  readonly slipRating: readonly FacetOption[];
  readonly availability: readonly FacetOption[];
  readonly priceBounds: PriceBounds | null;
}

export type ProductSort =
  "relevance" | "price_asc" | "price_desc" | "newest" | "name_asc";

/** Every facet dimension a listing/search query can filter on — mirrors docs/04 §6.1's querystring. */
export interface ProductFilter {
  readonly categorySlug?: string;
  readonly collectionSlug?: string;
  readonly brandSlugs?: readonly string[];
  readonly materialKeys?: readonly string[];
  readonly finishKeys?: readonly string[];
  readonly surfaceLookKeys?: readonly string[];
  readonly colorFamilyKeys?: readonly string[];
  readonly applicationKeys?: readonly string[];
  readonly formatGroups?: readonly string[];
  readonly widthMmRange?: readonly [number, number];
  readonly thicknessMmRange?: readonly [number, number];
  readonly isIndoor?: boolean;
  readonly isOutdoor?: boolean;
  readonly slipRatings?: readonly string[];
  readonly peiClassMin?: number;
  readonly isRectified?: boolean;
  readonly priceRange?: readonly [number, number];
  readonly availableOnly?: boolean;
  readonly query?: string;
  readonly sort?: ProductSort;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ProductListingPage {
  readonly items: readonly ProductSummary[];
  readonly nextCursor: string | null;
  readonly totalCount: number;
  readonly facets: Facets;
}

/** A manufacturer's product family ("Calacatta Series") — docs/03-database-design.md §3.2. */
export interface Collection {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly heroMediaId: string | null;
  /** Resolved by the repository (infrastructure owns Storage URL shape); null when no hero is set. */
  readonly heroImageUrl: string | null;
  readonly isFeatured: boolean;
}

export interface SearchSuggestion {
  readonly productId: string;
  readonly sku: string;
  readonly slug: string;
  readonly name: string;
  readonly thumbnailMediaId: string | null;
}

/** Was this a query with nothing behind it? Feeds the zero-result report (§10.3) and the "no matches" UI state. */
export function isZeroResult(page: ProductListingPage): boolean {
  return page.totalCount === 0;
}
