import type { NextRequest } from "next/server";

import type { ProductId } from "@/domain/product/entity";
import { compareProducts } from "@/application/use-cases/catalog/compare";
import { compareRequestSchema } from "@/lib/validation/catalog";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/**
 * `/api/v1/products/compare?ids=a,b,c&locale=en` — a lighter-weight sibling
 * of the `/compare` page itself (which calls `compareProducts` directly
 * from its Server Component per §2.1); this route backs a client-side
 * "quick compare" preview that doesn't warrant a full navigation.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const raw = searchParamsToRecord(request.nextUrl.searchParams);
    const { productIds, locale } = compareRequestSchema.parse({
      productIds: raw.ids ? raw.ids.split(",").filter(Boolean) : [],
      locale: raw.locale,
    });

    const { products, rows, error } = await compareProducts(
      locale,
      productIds as ProductId[],
    );
    if (error) return jsonError(400, error);
    return jsonOk({ products, rows });
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] compare failed", cause);
    return jsonError(500, "internal error");
  }
}
