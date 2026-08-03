import { z } from "zod";

/**
 * Quote basket / submission validation schemas — the API boundary layer.
 *
 * docs/04-api-architecture.md §11: max 50 line items, quantity 0.01-100,000
 * m², contact requires name + email-or-phone. §19: phone → E.164 by the
 * caller (not enforced here beyond shape — full E.164 normalisation is a
 * connector concern, Phase 9).
 */

const MAX_REQUIRED_M2 = 100_000;

export const addBasketItemSchema = z
  .object({
    productId: z.uuid(),
    requiredM2: z.number().min(0.01).max(MAX_REQUIRED_M2),
    zoneId: z.uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type AddBasketItemRequest = z.infer<typeof addBasketItemSchema>;

export const updateBasketItemSchema = z
  .object({
    itemId: z.uuid(),
    requiredM2: z.number().min(0.01).max(MAX_REQUIRED_M2),
  })
  .strict();

export const removeBasketItemSchema = z
  .object({
    itemId: z.uuid(),
  })
  .strict();

const spaceTypeSchema = z.enum([
  "kitchen",
  "bathroom",
  "living_room",
  "bedroom",
  "hallway",
  "outdoor",
  "commercial_space",
  "other",
]);

export const addZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    spaceType: spaceTypeSchema.optional(),
    areaM2: z.number().positive().max(MAX_REQUIRED_M2),
    wastagePct: z.number().min(0).max(50).default(10),
  })
  .strict();

export const renameZoneSchema = z
  .object({
    zoneId: z.uuid(),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const removeZoneSchema = z
  .object({
    zoneId: z.uuid(),
  })
  .strict();

export const setZoneDimensionsSchema = z
  .object({
    zoneId: z.uuid(),
    areaM2: z.number().positive().max(MAX_REQUIRED_M2),
    wastagePct: z.number().min(0).max(50),
  })
  .strict();

const quoteSourceSchema = z.enum([
  "catalog",
  "tile_finder",
  "assistant",
  "project",
  "showroom",
  "whatsapp",
  "direct",
]);

export const submitQuoteRequestSchema = z
  .object({
    contactName: z.string().trim().min(1).max(120),
    contactEmail: z.email().trim().toLowerCase().max(254).optional(),
    contactPhone: z.string().trim().min(6).max(20).optional(),
    companyName: z.string().trim().max(150).optional(),
    notes: z.string().trim().max(1000).optional(),
    source: quoteSourceSchema.default("catalog"),
    // Honeypot — a legitimate client never fills this; a bot form-filler
    // usually does. Checked, not rendered, at the application boundary.
    website: z.string().max(0).optional(),
  })
  .strict()
  .refine(
    (data) => data.contactEmail !== undefined || data.contactPhone !== undefined,
    {
      message: "either contactEmail or contactPhone is required",
    },
  );
export type SubmitQuoteRequestInput = z.infer<typeof submitQuoteRequestSchema>;

const sampleTypeSchema = z.enum(["chip", "full_tile", "board"]);
const fulfilmentTypeSchema = z.enum(["ship", "collect"]);

export const requestSampleSchema = z
  .object({
    productId: z.uuid(),
    sampleType: sampleTypeSchema,
    quantity: z.number().int().min(1).max(3),
    fulfilmentType: fulfilmentTypeSchema,
    locationId: z.uuid().optional(),
    shippingAddressLine1: z.string().trim().max(200).optional(),
    shippingCity: z.string().trim().max(100).optional(),
    shippingCountryCode: z.string().length(2).optional(),
  })
  .strict()
  .refine(
    (data) => data.fulfilmentType !== "collect" || data.locationId !== undefined,
    {
      message: "locationId is required when fulfilmentType is collect",
    },
  )
  .refine(
    (data) =>
      data.fulfilmentType !== "ship" || data.shippingAddressLine1 !== undefined,
    {
      message: "shippingAddressLine1 is required when fulfilmentType is ship",
    },
  );

export const wishlistToggleSchema = z
  .object({
    productId: z.uuid(),
  })
  .strict();
