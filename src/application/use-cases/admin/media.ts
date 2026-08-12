import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import type { AdminMediaPage } from "@/domain/admin/media";
import type { ProductMediaRole } from "@/domain/admin/product";
import {
  attachMediaToProduct,
  createMediaAsset,
  detachMediaFromProduct,
  listMediaAssets,
  setMediaAltText,
  softDeleteMediaAsset,
} from "@/infrastructure/db/repositories/media-repository";
import { deleteMediaObject, uploadMedia } from "@/infrastructure/media/upload";

/**
 * Media library use-cases.
 *
 * All gated on `media.manage` — docs/03 §2.4 has no separate `media.read`,
 * so viewing and editing the library are one permission. Worth naming
 * because it means the media nav item is hidden from `sales` and `viewer`,
 * which is correct: they consume images through products, not directly.
 */

export async function listMedia(filter: {
  query?: string;
  page?: number;
}): Promise<AdminMediaPage> {
  return adminQuery("media.manage", (tx, ctx) =>
    listMediaAssets(tx, ctx.tenantId, filter),
  );
}

/**
 * Upload an image and record it.
 *
 * ORDERING MATTERS AND IS NOT IDEAL. The bytes go to Storage BEFORE the
 * transaction opens, because an HTTP upload inside a database transaction
 * would hold a pooled connection for the duration of a 25 MB transfer —
 * which at `connection_limit=5` starves the rest of the request.
 *
 * The cost is that a failure between the two leaves an orphaned object in
 * the bucket. That is the right way round: an unreferenced object is
 * invisible and cheap, whereas a row pointing at bytes that were never
 * stored is a broken image on a product page. Orphans are swept by the
 * storage-reconciliation job in Phase 9.
 */
export async function uploadMediaAsset(file: {
  name: string;
  type: string;
  bytes: Buffer;
}): Promise<{ id: string; deduplicated: boolean }> {
  return adminMutation("media.manage", async (tx, ctx) => {
    const uploaded = await uploadMedia(ctx.tenantId, file);
    if (!uploaded.ok) throw new Error(uploaded.error);

    const created = await createMediaAsset(
      tx,
      ctx.tenantId,
      ctx.appUserId,
      uploaded.media,
    );

    return {
      result: created,
      audit: {
        action: created.deduplicated ? "media.deduplicate" : "media.upload",
        entityType: "media_asset",
        entityId: created.id,
        entityLabel: file.name,
        after: {
          publicId: uploaded.media.publicId,
          bytes: uploaded.media.bytes,
          width: uploaded.media.width,
          height: uploaded.media.height,
        },
      },
    };
  });
}

export async function updateMediaAltText(
  id: string,
  locale: string,
  altText: string | null,
): Promise<void> {
  return adminMutation("media.manage", async (tx, ctx) => {
    await setMediaAltText(tx, id, locale, altText, ctx.appUserId);

    return {
      result: undefined,
      audit: {
        action: "media.alt_text",
        entityType: "media_asset",
        entityId: id,
        entityLabel: `${id} (${locale})`,
        after: { locale, altText },
        changedFields: ["altText"],
      },
    };
  });
}

export async function attachMedia(
  productId: string,
  mediaAssetId: string,
  role: ProductMediaRole,
  sortOrder: number,
): Promise<void> {
  // `product.update`, not `media.manage`: this changes what a PRODUCT
  // shows, so it belongs to whoever may edit that product.
  return adminMutation("product.update", async (tx) => {
    await attachMediaToProduct(tx, productId, mediaAssetId, role, sortOrder);

    return {
      result: undefined,
      audit: {
        action: "product.media_attach",
        entityType: "product",
        entityId: productId,
        after: { mediaAssetId, role, sortOrder },
      },
    };
  });
}

export async function detachMedia(
  productId: string,
  mediaAssetId: string,
  role: string,
): Promise<void> {
  return adminMutation("product.update", async (tx) => {
    await detachMediaFromProduct(tx, productId, mediaAssetId, role);

    return {
      result: undefined,
      audit: {
        action: "product.media_detach",
        entityType: "product",
        entityId: productId,
        before: { mediaAssetId, role },
      },
    };
  });
}

/**
 * Soft-delete a library asset.
 *
 * The row is marked deleted inside the transaction; the storage objects go
 * afterwards, deliberately. If the object removal fails we are left with
 * an orphan, which is harmless. Doing it the other way — deleting the bytes
 * and then failing to commit — leaves a live row pointing at nothing.
 */
export async function deleteMediaAsset(id: string): Promise<void> {
  const publicId = await adminMutation("media.manage", async (tx, ctx) => {
    const { publicId: removed } = await softDeleteMediaAsset(tx, ctx.tenantId, id);

    return {
      result: removed,
      audit: {
        action: "media.delete",
        entityType: "media_asset",
        entityId: id,
        entityLabel: removed,
      },
    };
  });

  await deleteMediaObject(publicId);
}
