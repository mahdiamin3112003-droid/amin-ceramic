import { z } from "zod";

/** Boundary schemas for staff, roles, trade accounts and settings (§14.5). */

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const roleKeys = z.array(z.string().trim().min(2).max(48)).max(10);

export const inviteStaffSchema = z.object({
  email: z.email().max(320),
  fullName: optionalText,
  // An invitation with no role produces an account that can sign in and see
  // nothing, which reads as a broken invitation rather than a deliberate one.
  roleKeys: roleKeys.min(1),
});

export const updateRolesSchema = z.object({
  id: z.uuid(),
  // Empty IS allowed here, unlike on invite: stripping someone back to no
  // roles is a legitimate way to park an account without suspending it.
  roleKeys,
});

export const setSuspendedSchema = z.object({
  id: z.uuid(),
  suspended: z.coerce.boolean(),
});

export const resetMfaSchema = z.object({ id: z.uuid() });

export const decideTradeAccountSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["pending", "approved", "rejected", "suspended"]),
    priceTierId: z
      .union([z.literal(""), z.uuid()])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    creditLimit: z
      .union([z.literal(""), z.coerce.number().min(0).max(10_000_000)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    paymentTermsDays: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(365)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    rejectionReason: optionalText,
  })
  // §14.5: approval assigns a tier. Enforced at the boundary too, because an
  // approved account on no tier silently bills at the public rate.
  .refine((v) => v.status !== "approved" || v.priceTierId !== null, {
    message: "approving a trade account needs a price tier",
    path: ["priceTierId"],
  })
  .refine((v) => v.status !== "rejected" || v.rejectionReason !== null, {
    message: "rejecting needs a reason the applicant can be told",
    path: ["rejectionReason"],
  });

export const updateSettingSchema = z.object({
  key: z.string().trim().min(1).max(120),
  // The raw string as typed; `parseSettingValue` turns it into the setting's
  // declared type, because only the row knows what that type is.
  raw: z.string().max(20_000),
});
