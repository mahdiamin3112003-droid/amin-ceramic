import type { NextRequest } from "next/server";

import { searchProducts } from "@/application/use-cases/catalog/search";
import { toProductFilter } from "@/application/mappers/product-filter";
import { productFilterQuerySchema } from "@/lib/validation/catalog";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/** `/api/v1/search` — full results, same facet contract as `/api/v1/products` (§7.2). */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const query = productFilterQuerySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const { page, error } = await searchProducts(
      query.locale,
      toProductFilter(query),
    );
    if (error) return jsonError(500, "failed to load search results");
    return jsonOk(page);
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] search failed", cause);
    return jsonError(500, "internal error");
  }
}
