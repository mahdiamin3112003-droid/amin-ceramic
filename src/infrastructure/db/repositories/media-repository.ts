import type { Prisma } from "@prisma/client";

import type { AdminMediaAsset, AdminMediaPage } from "@/domain/admin/media";
import type { ProductMediaRole } from "@/domain/admin/product";
import { mediaUrl } from "@/infrastructure/media/storage";

/**
 * Media library repository — `media_asset`, `media_translation`,
 * `product_media` (docs/03 §4).
 *
 * The URL is derived here rather than stored, so `mediaUrl()` stays the one
 * place that knows how a `publicId` becomes a loadable address (ADR-0013).
 */

const PAGE_SIZE = 40;

export async function listMediaAssets(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { query?: string; page?: number },
): Promise<AdminMediaPage> {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.MediaAssetWhereInput = {
    tenantId,
    deletedAt: null,
    ...(filter.query
      ? {
          OR: [
            { publicId: { contains: filter.query, mode: "insensitive" as const } },
            { tags: { has: filter.query } },
            {
              translations: {
                some: {
                  altText: { contains: filter.query, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    tx.mediaAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        publicId: true,
        secureUrl: true,
        width: true,
        height: true,
        bytes: true,
        mimeType: true,
        dominantColor: true,
        tags: true,
        createdAt: true,
        translations: { select: { locale: true, altText: true } },
        // Used to warn before deleting something a product depends on.
        _count: { select: { productMedia: true } },
      },
    }),
    tx.mediaAsset.count({ where }),
  ]);

  return {
    assets: rows.map((row): AdminMediaAsset => ({
      id: row.id,
      url: mediaUrl(row),
      publicId: row.publicId,
      width: row.width,
      height: row.height,
      // `bytes` is a Postgres bigint → JS BigInt. Converted at this
      // boundary because BigInt is not JSON-serialisable, and a Server
      // Component handing one to a Client Component throws at runtime.
      bytes: row.bytes === null ? null : Number(row.bytes),
      mimeType: row.mimeType,
      dominantColor: row.dominantColor,
      tags: row.tags,
      altText: Object.fromEntries(
        row.translations.map((t) => [t.locale, t.altText]),
      ),
      usageCount: row._count.productMedia,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function createMediaAsset(
  tx: Prisma.TransactionClient,
  tenantId: string,
  uploadedBy: string,
  input: {
    publicId: string;
    format: string;
    mimeType: string;
    width: number;
    height: number;
    bytes: number;
    checksumSha256: string;
    dominantColor: string | null;
  },
): Promise<{ id: string; deduplicated: boolean }> {
  // Deduplicate on the checksum. Suppliers routinely send the same tile
  // photo across several spreadsheets; without this the library fills with
  // identical images that then have to be told apart by eye.
  const existing = await tx.mediaAsset.findFirst({
    where: { tenantId, checksumSha256: input.checksumSha256, deletedAt: null },
    select: { id: true },
  });
  if (existing) return { id: existing.id, deduplicated: true };

  const created = await tx.mediaAsset.create({
    data: {
      tenantId,
      provider: "supabase",
      publicId: input.publicId,
      format: input.format,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      bytes: BigInt(input.bytes),
      checksumSha256: input.checksumSha256,
      dominantColor: input.dominantColor,
      uploadedBy,
    },
    select: { id: true },
  });

  return { id: created.id, deduplicated: false };
}

export async function setMediaAltText(
  tx: Prisma.TransactionClient,
  mediaAssetId: string,
  locale: string,
  altText: string | null,
  reviewedBy: string,
): Promise<void> {
  await tx.mediaTranslation.upsert({
    where: { mediaAssetId_locale: { mediaAssetId, locale } },
    // Human-entered, so `isMachineGenerated` is false and the review stamp
    // is filled in — that pair is what lets the AI-generated alt text of
    // Phase 5 be told apart from a person's words.
    create: {
      mediaAssetId,
      locale,
      altText,
      isMachineGenerated: false,
      reviewedBy,
      reviewedAt: new Date(),
    },
    update: {
      altText,
      isMachineGenerated: false,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });
}

export async function attachMediaToProduct(
  tx: Prisma.TransactionClient,
  productId: string,
  mediaAssetId: string,
  role: ProductMediaRole,
  sortOrder: number,
): Promise<void> {
  await tx.productMedia.upsert({
    where: { productId_mediaAssetId_role: { productId, mediaAssetId, role } },
    create: { productId, mediaAssetId, role, sortOrder },
    update: { sortOrder, isActive: true },
  });
}

export async function detachMediaFromProduct(
  tx: Prisma.TransactionClient,
  productId: string,
  mediaAssetId: string,
  role: string,
): Promise<void> {
  await tx.productMedia.deleteMany({
    where: { productId, mediaAssetId, role: role as never },
  });
}

/**
 * Soft-delete. Refuses while any product still references the asset —
 * a product page whose image 404s is worse than a cluttered library, and
 * the person deleting is best placed to detach it first.
 */
export async function softDeleteMediaAsset(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
): Promise<{ publicId: string }> {
  const asset = await tx.mediaAsset.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { publicId: true, _count: { select: { productMedia: true } } },
  });
  if (!asset) throw new Error("media asset not found");
  if (asset._count.productMedia > 0) {
    throw new Error(
      `still used by ${String(asset._count.productMedia)} product image slot(s) — detach it first`,
    );
  }

  await tx.mediaAsset.updateMany({
    where: { id, tenantId },
    data: { deletedAt: new Date() },
  });

  return { publicId: asset.publicId };
}
