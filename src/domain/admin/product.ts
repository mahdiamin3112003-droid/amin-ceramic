/**
 * Admin-side product types.
 *
 * Separate from `domain/product/entity.ts` because the two views genuinely
 * differ, not for tidiness. The public `ProductSummary` is
 * locale-resolved, published-only and price-visibility-aware; the admin row
 * shows drafts and archives, both locales' completeness, and the workflow
 * state — none of which a storefront should ever see.
 *
 * `domain/` imports nothing (CLAUDE.md, ADR-0003), so these are plain
 * structural types with no Prisma or Zod anywhere near them.
 */

export type ProductStatus =
  "draft" | "review" | "published" | "archived" | "discontinued";

export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "draft",
  "review",
  "published",
  "archived",
  "discontinued",
];

export type PriceVisibility = "public" | "trade_only" | "on_request";
export type ShadeVariation = "V1" | "V2" | "V3" | "V4";
export type SlipRating = "R9" | "R10" | "R11" | "R12" | "R13";

/** One row in the admin product table. */
export interface AdminProductRow {
  readonly id: string;
  readonly sku: string;
  /** English name; falls back to the SKU when the translation is missing. */
  readonly name: string;
  readonly status: ProductStatus;
  readonly brandName: string | null;
  readonly collectionName: string | null;
  readonly nominalFormat: string | null;
  readonly basePrice: number | null;
  readonly currency: string;
  readonly isFeatured: boolean;
  readonly primaryMediaUrl: string | null;
  /** Locales with a complete-enough translation to publish. */
  readonly translatedLocales: readonly string[];
  readonly updatedAt: Date;
}

export interface AdminProductPage {
  readonly rows: readonly AdminProductRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminProductFilter {
  readonly query?: string;
  readonly status?: ProductStatus;
  readonly brandId?: string;
  readonly collectionId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** Everything the edit form needs, across all its tabs. */
export interface AdminProductDetail {
  readonly id: string;
  readonly sku: string;
  readonly supplierSku: string | null;
  readonly status: ProductStatus;

  readonly brandId: string;
  readonly collectionId: string | null;
  readonly categoryId: string;

  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly nominalFormat: string | null;

  readonly materialId: string;
  readonly finishId: string;
  readonly surfaceLookId: string;
  readonly colorFamilyId: string;
  readonly colorHex: string | null;

  readonly isRectified: boolean;
  readonly shadeVariation: ShadeVariation | null;
  readonly slipRating: SlipRating | null;
  readonly peiClass: number | null;
  readonly waterAbsorptionPct: number | null;
  readonly isFrostResistant: boolean | null;
  readonly isIndoor: boolean;
  readonly isOutdoor: boolean;

  readonly piecesPerBox: number;
  readonly m2PerBox: number;
  readonly kgPerBox: number;
  readonly boxesPerPallet: number | null;

  readonly originCountry: string | null;
  readonly basePrice: number | null;
  readonly currency: string;
  readonly priceVisibility: PriceVisibility;

  readonly isFeatured: boolean;
  readonly isNew: boolean;
  readonly publishedAt: Date | null;

  readonly translations: readonly AdminProductTranslation[];
  readonly media: readonly AdminProductMedia[];
}

export interface AdminProductTranslation {
  readonly locale: string;
  readonly name: string;
  readonly slug: string;
  readonly shortDescription: string | null;
  readonly description: string | null;
  readonly installationNotes: string | null;
  readonly careInstructions: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly tags: readonly string[];
}

export type ProductMediaRole =
  | "primary"
  | "gallery"
  | "room_scene"
  | "macro_detail"
  | "installed"
  | "technical_drawing"
  | "packaging"
  | "swatch";

/**
 * `product_media` has no surrogate key — its identity is
 * `(productId, mediaAssetId, role)`, and "primary" is a role rather than a
 * boolean flag. That is why this carries `role` instead of `isPrimary`: a
 * tile can be the primary image and also appear as a macro detail, which a
 * boolean cannot express.
 */
export interface AdminProductMedia {
  readonly mediaAssetId: string;
  readonly role: ProductMediaRole;
  readonly url: string;
  readonly altText: string | null;
  readonly sortOrder: number;
}

/** A selectable reference — brands, collections, materials, finishes… */
export interface AdminLookup {
  readonly id: string;
  readonly label: string;
}

/** Every dropdown the product form needs, fetched in one pass. */
export interface AdminProductLookups {
  readonly brands: readonly AdminLookup[];
  readonly collections: readonly AdminLookup[];
  readonly categories: readonly AdminLookup[];
  readonly materials: readonly AdminLookup[];
  readonly finishes: readonly AdminLookup[];
  readonly surfaceLooks: readonly AdminLookup[];
  readonly colorFamilies: readonly AdminLookup[];
}

/**
 * Which statuses a product may move to from where.
 *
 * Encoded as data rather than scattered `if`s so the UI can render only the
 * legal transitions and the use-case can reject the rest from the same
 * source. `discontinued` is terminal for a reason: a product that came back
 * is a new SKU commercially, and reviving the old row loses that.
 */
export const STATUS_TRANSITIONS: Readonly<
  Record<ProductStatus, readonly ProductStatus[]>
> = {
  draft: ["review", "published", "archived"],
  review: ["draft", "published", "archived"],
  published: ["draft", "archived", "discontinued"],
  archived: ["draft", "published"],
  discontinued: [],
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * A product may not be published without the fields a storefront page
 * needs to render. Returns the missing ones so the UI can say what is
 * wrong rather than just refusing.
 */
export function publishBlockers(
  product: Pick<
    AdminProductDetail,
    "translations" | "media" | "basePrice" | "priceVisibility"
  >,
  requiredLocales: readonly string[],
): readonly string[] {
  const blockers: string[] = [];

  for (const locale of requiredLocales) {
    const translation = product.translations.find((t) => t.locale === locale);
    if (!translation || translation.name.trim() === "") {
      blockers.push(`Missing ${locale.toUpperCase()} name`);
    }
    if (!translation || translation.slug.trim() === "") {
      blockers.push(`Missing ${locale.toUpperCase()} slug`);
    }
    if (!translation?.description?.trim()) {
      blockers.push(`Missing ${locale.toUpperCase()} description`);
    }
  }

  if (product.media.length === 0) {
    blockers.push("No images");
  }

  // `on_request` and `trade_only` products legitimately have no public
  // price, so only the public tier requires one.
  if (product.priceVisibility === "public" && product.basePrice === null) {
    blockers.push("No price");
  }

  return blockers;
}
