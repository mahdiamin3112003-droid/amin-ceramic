import type { ProductFilter, ProductListingPage } from "@/domain/catalog/entity";
import { listProducts as listProductsRepo } from "@/infrastructure/db/repositories/product-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

/**
 * Catalog listing use-case — `/products` and `/search` share this shape
 * (docs/04-api-architecture.md §7.2: search reuses the listing facet
 * contract). DEGRADE, DON'T FAIL (§18.3): a read failure renders the
 * designed empty state, not a stack trace.
 */
export interface ListProductsResult {
  readonly page: ProductListingPage | null;
  readonly error: string | null;
}

export async function listProducts(
  locale: string,
  filter: ProductFilter,
): Promise<ListProductsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const page = await withRequestContext({ tenantId }, (tx) =>
      listProductsRepo(tx, tenantId, locale, filter),
    );
    return { page, error: null };
  } catch (cause) {
    console.error("[catalog] list failed", cause);
    return {
      page: null,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
