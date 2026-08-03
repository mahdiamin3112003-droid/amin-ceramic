import { cache } from "react";

import type { QuoteBasket } from "@/domain/quote/entity";
import { getBasket as getBasketRepo } from "@/infrastructure/db/repositories/quote-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface GetBasketResult {
  readonly basket: QuoteBasket | null;
  readonly error: string | null;
}

/**
 * `/basket` and `/api/v1/basket` (client hydration for the header badge).
 * No visitor cookie yet means no basket yet — a designed empty state, not
 * an error (§18.3).
 *
 * `cache()`d for the same reason as `listWishlistProductIds`: the site
 * header needs the count on every page, and `/basket` needs the basket
 * itself — request-scoped dedupe keeps that to one transaction.
 */
export const getBasket = cache(async (): Promise<GetBasketResult> => {
  try {
    const { tenantId, visitorId } = await getRequestContext();
    if (!visitorId) return { basket: null, error: null };

    const basket = await withRequestContext({ tenantId, visitorId }, (tx) =>
      getBasketRepo(tx, tenantId, visitorId),
    );
    return { basket, error: null };
  } catch (cause) {
    console.error("[quote] get basket failed", cause);
    return {
      basket: null,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
});
