import type { ProductFilter } from "@/domain/catalog/entity";
import type { ProductFilterQuery } from "@/lib/validation/catalog";

/**
 * Querystring → domain filter.
 *
 * Shared between the `/api/v1/products` route and the `/products` Server
 * Component page (task #35) so both build the exact same `ProductFilter`
 * from the exact same querystring shape — the wireframe's "URL-encoded
 * filter state" requirement (docs/02-ux-blueprint.md §3.2) only holds if
 * every reader of that URL agrees on what it means.
 */
export function toProductFilter(query: ProductFilterQuery): ProductFilter {
  return {
    categorySlug: query.category,
    collectionSlug: query.collection,
    brandSlugs: query.brand,
    materialKeys: query.material,
    finishKeys: query.finish,
    surfaceLookKeys: query.look,
    colorFamilyKeys: query.color,
    applicationKeys: query.application,
    formatGroups: query.format,
    widthMmRange:
      query.widthMin !== undefined && query.widthMax !== undefined
        ? [query.widthMin, query.widthMax]
        : undefined,
    thicknessMmRange:
      query.thicknessMin !== undefined && query.thicknessMax !== undefined
        ? [query.thicknessMin, query.thicknessMax]
        : undefined,
    isIndoor: query.indoor,
    isOutdoor: query.outdoor,
    slipRatings: query.slip,
    peiClassMin: query.peiMin,
    isRectified: query.rectified,
    priceRange: query.priceRange,
    availableOnly: query.availability,
    query: query.q,
    sort: query.sort,
    cursor: query.cursor,
    limit: query.limit,
  };
}
