import { z } from "zod";

/** Boundary schemas for collections and brands — docs/04 §14.1. */

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const optionalShort = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

/**
 * Unicode-aware: an Arabic slug is legitimate, so `[a-z0-9-]` would be
 * wrong. What must not appear is anything that breaks routing.
 */
const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[^\s/?#]+$/, "no spaces or / ? #")
  .transform((v) => v.toLowerCase());

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const collectionTranslations = z
  .array(
    z.object({
      locale: z.enum(["en", "ar"]),
      name: z.string().trim().max(200),
      description: optionalText,
      seoTitle: optionalShort,
      seoDescription: optionalShort,
    }),
  )
  .min(1)
  .max(2);

const collectionBody = {
  slug,
  brandId: optionalUuid,
  heroMediaId: optionalUuid,
  isFeatured: z.coerce.boolean().default(false),
};

export const createCollectionSchema = z.object({
  ...collectionBody,
  // Blanks stripped, at least one real name required — same reasoning as
  // the taxonomy create schema: the form always submits both locales and
  // Arabic is legitimately empty at draft.
  translations: collectionTranslations
    .transform((rows) => rows.filter((t) => t.name.trim() !== ""))
    .refine((rows) => rows.length > 0, {
      message: "at least one name is required",
    }),
});

export const updateCollectionSchema = z.object({
  id: z.uuid(),
  ...collectionBody,
  translations: collectionTranslations,
});

export const setCollectionStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "published", "archived"]),
});

export const deleteCollectionSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(5).max(500),
});

// ── Brands ───────────────────────────────────────────────────────────────────

export const createBrandSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  originCountry: z
    .union([z.literal(""), z.string().length(2)])
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .nullable()
    .default(null),
  websiteUrl: z
    .union([z.literal(""), z.url().max(500)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export const updateBrandSchema = createBrandSchema
  // The slug is immutable after creation: it is in published URLs, and
  // changing it silently breaks every inbound link to the brand page.
  .omit({ slug: true })
  .extend({ id: z.uuid() });

export const setBrandActiveSchema = z.object({
  id: z.uuid(),
  isActive: z.coerce.boolean(),
});
