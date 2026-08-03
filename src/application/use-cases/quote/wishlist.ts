import { cache } from "react";

import type { ProductSummary } from "@/domain/product/entity";
import { getProductSummariesByIds } from "@/infrastructure/db/repositories/product-repository";
import {
  addToWishlist as addToWishlistRepo,
  listWishlistProductIds as listWishlistProductIdsRepo,
  removeFromWishlist as removeFromWishlistRepo,
} from "@/infrastructure/db/repositories/wishlist-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface WishlistResult {
  readonly productIds: readonly string[];
  readonly error: string | null;
}

export interface WishlistProductsResult {
  readonly products: readonly ProductSummary[];
  readonly error: string | null;
}

/** `/wishlist` — the saved-items page's data source; one transaction for both reads. */
export async function listWishlistProducts(
  locale: string,
): Promise<WishlistProductsResult> {
  try {
    const { tenantId, visitorId } = await getRequestContext();
    if (!visitorId) return { products: [], error: null };

    const products = await withRequestContext(
      { tenantId, visitorId },
      async (tx) => {
        const ids = await listWishlistProductIdsRepo(tx, tenantId, visitorId);
        return getProductSummariesByIds(tx, tenantId, locale, ids);
      },
    );
    return { products, error: null };
  } catch (cause) {
    console.error("[quote] wishlist products read failed", cause);
    return {
      products: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}

/**
 * No visitor yet means an empty wishlist, not an error — same
 * degrade-don't-fail shape as the other reads.
 *
 * `cache()`d because the site header (rendered by the locale layout) and
 * most catalog pages both need this in the same request; without it that's
 * two transactions racing the one pooled connection. Request-scoped, so a
 * wishlist mutation still shows fresh on the next request.
 */
export const listWishlistProductIds = cache(async (): Promise<WishlistResult> => {
  try {
    const { tenantId, visitorId } = await getRequestContext();
    if (!visitorId) return { productIds: [], error: null };

    const productIds = await withRequestContext({ tenantId, visitorId }, (tx) =>
      listWishlistProductIdsRepo(tx, tenantId, visitorId),
    );
    return { productIds, error: null };
  } catch (cause) {
    console.error("[quote] wishlist read failed", cause);
    return {
      productIds: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
});

/** Heart-toggle actions — mutations, so they throw rather than degrade (see basket-mutations.ts). */
export async function addToWishlist(productId: string): Promise<void> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  await withRequestContext({ tenantId, visitorId }, (tx) =>
    addToWishlistRepo(tx, tenantId, visitorId, productId),
  );
}

export async function removeFromWishlist(productId: string): Promise<void> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  await withRequestContext({ tenantId, visitorId }, (tx) =>
    removeFromWishlistRepo(tx, tenantId, visitorId, productId),
  );
}
