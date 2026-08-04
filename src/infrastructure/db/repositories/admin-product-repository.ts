import type { Prisma } from "@prisma/client";

import { mediaUrl } from "@/infrastructure/media/storage";
import type {
  AdminLookup,
  AdminProductDetail,
  AdminProductFilter,
  AdminProductLookups,
  AdminProductPage,
  AdminProductRow,
  ProductStatus,
} from "@/domain/admin/product";

/**
 * Admin product repository — the write side of the catalogue.
 *
 * Distinct from `product-repository.ts`, which serves the storefront. The
 * split is not duplication: the public repository filters to
 * `status: published` and `deletedAt: null` in every query and resolves a
 * single locale, and quietly widening it to serve admin is exactly how a
 * draft product ends up on a public page. These functions see everything;
 * they are only ever reached through `adminQuery`/`adminMutation`, which
 * check a permission first and stamp the staff claims RLS reads.
 *
 * Same contract as the rest of `repositories/`: takes a `tx` from
 * `withRequestContext`, returns domain types, never leaks Prisma types.
 */

const ADMIN_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Prisma `Decimal | null` → `number | null`, at the boundary where it belongs. */
function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listAdminProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: AdminProductFilter,
): Promise<AdminProductPage> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filter.pageSize ?? ADMIN_PAGE_SIZE),
  );

  const where: Prisma.ProductWhereInput = {
    tenantId,
    // Soft-deleted rows stay hidden even here. Restoring one is a separate,
    // deliberate action — not something you stumble into from a list.
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.brandId ? { brandId: filter.brandId } : {}),
    ...(filter.collectionId ? { collectionId: filter.collectionId } : {}),
    ...(filter.query
      ? {
          // Admin search is SKU-and-name only, deliberately narrow: staff
          // arrive knowing what they are looking for. The public
          // `search_vector` path is for discovery, which is a different job.
          OR: [
            { sku: { contains: filter.query, mode: "insensitive" as const } },
            {
              translations: {
                some: {
                  name: { contains: filter.query, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    tx.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sku: true,
        status: true,
        nominalFormat: true,
        basePrice: true,
        currency: true,
        isFeatured: true,
        updatedAt: true,
        brand: { select: { name: true } },
        collection: {
          select: { translations: { select: { locale: true, name: true } } },
        },
        translations: { select: { locale: true, name: true, description: true } },
        media: {
          // "Primary" is a ROLE on product_media, not a boolean — see the
          // note on AdminProductMedia.
          where: { role: "primary", isActive: true },
          take: 1,
          select: { mediaAsset: { select: { publicId: true, secureUrl: true } } },
        },
      },
    }),
    tx.product.count({ where }),
  ]);

  return {
    rows: rows.map((row): AdminProductRow => {
      const en = row.translations.find((t) => t.locale === "en");
      return {
        id: row.id,
        sku: row.sku,
        // The SKU is the fallback rather than "Untitled": a half-created
        // product is still findable by the thing staff actually know.
        name: en?.name ?? row.sku,
        status: row.status,
        brandName: row.brand.name,
        collectionName:
          row.collection?.translations.find((t) => t.locale === "en")?.name ?? null,
        nominalFormat: row.nominalFormat,
        basePrice: toNumber(row.basePrice),
        currency: row.currency,
        isFeatured: row.isFeatured,
        primaryMediaUrl: row.media[0] ? mediaUrl(row.media[0].mediaAsset) : null,
        translatedLocales: row.translations
          .filter(
            (t) => t.name.trim() !== "" && (t.description?.trim() ?? "") !== "",
          )
          .map((t) => t.locale),
        updatedAt: row.updatedAt,
      };
    }),
    total,
    page,
    pageSize,
  };
}

export async function getAdminProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
): Promise<AdminProductDetail | null> {
  const row = await tx.product.findFirst({
    // `tenantId` in the WHERE as well as RLS. Belt and braces on purpose:
    // RLS is the guarantee, this is what makes the intent readable at the
    // call site and survives someone running the query outside a context.
    where: { id, tenantId, deletedAt: null },
    include: {
      translations: true,
      media: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          mediaAsset: {
            select: {
              publicId: true,
              secureUrl: true,
              // Alt text lives on media_translation, not the asset.
              translations: { where: { locale: "en" }, select: { altText: true } },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    sku: row.sku,
    supplierSku: row.supplierSku,
    status: row.status,
    brandId: row.brandId,
    collectionId: row.collectionId,
    categoryId: row.categoryId,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    thicknessMm: row.thicknessMm.toNumber(),
    nominalFormat: row.nominalFormat,
    materialId: row.materialId,
    finishId: row.finishId,
    surfaceLookId: row.surfaceLookId,
    colorFamilyId: row.colorFamilyId,
    colorHex: row.colorHex,
    isRectified: row.isRectified,
    shadeVariation: row.shadeVariation,
    slipRating: row.slipRating,
    peiClass: row.peiClass,
    waterAbsorptionPct: toNumber(row.waterAbsorptionPct),
    isFrostResistant: row.isFrostResistant,
    isIndoor: row.isIndoor,
    isOutdoor: row.isOutdoor,
    piecesPerBox: row.piecesPerBox,
    m2PerBox: row.m2PerBox.toNumber(),
    kgPerBox: row.kgPerBox.toNumber(),
    boxesPerPallet: row.boxesPerPallet,
    originCountry: row.originCountry,
    basePrice: toNumber(row.basePrice),
    currency: row.currency,
    priceVisibility: row.priceVisibility,
    isFeatured: row.isFeatured,
    isNew: row.isNew,
    publishedAt: row.publishedAt,
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      slug: t.slug,
      shortDescription: t.shortDescription,
      description: t.description,
      installationNotes: t.installationNotes,
      careInstructions: t.careInstructions,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      tags: t.tags,
    })),
    media: row.media.map((m) => ({
      mediaAssetId: m.mediaAssetId,
      role: m.role,
      url: mediaUrl(m.mediaAsset),
      altText: m.mediaAsset.translations[0]?.altText ?? null,
      sortOrder: m.sortOrder,
    })),
  };
}

/**
 * Every dropdown the product form needs, in one round trip.
 *
 * Seven sequential `findMany`s would each take their own turn through the
 * connection pool — see the project note on pool contention. `Promise.all`
 * is correct here now that `connection_limit=5` and `maxWait` are tuned.
 */
export async function getAdminProductLookups(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<AdminProductLookups> {
  const translated = { where: { locale: "en" }, select: { name: true } } as const;

  const [
    brands,
    collections,
    categories,
    materials,
    finishes,
    surfaceLooks,
    colorFamilies,
  ] = await Promise.all([
    tx.brand.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    tx.collection.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, translations: translated },
      orderBy: { createdAt: "desc" },
    }),
    // `category` carries no translation table — it is a structural tree
    // keyed by slug (docs/03 §3.3), so the slug IS the label.
    tx.category.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, slug: true },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
    }),
    tx.material.findMany({ select: { id: true, translations: translated } }),
    tx.finish.findMany({ select: { id: true, translations: translated } }),
    tx.surfaceLook.findMany({ select: { id: true, translations: translated } }),
    tx.colorFamily.findMany({ select: { id: true, translations: translated } }),
  ]);

  const label = (row: {
    id: string;
    translations: { name: string }[];
  }): AdminLookup => ({
    id: row.id,
    // An unlabelled option is worse than a wrong one — at least the id is
    // greppable when someone reports "the blank entry in the list".
    label: row.translations[0]?.name ?? row.id,
  });

  return {
    brands: brands.map((b) => ({ id: b.id, label: b.name })),
    collections: collections.map(label),
    categories: categories.map((c) => ({ id: c.id, label: c.slug })),
    materials: materials.map(label),
    finishes: finishes.map(label),
    surfaceLooks: surfaceLooks.map(label),
    colorFamilies: colorFamilies.map(label),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface ProductWriteInput {
  readonly sku: string;
  readonly supplierSku: string | null;
  readonly brandId: string;
  readonly collectionId: string | null;
  readonly categoryId: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly materialId: string;
  readonly finishId: string;
  readonly surfaceLookId: string;
  readonly colorFamilyId: string;
  readonly colorHex: string | null;
  readonly isRectified: boolean;
  readonly shadeVariation: "V1" | "V2" | "V3" | "V4" | null;
  readonly slipRating: "R9" | "R10" | "R11" | "R12" | "R13" | null;
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
  readonly priceVisibility: "public" | "trade_only" | "on_request";
  readonly isFeatured: boolean;
  readonly isNew: boolean;
}

/**
 * `60×120` from 600×1200, and the `60x120` bucket that makes format
 * filtering work.
 *
 * Rounded to the nearest 10mm before bucketing — 598×1198 and 600×1200 are
 * the same tile commercially, and a filter that separates them returns 3
 * results where it should return 412 (docs/03 §3.2).
 */
function deriveFormat(
  widthMm: number,
  heightMm: number,
): {
  nominalFormat: string;
  formatGroup: string;
} {
  const w = Math.round(widthMm / 10);
  const h = Math.round(heightMm / 10);
  return {
    nominalFormat: `${String(w)}×${String(h)}`,
    formatGroup: `${String(w)}x${String(h)}`,
  };
}

export async function createAdminProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  input: ProductWriteInput,
): Promise<{ id: string }> {
  const { nominalFormat, formatGroup } = deriveFormat(
    input.widthMm,
    input.heightMm,
  );

  const created = await tx.product.create({
    data: {
      tenantId,
      ...input,
      nominalFormat,
      formatGroup,
      // Always draft. There is no "create published" path: publishing runs
      // `publishBlockers` first, and a create that skipped it would be the
      // one way to get an unrenderable product onto the storefront.
      status: "draft",
      source: "manual",
      createdBy: actorId,
      updatedBy: actorId,
    },
    select: { id: true },
  });

  return created;
}

export async function updateAdminProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  id: string,
  input: ProductWriteInput,
): Promise<void> {
  const { nominalFormat, formatGroup } = deriveFormat(
    input.widthMm,
    input.heightMm,
  );

  // `updateMany` rather than `update`: it scopes on `tenantId` in the same
  // statement, so a cross-tenant id updates zero rows instead of throwing a
  // Prisma "record not found" that leaks whether the id exists.
  const { count } = await tx.product.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: {
      ...input,
      nominalFormat,
      formatGroup,
      updatedBy: actorId,
      updatedAt: new Date(),
    },
  });

  if (count === 0) throw new Error("product not found");
}

export async function upsertAdminProductTranslation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  translation: {
    locale: string;
    name: string;
    slug: string;
    shortDescription: string | null;
    description: string | null;
    installationNotes: string | null;
    careInstructions: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    tags: string[];
  },
): Promise<void> {
  await tx.productTranslation.upsert({
    where: { productId_locale: { productId, locale: translation.locale } },
    create: { productId, tenantId, ...translation },
    update: translation,
  });
}

export async function setAdminProductStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  id: string,
  status: ProductStatus,
): Promise<void> {
  const { count } = await tx.product.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: {
      status,
      updatedBy: actorId,
      updatedAt: new Date(),
      // Stamped on first publish only. Re-publishing after an unpublish
      // keeps the original date, because "new in" ordering should reflect
      // when customers first saw it, not the last edit.
      ...(status === "published" ? { publishedAt: new Date() } : {}),
      ...(status === "discontinued" ? { discontinuedAt: new Date() } : {}),
    },
  });

  if (count === 0) throw new Error("product not found");
}

/**
 * SOFT delete. `deletedAt` is set; the row stays.
 *
 * A hard delete would cascade into quote request items and inventory
 * movements — historical records that must not change because a product was
 * withdrawn. docs/03 §14 makes this the rule for every catalogue entity.
 */
export async function softDeleteAdminProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  id: string,
): Promise<void> {
  const { count } = await tx.product.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { deletedAt: new Date(), status: "archived", updatedBy: actorId },
  });

  if (count === 0) throw new Error("product not found");
}
