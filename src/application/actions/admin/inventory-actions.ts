"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import { recordMovement } from "@/application/use-cases/admin/inventory";
import { MANUAL_MOVEMENT_TYPES } from "@/domain/admin/inventory";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const movementSchema = z.object({
  productId: z.uuid(),
  locationId: z.uuid(),
  lotNumber: z.string().trim().min(1).max(64),
  caliber: optionalText,
  shadeCode: optionalText,
  movementType: z.enum(MANUAL_MOVEMENT_TYPES),
  /**
   * A magnitude, not a signed value — `signedQuantity` applies the
   * direction. `count_correction` is the exception and may be negative,
   * which is why the floor is `-100000` rather than 0; the use-case is what
   * enforces the per-type rule.
   */
  quantityM2: z.coerce
    .number()
    .min(-100_000)
    .max(100_000)
    .refine((v) => v !== 0, {
      message: "quantity cannot be zero",
    }),
  quantityBoxes: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(100_000)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  reason: optionalText,
});

export async function recordMovementAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = movementSchema.parse(input);
    await recordMovement(parsed);

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/lots");
    revalidatePath("/admin/inventory/movements");
    // Stock status is a public catalogue facet, so the storefront's cached
    // pages are stale the moment this commits.
    revalidatePath("/[locale]", "layout");

    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to record stock movement");
  }
}
