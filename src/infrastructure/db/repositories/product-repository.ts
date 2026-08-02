import type { Product as PrismaProduct, ProductTranslation } from "@prisma/client";

import type { Product, ProductId } from "@/domain/product/entity";
import { prisma } from "@/infrastructure/db/client";

/**
 * Product repository.
 *
 * docs/03-database-design.md §15.4: repositories return domain types, not
 * Prisma types. This is the boundary where the product/product_translation
 * join collapses into the locale-aware `Product` the application reads.
 */

type ProductWithTranslation = PrismaProduct & {
  translations: ProductTranslation[];
};

function toDomain(row: ProductWithTranslation, locale: string): Product | null {
  const translation = row.translations[0];
  if (!translation) {
    return null;
  }
  return {
    id: row.id as ProductId,
    sku: row.sku,
    locale,
    slug: translation.slug,
    name: translation.name,
    shortDescription: translation.shortDescription,
    description: translation.description,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    thicknessMm: row.thicknessMm.toNumber(),
    nominalFormat: row.nominalFormat,
    piecesPerBox: row.piecesPerBox,
    m2PerBox: row.m2PerBox.toNumber(),
    kgPerBox: row.kgPerBox.toNumber(),
    basePrice: row.basePrice ? row.basePrice.toNumber() : null,
    currency: row.currency,
    priceVisibility: row.priceVisibility,
    status: row.status,
    primaryMediaId: row.primaryMediaId,
  };
}

/**
 * Find a published product by its locale-specific slug.
 *
 * Locale-aware: the slug is unique per (tenant, locale), so the same product
 * can have a different slug per language (§3.3).
 */
export async function findProductBySlug(
  slug: string,
  locale: string,
): Promise<Product | null> {
  const row = await prisma.product.findFirst({
    where: {
      status: "published",
      deletedAt: null,
      translations: { some: { slug, locale } },
    },
    include: {
      translations: { where: { locale } },
    },
  });
  return row ? toDomain(row, locale) : null;
}

export async function findProductById(
  id: ProductId,
  locale: string,
): Promise<Product | null> {
  const row = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      translations: { where: { locale } },
    },
  });
  return row ? toDomain(row, locale) : null;
}
