import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import { NotFoundError } from "@/application/auth/authorize";
import {
  canTransition,
  publishBlockers,
  type AdminProductDetail,
  type AdminProductFilter,
  type AdminProductLookups,
  type AdminProductPage,
  type ProductStatus,
} from "@/domain/admin/product";
import {
  createAdminProduct,
  getAdminProduct,
  getAdminProductLookups,
  listAdminProducts,
  setAdminProductStatus,
  softDeleteAdminProduct,
  updateAdminProduct,
  upsertAdminProductTranslation,
} from "@/infrastructure/db/repositories/admin-product-repository";
import { diffFields } from "@/infrastructure/db/repositories/audit-repository";
import type {
  ProductTranslationValues,
  ProductWriteValues,
} from "@/lib/validation/admin-product";

/**
 * Admin product use-cases.
 *
 * Every one goes through `adminQuery`/`adminMutation`, which is where the
 * permission check, the RLS claims and (for writes) the same-transaction
 * audit row live. Nothing in this file checks a permission itself — the
 * declaration is the string passed in, so it is visible at a glance and
 * cannot be half-implemented.
 *
 * Locales that must be complete before a product may go live. Arabic is
 * included from day one: the site is bilingual, and a published product
 * with no Arabic renders an English name inside an RTL page.
 */
const REQUIRED_PUBLISH_LOCALES = ["en", "ar"] as const;

export async function listProductsForAdmin(
  filter: AdminProductFilter,
): Promise<AdminProductPage> {
  return adminQuery("product.read", (tx, ctx) =>
    listAdminProducts(tx, ctx.tenantId, filter),
  );
}

export async function getProductForAdmin(id: string): Promise<AdminProductDetail> {
  return adminQuery("product.read", async (tx, ctx) => {
    const product = await getAdminProduct(tx, ctx.tenantId, id);
    // 404, never 403 — docs/04 §5.1. A 403 here would confirm the id exists
    // in some other tenant, which is an enumeration oracle.
    if (!product) throw new NotFoundError("product not found");
    return product;
  });
}

export async function getProductLookups(): Promise<AdminProductLookups> {
  return adminQuery("product.read", (tx, ctx) =>
    getAdminProductLookups(tx, ctx.tenantId),
  );
}

export async function createProduct(input: {
  product: ProductWriteValues;
  translation: ProductTranslationValues;
}): Promise<{ id: string }> {
  return adminMutation("product.create", async (tx, ctx) => {
    const created = await createAdminProduct(
      tx,
      ctx.tenantId,
      ctx.appUserId,
      input.product,
    );

    // Same transaction as the product row: a product with no name in any
    // locale is not a state worth being able to reach.
    await upsertAdminProductTranslation(tx, ctx.tenantId, created.id, {
      ...input.translation,
      tags: [...input.translation.tags],
    });

    return {
      result: created,
      audit: {
        action: "product.create",
        entityType: "product",
        entityId: created.id,
        entityLabel: `${input.product.sku} — ${input.translation.name}`,
        after: input.product,
      },
    };
  });
}

export async function updateProduct(
  id: string,
  product: ProductWriteValues,
): Promise<void> {
  return adminMutation("product.update", async (tx, ctx) => {
    const before = await getAdminProduct(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("product not found");

    await updateAdminProduct(tx, ctx.tenantId, ctx.appUserId, id, product);

    // Only what actually changed reaches the audit log. A full snapshot per
    // edit makes the log unreadable at volume — see `diffFields`.
    const diff = diffFields(before as unknown as Record<string, unknown>, product);

    return {
      result: undefined,
      audit: {
        action: "product.update",
        entityType: "product",
        entityId: id,
        entityLabel: before.sku,
        before: diff.before,
        after: diff.after,
        changedFields: diff.changedFields,
      },
    };
  });
}

export async function saveProductTranslation(
  id: string,
  translation: ProductTranslationValues,
): Promise<void> {
  return adminMutation("product.update", async (tx, ctx) => {
    const before = await getAdminProduct(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("product not found");

    await upsertAdminProductTranslation(tx, ctx.tenantId, id, {
      ...translation,
      tags: [...translation.tags],
    });

    return {
      result: undefined,
      audit: {
        action: "product.translate",
        entityType: "product",
        entityId: id,
        entityLabel: `${before.sku} (${translation.locale})`,
        after: { locale: translation.locale, name: translation.name },
      },
    };
  });
}

/**
 * Status changes, including publish.
 *
 * `product.publish` rather than `product.update`: an editor who may correct
 * a typo is not necessarily someone who may put a product in front of
 * customers, and docs/03 §2.5 keeps them as separate permissions.
 */
export async function setProductStatus(
  id: string,
  status: ProductStatus,
): Promise<void> {
  return adminMutation("product.publish", async (tx, ctx) => {
    const before = await getAdminProduct(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("product not found");

    if (before.status === status) {
      throw new Error(`product is already ${status}`);
    }

    if (!canTransition(before.status, status)) {
      throw new Error(`cannot move a ${before.status} product to ${status}`);
    }

    // Checked HERE, in the transaction, not just in the form. The form's
    // copy of this check is a courtesy; this one is the rule, and it reads
    // the row as it actually is rather than as the browser last saw it.
    if (status === "published") {
      const blockers = publishBlockers(before, REQUIRED_PUBLISH_LOCALES);
      if (blockers.length > 0) {
        throw new Error(`cannot publish: ${blockers.join(", ")}`);
      }
    }

    await setAdminProductStatus(tx, ctx.tenantId, ctx.appUserId, id, status);

    return {
      result: undefined,
      audit: {
        action: `product.${status}`,
        entityType: "product",
        entityId: id,
        entityLabel: before.sku,
        before: { status: before.status },
        after: { status },
        changedFields: ["status"],
      },
    };
  });
}

export async function deleteProduct(id: string, reason: string): Promise<void> {
  return adminMutation("product.delete", async (tx, ctx) => {
    const before = await getAdminProduct(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("product not found");

    await softDeleteAdminProduct(tx, ctx.tenantId, ctx.appUserId, id);

    return {
      result: undefined,
      audit: {
        action: "product.delete",
        entityType: "product",
        entityId: id,
        // The label matters more here than anywhere else: the row is
        // soft-deleted and will not appear in any list, so this string is
        // how someone reconstructs what was removed.
        entityLabel: `${before.sku} — ${before.translations.find((t) => t.locale === "en")?.name ?? ""}`,
        before: { status: before.status, sku: before.sku },
        reason,
      },
    };
  });
}

/** For the edit screen's publish button — what is stopping this going live. */
export function getPublishBlockers(product: AdminProductDetail): readonly string[] {
  return publishBlockers(product, REQUIRED_PUBLISH_LOCALES);
}
