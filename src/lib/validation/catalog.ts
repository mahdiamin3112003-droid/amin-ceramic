import { z } from "zod";

/**
 * Catalog validation schemas — the API boundary layer.
 *
 * docs/04-api-architecture.md §19: client Zod is UX-only, this schema is the
 * authoritative check. Strict parsing (unknown querystring keys rejected),
 * bounded ranges, and coercion for querystring values (always strings on
 * the wire) into the numbers/booleans repositories expect.
 */

const csv = z
  .string()
  .max(500)
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(z.array(z.string().min(1).max(60)).max(20));

const numberRange = z
  .string()
  .regex(/^\d+(\.\d+)?,\d+(\.\d+)?$/)
  .transform((value) => value.split(",").map(Number))
  .pipe(z.tuple([z.number().nonnegative(), z.number().nonnegative()]));

export const productSortSchema = z.enum([
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "name_asc",
]);

export const productFilterQuerySchema = z
  .object({
    category: z.string().min(1).max(80).optional(),
    collection: z.string().min(1).max(80).optional(),
    brand: csv.optional(),
    material: csv.optional(),
    finish: csv.optional(),
    look: csv.optional(),
    color: csv.optional(),
    application: csv.optional(),
    format: csv.optional(),
    widthMin: z.coerce.number().int().positive().optional(),
    widthMax: z.coerce.number().int().positive().optional(),
    thicknessMin: z.coerce.number().positive().optional(),
    thicknessMax: z.coerce.number().positive().optional(),
    indoor: z.coerce.boolean().optional(),
    outdoor: z.coerce.boolean().optional(),
    slip: csv.optional(),
    peiMin: z.coerce.number().int().min(1).max(5).optional(),
    rectified: z.coerce.boolean().optional(),
    priceRange: numberRange.optional(),
    availability: z.coerce.boolean().optional(),
    q: z.string().trim().max(120).optional(),
    sort: productSortSchema.optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
    locale: z.enum(["en", "ar"]),
  })
  .strict();

export type ProductFilterQuery = z.infer<typeof productFilterQuerySchema>;

export const quantityCalculatorInputSchema = z
  .object({
    areaM2: z.number().min(0.1).max(100_000).optional(),
    widthM: z.number().positive().max(1000).optional(),
    lengthM: z.number().positive().max(1000).optional(),
    layoutPatternKey: z.string().min(1).max(60).optional(),
    wastagePct: z.number().min(0).max(50).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.areaM2 !== undefined ||
      (data.widthM !== undefined && data.lengthM !== undefined),
    {
      message: "either areaM2 or both widthM and lengthM are required",
    },
  );

export type QuantityCalculatorInput = z.infer<typeof quantityCalculatorInputSchema>;

export const compareRequestSchema = z
  .object({
    productIds: z.array(z.uuid()).min(2).max(4),
    locale: z.enum(["en", "ar"]),
  })
  .strict();

export const searchSuggestQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(60),
    locale: z.enum(["en", "ar"]),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();
