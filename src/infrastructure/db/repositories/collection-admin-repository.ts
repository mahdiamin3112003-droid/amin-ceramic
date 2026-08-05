import type { Prisma } from "@prisma/client";

import type { BrandRow, CollectionRow } from "@/domain/admin/collection";
import { mediaUrl } from "@/infrastructure/media/storage";

/**
 * Collections and brands, admin side.
 *
 * Distinct from `collection-repository.ts`, which serves the storefront and
 * filters to published rows in every query. Widening that one to serve
 * admin is how a draft collection ends up in the public navigation.
 */

export async function listCollectionsForAdmin(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<CollectionRow[]> {
  const rows = await tx.collection.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      brandId: true,
      heroMediaId: true,
      status: true,
      isFeatured: true,
      sortOrder: true,
      publishedAt: true,
      brand: { select: { name: true } },
      translations: {
        select: {
          locale: true,
          name: true,
          description: true,
          seoTitle: true,
          seoDescription: true,
        },
      },
      _count: { select: { products: true } },
    },
  });

  // The hero is a `media_asset` id with no relation declared on Collection,
  // so it is resolved in one extra query rather than N joins.
  const heroIds = rows
    .map((r) => r.heroMediaId)
    .filter((id): id is string => id !== null);
  const heroes =
    heroIds.length > 0
      ? await tx.mediaAsset.findMany({
          where: { id: { in: heroIds }, tenantId },
          select: { id: true, publicId: true, secureUrl: true },
        })
      : [];
  const heroById = new Map(heroes.map((h) => [h.id, mediaUrl(h)]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    brandId: row.brandId,
    brandName: row.brand?.name ?? null,
    heroMediaId: row.heroMediaId,
    heroUrl:
      row.heroMediaId === null ? null : (heroById.get(row.heroMediaId) ?? null),
    status: row.status,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
    translations: row.translations,
    productCount: row._count.products,
  }));
}

export async function findCollectionBySlug(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slug: string,
): Promise<{ id: string } | null> {
  return tx.collection.findFirst({
    where: { tenantId, slug, deletedAt: null },
    select: { id: true },
  });
}

export interface CollectionWriteInput {
  readonly slug: string;
  readonly brandId: string | null;
  readonly heroMediaId: string | null;
  readonly isFeatured: boolean;
  readonly translations: readonly {
    locale: string;
    name: string;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }[];
}

export async function createCollection(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: CollectionWriteInput,
): Promise<{ id: string }> {
  const created = await tx.collection.create({
    data: {
      tenantId,
      slug: input.slug,
      brandId: input.brandId,
      heroMediaId: input.heroMediaId,
      isFeatured: input.isFeatured,
      // Always draft. Publishing runs `collectionPublishBlockers` first, and
      // a create that skipped it is the one way to get an empty collection
      // into the public navigation.
      status: "draft",
      translations: { create: [...input.translations] },
    },
    select: { id: true },
  });
  return created;
}

export async function updateCollection(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: CollectionWriteInput,
): Promise<void> {
  const { count } = await tx.collection.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: {
      slug: input.slug,
      brandId: input.brandId,
      heroMediaId: input.heroMediaId,
      isFeatured: input.isFeatured,
      updatedAt: new Date(),
    },
  });
  if (count === 0) throw new Error("collection not found");

  for (const translation of input.translations) {
    await tx.collectionTranslation.upsert({
      where: {
        collectionId_locale: { collectionId: id, locale: translation.locale },
      },
      create: { collectionId: id, ...translation },
      update: {
        name: translation.name,
        description: translation.description,
        seoTitle: translation.seoTitle,
        seoDescription: translation.seoDescription,
      },
    });
  }
}

export async function setCollectionStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  status: "draft" | "published" | "archived",
): Promise<void> {
  const { count } = await tx.collection.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: {
      status,
      updatedAt: new Date(),
      // Stamped on first publish only — "new in" ordering should reflect
      // when customers first saw it, not the last edit.
      ...(status === "published" ? { publishedAt: new Date() } : {}),
    },
  });
  if (count === 0) throw new Error("collection not found");
}

/**
 * SOFT delete, like every other catalogue entity (docs/03 §14).
 *
 * Products keep their `collection_id` — the FK is `onDelete: SetNull` for a
 * hard delete, but soft-deleting leaves the pointer intact so restoring the
 * collection restores its membership.
 */
export async function softDeleteCollection(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
): Promise<void> {
  const { count } = await tx.collection.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { deletedAt: new Date(), status: "archived" },
  });
  if (count === 0) throw new Error("collection not found");
}

// ── Brands ───────────────────────────────────────────────────────────────────

export async function listBrandsForAdmin(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<BrandRow[]> {
  const rows = await tx.brand.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      originCountry: true,
      websiteUrl: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { products: true, collections: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    originCountry: row.originCountry,
    websiteUrl: row.websiteUrl,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    productCount: row._count.products,
    collectionCount: row._count.collections,
  }));
}

export async function createBrand(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: {
    slug: string;
    name: string;
    originCountry: string | null;
    websiteUrl: string | null;
  },
): Promise<{ id: string }> {
  return tx.brand.create({
    data: { tenantId, ...input, isActive: true },
    select: { id: true },
  });
}

export async function updateBrand(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: {
    name: string;
    originCountry: string | null;
    websiteUrl: string | null;
  },
): Promise<void> {
  const { count } = await tx.brand.updateMany({
    where: { id, tenantId, deletedAt: null },
    // The slug is absent deliberately: it is in published URLs, and
    // changing it silently breaks every inbound link to the brand page.
    data: { ...input, updatedAt: new Date() },
  });
  if (count === 0) throw new Error("brand not found");
}

export async function setBrandActive(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  const { count } = await tx.brand.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { isActive, updatedAt: new Date() },
  });
  if (count === 0) throw new Error("brand not found");
}

export async function findBrandBySlug(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slug: string,
): Promise<{ id: string } | null> {
  return tx.brand.findFirst({
    where: { tenantId, slug, deletedAt: null },
    select: { id: true },
  });
}
