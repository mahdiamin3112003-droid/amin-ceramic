import type { Prisma } from "@prisma/client";

import type {
  Facets,
  FacetOption,
  ColorFacetOption,
  ProductFilter,
  ProductListingPage,
  ProductSort,
  SearchSuggestion,
} from "@/domain/catalog/entity";
import type {
  LookupRef,
  ProductAttributeEntry,
  ProductAvailability,
  ProductDetail,
  ProductId,
  ProductMediaItem,
  ProductRelationType,
  ProductSummary,
  StockStatus,
} from "@/domain/product/entity";

/**
 * Product / catalog repository.
 *
 * docs/03-database-design.md §15.4: repositories return domain types, not
 * Prisma types. Every function here takes a `tx` (from
 * `withRequestContext` — src/infrastructure/db/request-context.ts) rather
 * than the bare `prisma` client: `product` and everything joined to it are
 * tenant-scoped RLS tables, and a query outside the claims-stamped
 * transaction sees nothing (fails closed, not loudly).
 */

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

// ── Shared includes ──────────────────────────────────────────────────────────

function summaryInclude(locale: string) {
  return {
    translations: { where: { locale } },
    brand: true,
    collection: true,
    material: { include: { translations: { where: { locale } } } },
    finish: { include: { translations: { where: { locale } } } },
    surfaceLook: { include: { translations: { where: { locale } } } },
    colorFamily: { include: { translations: { where: { locale } } } },
    productStocks: { where: { locationId: null } },
  } satisfies Prisma.ProductInclude;
}

function detailInclude(locale: string) {
  return {
    ...summaryInclude(locale),
    attributeValues: {
      include: { attribute: { include: { translations: { where: { locale } } } } },
    },
    media: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  } satisfies Prisma.ProductInclude;
}

type SummaryRow = Prisma.ProductGetPayload<{
  include: ReturnType<typeof summaryInclude>;
}>;
type DetailRow = Prisma.ProductGetPayload<{
  include: ReturnType<typeof detailInclude>;
}>;

// ── Mapping ───────────────────────────────────────────────────────────────────

function toLookupRef(row: {
  key: string;
  translations: { name: string }[];
}): LookupRef {
  return { key: row.key, label: row.translations[0]?.name ?? row.key };
}

function toStockStatus(row: SummaryRow): StockStatus {
  return row.productStocks[0]?.stockStatus ?? "out_of_stock";
}

function toSummary(row: SummaryRow, locale: string): ProductSummary | null {
  const translation = row.translations[0];
  if (!translation) return null;

  return {
    id: row.id as ProductId,
    sku: row.sku,
    locale,
    slug: translation.slug,
    name: translation.name,
    shortDescription: translation.shortDescription,
    brand: { key: row.brand.slug, label: row.brand.name },
    collectionSlug: row.collection?.slug ?? null,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    thicknessMm: row.thicknessMm.toNumber(),
    nominalFormat: row.nominalFormat,
    material: toLookupRef(row.material),
    finish: toLookupRef(row.finish),
    surfaceLook: toLookupRef(row.surfaceLook),
    colorFamily: toLookupRef(row.colorFamily),
    colorHex: row.colorHex,
    isRectified: row.isRectified,
    slipRating: row.slipRating,
    peiClass: row.peiClass,
    isIndoor: row.isIndoor,
    isOutdoor: row.isOutdoor,
    piecesPerBox: row.piecesPerBox,
    m2PerBox: row.m2PerBox.toNumber(),
    kgPerBox: row.kgPerBox.toNumber(),
    basePrice: row.basePrice ? row.basePrice.toNumber() : null,
    currency: row.currency,
    priceVisibility: row.priceVisibility,
    status: row.status,
    isFeatured: row.isFeatured,
    isNew: row.isNew,
    primaryMediaId: row.primaryMediaId,
    stockStatus: toStockStatus(row),
  };
}

function toMediaItem(row: DetailRow["media"][number]): ProductMediaItem {
  return {
    mediaAssetId: row.mediaAssetId,
    role: row.role,
    sortOrder: row.sortOrder,
    altText: null,
  };
}

function toAttributeEntry(
  row: DetailRow["attributeValues"][number],
): ProductAttributeEntry | null {
  const translation = row.attribute.translations[0];
  if (!translation) return null;
  const value =
    row.valueText ??
    row.valueNumber?.toString() ??
    (row.valueBoolean === null ? null : row.valueBoolean ? "Yes" : "No");
  if (value === null) return null;

  return {
    key: row.attribute.key,
    label: translation.name,
    group: row.attribute.displayGroup ?? "General",
    value,
    unit: row.attribute.unit,
  };
}

function toDetail(
  row: DetailRow,
  locale: string,
  availability: readonly ProductAvailability[],
): ProductDetail | null {
  const summary = toSummary(row, locale);
  if (!summary) return null;

  return {
    ...summary,
    description: row.translations[0]?.description ?? null,
    ean: row.ean,
    gtin: row.gtin,
    waterAbsorptionPct: row.waterAbsorptionPct?.toNumber() ?? null,
    isFrostResistant: row.isFrostResistant,
    shadeVariation: row.shadeVariation,
    boxesPerPallet: row.boxesPerPallet,
    originCountry: row.originCountry,
    applications: [],
    media: row.media.map(toMediaItem),
    attributes: row.attributeValues
      .map(toAttributeEntry)
      .filter((a): a is ProductAttributeEntry => a !== null),
    availability,
  };
}

// ── Filter → Prisma where ────────────────────────────────────────────────────

function buildWhere(
  tenantId: string,
  filter: ProductFilter,
  matchedIds?: readonly string[],
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    tenantId,
    status: "published",
    deletedAt: null,
  };

  if (filter.categorySlug) where.category = { slug: filter.categorySlug };
  if (filter.collectionSlug) where.collection = { slug: filter.collectionSlug };
  if (filter.brandSlugs?.length)
    where.brand = { slug: { in: [...filter.brandSlugs] } };
  if (filter.materialKeys?.length)
    where.material = { key: { in: [...filter.materialKeys] } };
  if (filter.finishKeys?.length)
    where.finish = { key: { in: [...filter.finishKeys] } };
  if (filter.surfaceLookKeys?.length)
    where.surfaceLook = { key: { in: [...filter.surfaceLookKeys] } };
  if (filter.colorFamilyKeys?.length)
    where.colorFamily = { key: { in: [...filter.colorFamilyKeys] } };
  if (filter.formatGroups?.length)
    where.formatGroup = { in: [...filter.formatGroups] };
  if (filter.isIndoor !== undefined) where.isIndoor = filter.isIndoor;
  if (filter.isOutdoor !== undefined) where.isOutdoor = filter.isOutdoor;
  if (filter.slipRatings?.length)
    where.slipRating = { in: [...filter.slipRatings] as never[] };
  if (filter.peiClassMin !== undefined)
    where.peiClass = { gte: filter.peiClassMin };
  if (filter.isRectified !== undefined) where.isRectified = filter.isRectified;
  if (filter.widthMmRange)
    where.widthMm = { gte: filter.widthMmRange[0], lte: filter.widthMmRange[1] };
  if (filter.priceRange)
    where.basePrice = { gte: filter.priceRange[0], lte: filter.priceRange[1] };
  if (filter.availableOnly) {
    where.productStocks = {
      some: { locationId: null, stockStatus: { in: ["in_stock", "low_stock"] } },
    };
  }
  if (filter.query) {
    // search_vector is an Unsupported() Prisma type (excluded from the
    // generated client entirely, so it cannot appear in a typed `where`) —
    // matching ids are resolved separately via raw SQL and passed in here.
    where.id = { in: [...(matchedIds ?? [])] };
  }

  return where;
}

/** Resolves free-text search against product_translation.search_vector (full-text) — the Unsupported() column no typed Prisma query can reach. */
async function matchingProductIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  query: string,
): Promise<readonly string[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];

  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT p.id
    FROM product p
    JOIN product_translation pt ON pt.product_id = p.id AND pt.locale = ${locale}
    WHERE p.tenant_id = ${tenantId}::uuid
      AND pt.search_vector @@ to_tsquery(${locale === "ar" ? "arabic" : "english"}::regconfig, ${tsQuery})
  `;
  return rows.map((row) => row.id);
}

/** Sanitises free text into a tsquery-safe prefix expression — `foo bar` → `foo:* & bar:*`. */
function toTsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.replace(/[&|!():*]/g, "")}:*`)
    .join(" & ");
}

function toOrderBy(
  sort: ProductSort | undefined,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ basePrice: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ basePrice: "desc" }, { id: "asc" }];
    case "newest":
      return [{ publishedAt: "desc" }, { id: "asc" }];
    case "name_asc":
      return [{ sku: "asc" }, { id: "asc" }];
    default:
      return [{ searchBoost: "desc" }, { id: "asc" }];
  }
}

// ── Listing + facets ─────────────────────────────────────────────────────────

export async function listProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  filter: ProductFilter,
): Promise<ProductListingPage> {
  const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const matchedIds = filter.query
    ? await matchingProductIds(tx, tenantId, locale, filter.query)
    : undefined;
  const where = buildWhere(tenantId, filter, matchedIds);

  const [rows, totalCount, facets] = await Promise.all([
    tx.product.findMany({
      where,
      include: summaryInclude(locale),
      orderBy: toOrderBy(filter.sort),
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    }),
    tx.product.count({ where }),
    computeFacets(tx, tenantId, locale, filter, matchedIds),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows
    .map((row) => toSummary(row, locale))
    .filter((p): p is ProductSummary => p !== null);

  return {
    items,
    nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null,
    totalCount,
    facets,
  };
}

/**
 * Facet counts, one groupBy per dimension, each applying every ACTIVE
 * filter EXCEPT that dimension's own — the standard multi-select-facet
 * semantics (docs/04-api-architecture.md §6.1: "counts computed in the same
 * query... including zero-count options"). Small catalog today; each query
 * hits the `(tenant_id, ...)` indexes the listing query itself uses.
 */
async function computeFacets(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  filter: ProductFilter,
  matchedIds: readonly string[] | undefined,
): Promise<Facets> {
  const omit = (key: keyof ProductFilter): ProductFilter => ({
    ...filter,
    [key]: undefined,
  });
  const whereOmitting = (key: keyof ProductFilter) =>
    buildWhere(tenantId, omit(key), matchedIds);

  const [
    brands,
    materials,
    finishes,
    surfaceLooks,
    colorFamilies,
    formatGroups,
    slipRatings,
    availability,
    materialDefs,
    finishDefs,
    surfaceLookDefs,
    colorFamilyDefs,
    priceAggregate,
  ] = await Promise.all([
    tx.product.groupBy({
      by: ["brandId"],
      where: whereOmitting("brandSlugs"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["materialId"],
      where: whereOmitting("materialKeys"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["finishId"],
      where: whereOmitting("finishKeys"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["surfaceLookId"],
      where: whereOmitting("surfaceLookKeys"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["colorFamilyId"],
      where: whereOmitting("colorFamilyKeys"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["formatGroup"],
      where: whereOmitting("formatGroups"),
      _count: true,
    }),
    tx.product.groupBy({
      by: ["slipRating"],
      where: whereOmitting("slipRatings"),
      _count: true,
    }),
    tx.productStock.groupBy({
      by: ["stockStatus"],
      where: {
        tenantId,
        locationId: null,
        product: whereOmitting("availableOnly"),
      },
      _count: true,
    }),
    tx.material.findMany({
      where: { tenantId },
      include: { translations: { where: { locale } } },
    }),
    tx.finish.findMany({
      where: { tenantId },
      include: { translations: { where: { locale } } },
    }),
    tx.surfaceLook.findMany({
      where: { tenantId },
      include: { translations: { where: { locale } } },
    }),
    tx.colorFamily.findMany({
      where: { tenantId },
      include: { translations: { where: { locale } } },
    }),
    tx.product.aggregate({
      where: { ...whereOmitting("priceRange"), basePrice: { not: null } },
      _min: { basePrice: true },
      _max: { basePrice: true },
    }),
  ]);

  const brandDefs = await tx.brand.findMany({ where: { tenantId } });

  const brandCounts = new Map(brands.map((b) => [b.brandId, b._count]));
  const materialCounts = new Map(materials.map((m) => [m.materialId, m._count]));
  const finishCounts = new Map(finishes.map((f) => [f.finishId, f._count]));
  const surfaceLookCounts = new Map(
    surfaceLooks.map((s) => [s.surfaceLookId, s._count]),
  );
  const colorFamilyCounts = new Map(
    colorFamilies.map((c) => [c.colorFamilyId, c._count]),
  );
  const formatGroupCounts = new Map(
    formatGroups.map((f) => [f.formatGroup, f._count]),
  );
  const slipRatingCounts = new Map(
    slipRatings.map((s) => [s.slipRating, s._count]),
  );
  const availabilityCounts = new Map(
    availability.map((a) => [a.stockStatus, a._count]),
  );

  return {
    brand: brandDefs.map((b) => ({
      value: b.slug,
      label: b.name,
      count: brandCounts.get(b.id) ?? 0,
    })),
    collection: [],
    material: materialDefs.map((m) => toFacetOption(m, materialCounts)),
    finish: finishDefs.map((f) => toFacetOption(f, finishCounts)),
    surfaceLook: surfaceLookDefs.map((s) => toFacetOption(s, surfaceLookCounts)),
    colorFamily: colorFamilyDefs.map((c): ColorFacetOption => ({
      value: c.key,
      label: c.translations[0]?.name ?? c.key,
      count: colorFamilyCounts.get(c.id) ?? 0,
      // Fallback for a color_family row with no hex set — the brand's own
      // stone-300 token (docs/adr/0001), not an arbitrary literal.
      // eslint-disable-next-line amin/no-raw-color -- data fallback, not a UI style literal; value is the documented stone-300 token
      colorHex: c.colorHex ?? "#D8DCE3",
    })),
    application: [],
    formatGroup: [...formatGroupCounts.entries()]
      .filter((entry): entry is [string, number] => entry[0] !== null)
      .map(([value, count]) => ({ value, label: value, count })),
    slipRating: [...slipRatingCounts.entries()]
      .filter(
        (entry): entry is [NonNullable<(typeof entry)[0]>, number] =>
          entry[0] !== null,
      )
      .map(([value, count]) => ({ value, label: value, count })),
    availability: (
      ["in_stock", "low_stock", "out_of_stock", "on_order"] as const
    ).map((status) => ({
      value: status,
      label: status,
      count: availabilityCounts.get(status) ?? 0,
    })),
    priceBounds:
      priceAggregate._min.basePrice !== null &&
      priceAggregate._max.basePrice !== null
        ? {
            min: priceAggregate._min.basePrice.toNumber(),
            max: priceAggregate._max.basePrice.toNumber(),
          }
        : null,
  };
}

function toFacetOption(
  row: { id: string; key: string; translations: { name: string }[] },
  counts: Map<string, number>,
): FacetOption {
  return {
    value: row.key,
    label: row.translations[0]?.name ?? row.key,
    count: counts.get(row.id) ?? 0,
  };
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getProductDetailBySlug(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  slug: string,
): Promise<ProductDetail | null> {
  const row = await tx.product.findFirst({
    where: {
      tenantId,
      status: "published",
      deletedAt: null,
      translations: { some: { slug, locale } },
    },
    include: detailInclude(locale),
  });
  if (!row) return null;

  const availability = await getAvailability(tx, tenantId, row.id as ProductId);
  return toDetail(row, locale, availability);
}

export async function getProductDetailById(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  id: ProductId,
): Promise<ProductDetail | null> {
  const row = await tx.product.findFirst({
    where: { tenantId, id, deletedAt: null },
    include: detailInclude(locale),
  });
  if (!row) return null;

  const availability = await getAvailability(tx, tenantId, row.id as ProductId);
  return toDetail(row, locale, availability);
}

/**
 * Per-location availability (§6.3). Callers without `inventory.read` get the
 * public stock band only — this repository always returns the fuller shape
 * (`availableM2`) when the RLS-constrained transaction can see it, and NULL
 * otherwise. `stock_lot` itself is staff-only, so the query never touches
 * it here — only the public-facing `product_stock` roll-up.
 */
async function getAvailability(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: ProductId,
): Promise<readonly ProductAvailability[]> {
  const rows = await tx.productStock.findMany({
    where: { tenantId, productId, locationId: { not: null } },
    include: { location: true },
  });

  return rows
    .filter(
      (
        row,
      ): row is typeof row & { location: NonNullable<(typeof row)["location"]> } =>
        row.location !== null,
    )
    .map((row) => ({
      locationId: row.location.id,
      locationSlug: row.location.slug,
      locationName: row.location.name,
      status: row.stockStatus,
      availableM2: row.availableM2.toNumber(),
      restockEta: row.restockEta ? row.restockEta.toISOString().slice(0, 10) : null,
    }));
}

// ── Similar / relations ──────────────────────────────────────────────────────

export async function getSimilarProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  productId: ProductId,
  type: ProductRelationType | undefined,
  limit: number,
): Promise<readonly ProductSummary[]> {
  const rows = await tx.productRelation.findMany({
    where: { productId, ...(type ? { relationType: type } : {}) },
    orderBy: [{ isAutomatic: "asc" }, { rank: "asc" }],
    take: limit,
    include: { relatedProduct: { include: summaryInclude(locale) } },
  });

  return rows
    .filter(
      (row) =>
        row.relatedProduct.tenantId === tenantId &&
        row.relatedProduct.status === "published",
    )
    .map((row) => toSummary(row.relatedProduct, locale))
    .filter((p): p is ProductSummary => p !== null);
}

/** Batched lookup by id, order preserved — the wishlist page's data source. */
export async function getProductSummariesByIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  ids: readonly string[],
): Promise<readonly ProductSummary[]> {
  if (ids.length === 0) return [];

  const rows = await tx.product.findMany({
    where: { tenantId, id: { in: [...ids] }, status: "published", deletedAt: null },
    include: summaryInclude(locale),
  });

  const bySummary = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => bySummary.get(id))
    .filter((row): row is (typeof rows)[number] => row !== undefined)
    .map((row) => toSummary(row, locale))
    .filter((p): p is ProductSummary => p !== null);
}

/** docs/02-ux-blueprint.md §3.3 item 12: "From the same collection". */
export async function getSameCollectionProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  collectionSlug: string,
  excludeProductId: ProductId,
  limit: number,
): Promise<readonly ProductSummary[]> {
  const rows = await tx.product.findMany({
    where: {
      tenantId,
      status: "published",
      deletedAt: null,
      collection: { slug: collectionSlug },
      id: { not: excludeProductId },
    },
    include: summaryInclude(locale),
    orderBy: { searchBoost: "desc" },
    take: limit,
  });

  return rows
    .map((row) => toSummary(row, locale))
    .filter((p): p is ProductSummary => p !== null);
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Typeahead — docs/04-api-architecture.md §7.1: pg_trgm prefix match on SKU
 * fused with full-text prefix on the locale's search_vector. `<2` chars is
 * rejected by the validation boundary before this is ever called.
 */
export async function searchSuggestions(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  query: string,
  limit: number,
): Promise<readonly SearchSuggestion[]> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      sku: string;
      slug: string;
      name: string;
      primary_media_id: string | null;
    }[]
  >`
    SELECT p.id, p.sku, pt.slug, pt.name, p.primary_media_id
    FROM product p
    JOIN product_translation pt ON pt.product_id = p.id AND pt.locale = ${locale}
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      AND (p.sku ILIKE ${query + "%"} OR pt.search_vector @@ to_tsquery(${locale === "ar" ? "arabic" : "english"}::regconfig, ${toTsQuery(query)}))
    ORDER BY (p.sku ILIKE ${query + "%"}) DESC, p.search_boost DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    productId: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    thumbnailMediaId: row.primary_media_id,
  }));
}

/** Full search results page — reuses the listing facet contract (§7.2) so the UI shares one results component. */
export async function searchProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  filter: ProductFilter,
): Promise<ProductListingPage> {
  return listProducts(tx, tenantId, locale, filter);
}
