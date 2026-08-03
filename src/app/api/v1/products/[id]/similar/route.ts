import type { NextRequest } from "next/server";
import { z } from "zod";

import type { ProductId } from "@/domain/product/entity";
import { getSimilarProducts } from "@/application/use-cases/catalog/get-product-detail";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

export const runtime = "nodejs";

const RELATION_TYPES = [
  "related",
  "trim",
  "complete_the_look",
  "same_look_different_format",
  "same_look_lower_price",
  "replacement",
  "variant",
] as const;

const querySchema = z
  .object({
    locale: z.enum(["en", "ar"]),
    type: z.enum(RELATION_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

const DEFAULT_LIMIT = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const query = querySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const { products, error } = await getSimilarProducts(
      query.locale,
      id as ProductId,
      query.type,
      query.limit ?? DEFAULT_LIMIT,
    );
    if (error) return jsonError(500, "failed to load similar products");
    return jsonOk(products);
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] similar products failed", cause);
    return jsonError(500, "internal error");
  }
}
