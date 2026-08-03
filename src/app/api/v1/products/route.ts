import type { NextRequest } from "next/server";

import { listProducts } from "@/application/use-cases/catalog/list-products";
import { toProductFilter } from "@/application/mappers/product-filter";
import { productFilterQuerySchema } from "@/lib/validation/catalog";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/**
 * `/api/v1/products` — client-hydration read for the listing page's filter
 * rail (re-fetches on facet change without a full navigation). The
 * server-rendered first paint calls `listProducts` directly from the page
 * (§2.1); this route exists for the client-side refinement after that.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const query = productFilterQuerySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const { page, error } = await listProducts(
      query.locale,
      toProductFilter(query),
    );
    if (error) return jsonError(500, "failed to load products");
    return jsonOk(page);
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] products list failed", cause);
    return jsonError(500, "internal error");
  }
}
