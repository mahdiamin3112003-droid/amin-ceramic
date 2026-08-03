/**
 * Product — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing.
 *
 * Split into `ProductSummary` (grid card — listing, search, similar rails,
 * compare column headers) and `ProductDetail` (extends it with everything
 * the PDP needs). Not one flat type: a listing page rendering 40+ cards
 * should never carry full spec tables, EAV attributes and relation lists
 * across the wire for rows the user never opens.
 */

export type ProductId = string & { readonly __brand: "ProductId" };

export type ProductStatus =
  "draft" | "review" | "published" | "archived" | "discontinued";
export type PriceVisibility = "public" | "trade_only" | "on_request";
export type SlipRating = "R9" | "R10" | "R11" | "R12" | "R13";
export type ShadeVariation = "V1" | "V2" | "V3" | "V4";

/** A lookup-table reference resolved to its locale-specific label — never a bare key past the repository boundary. */
export interface LookupRef {
  readonly key: string;
  readonly label: string;
}

/** §6.6's public/staff-visible stock band — never a raw quantity for anon callers. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "on_order";

export interface ProductAvailability {
  readonly locationId: string;
  readonly locationSlug: string;
  readonly locationName: string;
  readonly status: StockStatus;
  /** Present only when the caller holds inventory.read (§6.3) — staff view. */
  readonly availableM2: number | null;
  readonly restockEta: string | null;
}

/** The "five facts" strip + card-level identity — every field a grid or Spec-mode card needs. */
export interface ProductSummary {
  readonly id: ProductId;
  readonly sku: string;
  readonly locale: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;

  readonly brand: LookupRef;
  readonly collectionSlug: string | null;

  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly nominalFormat: string | null;

  readonly material: LookupRef;
  readonly finish: LookupRef;
  readonly surfaceLook: LookupRef;
  readonly colorFamily: LookupRef;
  readonly colorHex: string | null;

  readonly isRectified: boolean;
  readonly slipRating: SlipRating | null;
  readonly peiClass: number | null;
  readonly isIndoor: boolean;
  readonly isOutdoor: boolean;

  readonly piecesPerBox: number;
  readonly m2PerBox: number;
  readonly kgPerBox: number;

  /** Denormalised current public-tier price (§3.7) — null when not yet priced. */
  readonly basePrice: number | null;
  readonly currency: string;
  readonly priceVisibility: PriceVisibility;

  readonly status: ProductStatus;
  readonly isFeatured: boolean;
  readonly isNew: boolean;
  readonly primaryMediaId: string | null;

  /** Tenant-wide roll-up band (§6.6) — the grid's availability facet, never a raw quantity. */
  readonly stockStatus: StockStatus;
}

export interface ProductMediaItem {
  readonly mediaAssetId: string;
  readonly role:
    | "primary"
    | "gallery"
    | "room_scene"
    | "macro_detail"
    | "installed"
    | "technical_drawing"
    | "packaging"
    | "swatch";
  readonly sortOrder: number;
  readonly altText: string | null;
}

export interface ProductAttributeEntry {
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly value: string;
  readonly unit: string | null;
}

export type ProductRelationType =
  | "related"
  | "trim"
  | "complete_the_look"
  | "same_look_different_format"
  | "same_look_lower_price"
  | "replacement"
  | "variant";

/** Full detail for `/products/[slug]` — extends the summary a card already carries. */
export interface ProductDetail extends ProductSummary {
  readonly description: string | null;
  readonly ean: string | null;
  readonly gtin: string | null;
  readonly waterAbsorptionPct: number | null;
  readonly isFrostResistant: boolean | null;
  readonly shadeVariation: ShadeVariation | null;
  readonly boxesPerPallet: number | null;
  readonly originCountry: string | null;

  readonly applications: readonly LookupRef[];
  readonly media: readonly ProductMediaItem[];
  readonly attributes: readonly ProductAttributeEntry[];
  readonly availability: readonly ProductAvailability[];
}

/** Is this product visible on the public catalogue right now? */
export function isPubliclyVisible(product: ProductSummary): boolean {
  return product.status === "published";
}

/** Whether a single stock lot can plausibly cover an order — the PDP/basket single-lot warning trigger. */
export function needsMultipleLotsWarning(
  requiredM2: number,
  largestLotM2: number | null,
): boolean {
  return largestLotM2 === null || requiredM2 > largestLotM2;
}
