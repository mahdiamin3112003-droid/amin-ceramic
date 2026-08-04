import { z } from "zod";

import { PRODUCT_STATUSES } from "@/domain/admin/product";

/**
 * Boundary schemas for admin product mutations — docs/04 §6.
 *
 * The numeric bounds are not decoration. `m2PerBox` feeds the quantity
 * calculator, which multiplies it by a customer's area to decide how many
 * boxes to quote; a zero or a typo'd 1000 there produces a wrong order, not
 * a validation error later. Same for `piecesPerBox`. These are the values
 * worth being strict about.
 */

/** Empty text inputs arrive as `""`; the column wants NULL. */
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const optionalShortText = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

/**
 * Accepts `""` → null, and coerces the string a form sends into a number.
 * `z.coerce.number()` alone would turn `""` into 0, which for a price means
 * "free" rather than "unset" — a difference worth the extra transform.
 */
function optionalNumber(min: number, max: number) {
  return z
    .union([z.literal(""), z.coerce.number().min(min).max(max)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);
}

export const productWriteSchema = z.object({
  // Citext column, tenant-scoped unique. Trimmed and uppercased so
  // `abc-1 ` and `ABC-1` cannot become two products.
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, "letters, digits and . _ - / only")
    .transform((v) => v.toUpperCase()),
  supplierSku: optionalShortText,

  brandId: z.uuid(),
  collectionId: z
    .union([z.literal(""), z.uuid()])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  categoryId: z.uuid(),

  // 10mm to 3.2m covers mosaic chips through the largest slabs made.
  widthMm: z.coerce.number().int().min(10).max(3200),
  heightMm: z.coerce.number().int().min(10).max(3200),
  thicknessMm: z.coerce.number().min(1).max(50),

  materialId: z.uuid(),
  finishId: z.uuid(),
  surfaceLookId: z.uuid(),
  colorFamilyId: z.uuid(),
  colorHex: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .nullable()
    .default(null),

  isRectified: z.coerce.boolean().default(false),
  shadeVariation: z
    .union([z.literal(""), z.enum(["V1", "V2", "V3", "V4"])])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  slipRating: z
    .union([z.literal(""), z.enum(["R9", "R10", "R11", "R12", "R13"])])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  peiClass: optionalNumber(0, 5),
  waterAbsorptionPct: optionalNumber(0, 100),
  isFrostResistant: z
    .union([z.literal(""), z.coerce.boolean()])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  isIndoor: z.coerce.boolean().default(true),
  isOutdoor: z.coerce.boolean().default(false),

  // The commerce-critical three. See the note above.
  piecesPerBox: z.coerce.number().int().min(1).max(1000),
  m2PerBox: z.coerce.number().gt(0).max(100),
  kgPerBox: z.coerce.number().gt(0).max(2000),
  boxesPerPallet: optionalNumber(1, 500),

  originCountry: z
    .union([z.literal(""), z.string().length(2)])
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .nullable()
    .default(null),

  basePrice: optionalNumber(0, 1_000_000),
  currency: z.string().length(3).default("USD"),
  priceVisibility: z.enum(["public", "trade_only", "on_request"]).default("public"),

  isFeatured: z.coerce.boolean().default(false),
  isNew: z.coerce.boolean().default(false),
});

export const productTranslationSchema = z.object({
  locale: z.enum(["en", "ar"]),
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    // Unicode-aware: an Arabic slug is legitimate here, so `[a-z0-9-]` would
    // be wrong. What must NOT appear is a slash or whitespace, which would
    // break routing.
    .regex(/^[^\s/?#]+$/, "no spaces or / ? #")
    .transform((v) => v.toLowerCase()),
  shortDescription: optionalShortText,
  description: optionalText,
  installationNotes: optionalText,
  careInstructions: optionalText,
  seoTitle: optionalShortText,
  seoDescription: optionalShortText,
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((v) =>
      (typeof v === "string" ? v.split(",") : v)
        .map((t) => t.trim())
        .filter(Boolean),
    )
    .default([]),
});

export const createProductSchema = z.object({
  product: productWriteSchema,
  translation: productTranslationSchema,
});

export const updateProductSchema = z.object({
  id: z.uuid(),
  product: productWriteSchema,
});

export const saveTranslationSchema = z.object({
  id: z.uuid(),
  translation: productTranslationSchema,
});

export const setProductStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(PRODUCT_STATUSES as unknown as [string, ...string[]]),
});

export const deleteProductSchema = z.object({
  id: z.uuid(),
  /**
   * Required and non-trivial. A deletion nobody explained is a deletion
   * nobody can review later, and this string lands in `audit_log.reason`.
   */
  reason: z.string().trim().min(5).max(500),
});

export type ProductWriteValues = z.infer<typeof productWriteSchema>;
export type ProductTranslationValues = z.infer<typeof productTranslationSchema>;
