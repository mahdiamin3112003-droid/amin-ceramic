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

/** No visitor yet means an empty wishlist, not an error — same degrade-don't-fail shape as the other reads. */
export async function listWishlistProductIds(): Promise<WishlistResult> {
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
}

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
