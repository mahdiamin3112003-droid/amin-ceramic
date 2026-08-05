import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import { NotFoundError } from "@/application/auth/authorize";
import {
  brandDeactivationBlockedReason,
  collectionPublishBlockers,
  type BrandRow,
  type CollectionRow,
} from "@/domain/admin/collection";
import {
  createBrand,
  createCollection,
  findBrandBySlug,
  findCollectionBySlug,
  listBrandsForAdmin,
  listCollectionsForAdmin,
  setBrandActive,
  setCollectionStatus,
  softDeleteCollection,
  updateBrand,
  updateCollection,
  type CollectionWriteInput,
} from "@/infrastructure/db/repositories/collection-admin-repository";

/**
 * Collections and brands — docs/04 §14.1.
 *
 * `content.manage` throughout, matching the taxonomy family: these are
 * catalogue content rather than product records, so an editor curates them
 * without needing `product.update`.
 */
const REQUIRED_LOCALES = ["en", "ar"] as const;

export async function listCollections(): Promise<CollectionRow[]> {
  return adminQuery("content.manage", (tx, ctx) =>
    listCollectionsForAdmin(tx, ctx.tenantId),
  );
}

export async function getCollection(id: string): Promise<CollectionRow> {
  return adminQuery("content.manage", async (tx, ctx) => {
    const found = (await listCollectionsForAdmin(tx, ctx.tenantId)).find(
      (c) => c.id === id,
    );
    // 404, never 403 — docs/04 §5.1.
    if (!found) throw new NotFoundError("collection not found");
    return found;
  });
}

export async function createCollectionEntry(
  input: CollectionWriteInput,
): Promise<{ id: string }> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const clash = await findCollectionBySlug(tx, ctx.tenantId, input.slug);
    if (clash) throw new Error(`the slug "${input.slug}" is already in use`);

    const created = await createCollection(tx, ctx.tenantId, input);

    return {
      result: created,
      audit: {
        action: "collection.create",
        entityType: "collection",
        entityId: created.id,
        entityLabel: `${input.slug} — ${input.translations[0]?.name ?? ""}`,
        after: { slug: input.slug },
      },
    };
  });
}

export async function updateCollectionEntry(
  id: string,
  input: CollectionWriteInput,
): Promise<void> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const all = await listCollectionsForAdmin(tx, ctx.tenantId);
    const before = all.find((c) => c.id === id);
    if (!before) throw new NotFoundError("collection not found");

    // A slug change is allowed here, unlike a brand's — collection URLs are
    // newer and less linked — but it still must not collide.
    if (input.slug !== before.slug) {
      const clash = all.find((c) => c.slug === input.slug && c.id !== id);
      if (clash) throw new Error(`the slug "${input.slug}" is already in use`);
    }

    await updateCollection(tx, ctx.tenantId, id, input);

    return {
      result: undefined,
      audit: {
        action: "collection.update",
        entityType: "collection",
        entityId: id,
        entityLabel: before.slug,
        before: { slug: before.slug, brandId: before.brandId },
        after: { slug: input.slug, brandId: input.brandId },
      },
    };
  });
}

/**
 * Publish, unpublish or archive.
 *
 * The publish gate is stricter than a product's: a published collection
 * with no products is a dead end reachable from navigation, and a
 * collection without a hero is a page with nothing on it.
 */
export async function setCollectionStatusEntry(
  id: string,
  status: "draft" | "published" | "archived",
): Promise<void> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const before = (await listCollectionsForAdmin(tx, ctx.tenantId)).find(
      (c) => c.id === id,
    );
    if (!before) throw new NotFoundError("collection not found");

    if (before.status === status)
      throw new Error(`this collection is already ${status}`);

    if (status === "published") {
      const blockers = collectionPublishBlockers(before, REQUIRED_LOCALES);
      if (blockers.length > 0) {
        throw new Error(`cannot publish: ${blockers.join(", ").toLowerCase()}`);
      }
    }

    await setCollectionStatus(tx, ctx.tenantId, id, status);

    return {
      result: undefined,
      audit: {
        action: `collection.${status}`,
        entityType: "collection",
        entityId: id,
        entityLabel: before.slug,
        before: { status: before.status },
        after: { status },
        changedFields: ["status"],
      },
    };
  });
}

export async function deleteCollectionEntry(
  id: string,
  reason: string,
): Promise<void> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const before = (await listCollectionsForAdmin(tx, ctx.tenantId)).find(
      (c) => c.id === id,
    );
    if (!before) throw new NotFoundError("collection not found");

    await softDeleteCollection(tx, ctx.tenantId, id);

    return {
      result: undefined,
      audit: {
        action: "collection.delete",
        entityType: "collection",
        entityId: id,
        // The label matters most here: the row is soft-deleted and will not
        // appear in any list, so this is how someone reconstructs what went.
        entityLabel: `${before.slug} (${String(before.productCount)} products)`,
        before: { status: before.status, slug: before.slug },
        reason,
      },
    };
  });
}

// ── Brands ───────────────────────────────────────────────────────────────────

export async function listBrands(): Promise<BrandRow[]> {
  return adminQuery("content.manage", (tx, ctx) =>
    listBrandsForAdmin(tx, ctx.tenantId),
  );
}

export async function createBrandEntry(input: {
  slug: string;
  name: string;
  originCountry: string | null;
  websiteUrl: string | null;
}): Promise<{ id: string }> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const clash = await findBrandBySlug(tx, ctx.tenantId, input.slug);
    if (clash) throw new Error(`the slug "${input.slug}" is already in use`);

    const created = await createBrand(tx, ctx.tenantId, input);

    return {
      result: created,
      audit: {
        action: "brand.create",
        entityType: "brand",
        entityId: created.id,
        entityLabel: `${input.slug} — ${input.name}`,
        after: input,
      },
    };
  });
}

export async function updateBrandEntry(
  id: string,
  input: { name: string; originCountry: string | null; websiteUrl: string | null },
): Promise<void> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const before = (await listBrandsForAdmin(tx, ctx.tenantId)).find(
      (b) => b.id === id,
    );
    if (!before) throw new NotFoundError("brand not found");

    await updateBrand(tx, ctx.tenantId, id, input);

    return {
      result: undefined,
      audit: {
        action: "brand.update",
        entityType: "brand",
        entityId: id,
        entityLabel: before.slug,
        before: { name: before.name },
        after: { name: input.name },
      },
    };
  });
}

export async function setBrandActiveEntry(
  id: string,
  isActive: boolean,
): Promise<void> {
  return adminMutation("content.manage", async (tx, ctx) => {
    const before = (await listBrandsForAdmin(tx, ctx.tenantId)).find(
      (b) => b.id === id,
    );
    if (!before) throw new NotFoundError("brand not found");

    if (!isActive) {
      const blocked = brandDeactivationBlockedReason(before);
      if (blocked) throw new Error(`cannot hide this brand: ${blocked}`);
    }

    await setBrandActive(tx, ctx.tenantId, id, isActive);

    return {
      result: undefined,
      audit: {
        action: `brand.${isActive ? "activate" : "deactivate"}`,
        entityType: "brand",
        entityId: id,
        entityLabel: before.slug,
        before: { isActive: before.isActive },
        after: { isActive },
        changedFields: ["isActive"],
      },
    };
  });
}

/** For the collection form's brand picker and its publish checklist. */
export function getCollectionPublishBlockers(
  collection: CollectionRow,
): readonly string[] {
  return collectionPublishBlockers(collection, REQUIRED_LOCALES);
}
