import { z } from "zod";

import { KEYED_TAXONOMIES } from "@/domain/admin/taxonomy";

/**
 * Boundary schemas for the taxonomy family — docs/04 §14.1.
 */

const resource = z.enum(KEYED_TAXONOMIES);

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

/**
 * The immutable identifier. Lowercase, dot/underscore/hyphen separated.
 *
 * Constrained hard because it is referenced BY CODE as well as by data
 * (§14.1) — `slipRating === "R11"` style lookups and seed constants key off
 * these. A key with a space or a capital in it becomes a permanent
 * inconsistency the moment a product references it.
 */
const taxonomyKey = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
    "lowercase letters, digits and . _ - only, starting with a letter",
  );

/** Both locales are always submitted; a blank Arabic name is allowed at draft. */
const translations = z
  .array(
    z.object({
      locale: z.enum(["en", "ar"]),
      name: z.string().trim().max(120),
      description: optionalText,
    }),
  )
  .min(1)
  .max(2);

const colorHex = z
  .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullable()
  .default(null);

/** 0–40%. Above 40 is not a laying pattern, it is a mistake. */
const wastagePct = z
  .union([z.literal(""), z.coerce.number().min(0).max(40)])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

export const createTaxonomySchema = z.object({
  resource,
  key: taxonomyKey,
  colorHex,
  defaultWastagePct: wastagePct,
  /**
   * The form always submits BOTH locales, and Arabic is legitimately blank
   * at creation — an entry is created hidden and cannot go live until every
   * locale is filled in (§14.1), so demanding both up front would make it
   * impossible to start one.
   *
   * So blanks are accepted and then stripped; what is required is that at
   * least ONE name survives, because a row with no name in any language is
   * not something anyone can find again.
   */
  translations: translations
    .transform((rows) => rows.filter((t) => t.name.trim() !== ""))
    .refine((rows) => rows.length > 0, {
      message: "at least one name is required",
    }),
});

export const updateTaxonomySchema = z.object({
  resource,
  id: z.uuid(),
  colorHex,
  defaultWastagePct: wastagePct,
  translations,
});

export const setTaxonomyActiveSchema = z.object({
  resource,
  id: z.uuid(),
  isActive: z.coerce.boolean(),
});

export const reorderTaxonomySchema = z.object({
  resource,
  // The complete visible list, in its new order — see `reorder()`.
  ids: z.array(z.uuid()).min(1).max(500),
});

export type CreateTaxonomyValues = z.infer<typeof createTaxonomySchema>;
export type UpdateTaxonomyValues = z.infer<typeof updateTaxonomySchema>;
