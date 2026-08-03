import type { NextRequest } from "next/server";
import { z } from "zod";

import type { ProductId } from "@/domain/product/entity";
import { getProductById } from "@/application/use-cases/catalog/get-product-detail";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/**
 * `/api/v1/products/[id]/availability` — per-location stock bands, `no-store`
 * (docs/04-api-architecture.md §6.3: availability is real-time, never
 * cached). Deliberately thin: reuses the PDP's own detail read rather than
 * a bespoke query, since availability is only ever consulted alongside
 * `stockStatus`/`m2PerBox`, which the same read already carries.
 */
export const runtime = "nodejs";

const querySchema = z.object({ locale: z.enum(["en", "ar"]) }).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const { locale } = querySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const { product, error } = await getProductById(locale, id as ProductId);
    if (error) return jsonError(500, "failed to load availability");
    if (!product) return jsonError(404, "product not found");

    return jsonOk(
      { stockStatus: product.stockStatus, locations: product.availability },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] availability failed", cause);
    return jsonError(500, "internal error");
  }
}
