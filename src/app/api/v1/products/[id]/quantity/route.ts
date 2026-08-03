import type { NextRequest } from "next/server";
import { z } from "zod";

import type { ProductId } from "@/domain/product/entity";
import { estimateQuantity } from "@/domain/quantity/calculator";
import { getProductById } from "@/application/use-cases/catalog/get-product-detail";
import { getActiveTenant } from "@/application/use-cases/tenant/get-active-tenant";
import { quantityCalculatorInputSchema } from "@/lib/validation/catalog";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/**
 * `/api/v1/products/[id]/quantity` — the interactive PDP calculator's
 * client-hydration read. A thin wrapper over the pure domain functions in
 * `src/domain/quantity/calculator.ts`: the arithmetic never runs
 * client-side or in an LLM (docs/01-architecture.md §6.4), this route is
 * the only place it runs for a live PDP slider.
 */
export const runtime = "nodejs";

const localeSchema = z.object({ locale: z.enum(["en", "ar"]) });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const raw = searchParamsToRecord(request.nextUrl.searchParams);
    const { locale } = localeSchema.parse(raw);
    const input = quantityCalculatorInputSchema.parse({
      areaM2: raw.areaM2 !== undefined ? Number(raw.areaM2) : undefined,
      widthM: raw.widthM !== undefined ? Number(raw.widthM) : undefined,
      lengthM: raw.lengthM !== undefined ? Number(raw.lengthM) : undefined,
      layoutPatternKey: raw.layoutPatternKey,
      wastagePct: raw.wastagePct !== undefined ? Number(raw.wastagePct) : undefined,
    });

    const { product, error } = await getProductById(locale, id as ProductId);
    if (error) return jsonError(500, "failed to load product");
    if (!product) return jsonError(404, "product not found");

    const { tenant } = await getActiveTenant();
    // quantityCalculatorInputSchema's refine already guarantees areaM2 OR
    // both widthM and lengthM are present — this branch just narrows the type.
    const areaM2 =
      input.areaM2 ??
      (input.widthM !== undefined && input.lengthM !== undefined
        ? input.widthM * input.lengthM
        : null);
    if (areaM2 === null)
      return jsonError(400, "areaM2 or widthM+lengthM is required");
    const wastagePct = input.wastagePct ?? tenant?.defaultWastagePct ?? 10;

    const estimate = estimateQuantity(
      areaM2,
      wastagePct,
      product.m2PerBox,
      product.kgPerBox,
    );
    return jsonOk(estimate);
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    if (cause instanceof RangeError) return jsonError(400, cause.message);
    console.error("[api] quantity calculation failed", cause);
    return jsonError(500, "internal error");
  }
}
