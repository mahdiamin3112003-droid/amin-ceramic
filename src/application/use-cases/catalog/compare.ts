import {
  buildComparisonRows,
  type CompareRow,
  InvalidComparisonError,
} from "@/domain/comparison/entity";
import type { ProductDetail, ProductId } from "@/domain/product/entity";
import { getProductDetailById } from "@/infrastructure/db/repositories/product-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface CompareResult {
  readonly products: readonly ProductDetail[];
  readonly rows: readonly CompareRow[];
  readonly error: string | null;
}

/**
 * `/compare?ids=` — fetches each product then hands them to the pure domain
 * diff (docs/04-api-architecture.md §6.6: "computed server-side, not a
 * client string-diff"). Products no longer published or belonging to
 * another tenant are silently dropped (RLS + status filter in the
 * repository) rather than erroring — a stale bookmarked compare link
 * degrades to "fewer columns", not a broken page.
 */
export async function compareProducts(
  locale: string,
  productIds: readonly ProductId[],
): Promise<CompareResult> {
  try {
    const { tenantId } = await getRequestContext();
    const products = await withRequestContext({ tenantId }, async (tx) => {
      const rows = await Promise.all(
        productIds.map((id) => getProductDetailById(tx, tenantId, locale, id)),
      );
      return rows.filter((p): p is ProductDetail => p !== null);
    });

    if (products.length < 2) {
      return { products, rows: [], error: null };
    }

    const rows = buildComparisonRows(products);
    return { products, rows, error: null };
  } catch (cause) {
    if (cause instanceof InvalidComparisonError) {
      return { products: [], rows: [], error: cause.message };
    }
    console.error("[catalog] compare failed", cause);
    return {
      products: [],
      rows: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
