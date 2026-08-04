import { z } from "zod";

import { LOST_REASONS } from "@/domain/admin/quote-request";

/**
 * Boundary schemas for quote-request admin operations.
 *
 * docs/04 §14.5 never specifies these — the spec covers users and settings
 * and stops. See `domain/admin/quote-request.ts` for the derived status
 * machine these validate against.
 */

const status = z.enum([
  "draft",
  "submitted",
  "acknowledged",
  "quoted",
  "negotiating",
  "won",
  "lost",
  "expired",
  "cancelled",
]);

export const setQuoteStatusSchema = z
  .object({
    id: z.uuid(),
    status,
    lostReason: z
      .union([z.literal(""), z.enum(LOST_REASONS)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
  })
  // Enforced at the boundary as well as in the use-case: losing a quote
  // without recording why is how a business ends up unable to say whether
  // it is losing on price or on lead time.
  .refine((v) => v.status !== "lost" || v.lostReason !== null, {
    message: "a reason is required when marking a quote lost",
    path: ["lostReason"],
  });

export const assignQuoteSchema = z.object({
  id: z.uuid(),
  // Empty string means "unassign", which is a real action — a card whose
  // owner has gone on leave needs to go back in the pool.
  appUserId: z
    .union([z.literal(""), z.uuid()])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});
