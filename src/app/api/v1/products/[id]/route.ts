import type { NextRequest } from "next/server";
import { z } from "zod";

import type { ProductId } from "@/domain/product/entity";
import {
  getProductById,
  getProductBySlug,
} from "@/application/use-cases/catalog/get-product-detail";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/**
 * `/api/v1/products/[id]` — accepts either a product id (uuid) or a
 * locale-scoped slug, since the PDP's client-hydration needs (similar-rail
 * refresh, wishlist state) don't always have the id on hand yet. The
 * server-rendered PDP itself calls the use-cases directly (§2.1).
 */
export const runtime = "nodejs";

const querySchema = z.object({ locale: z.enum(["en", "ar"]) }).strict();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const { locale } = querySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const result = UUID_RE.test(id)
      ? await getProductById(locale, id as ProductId)
      : await getProductBySlug(locale, id);

    if (result.error) return jsonError(500, "failed to load product");
    if (!result.product) return jsonError(404, "product not found");
    return jsonOk({ product: result.product, isWishlisted: result.isWishlisted });
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] product detail failed", cause);
    return jsonError(500, "internal error");
  }
}
