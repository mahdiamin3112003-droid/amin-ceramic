"use server";

import { revalidatePath } from "next/cache";

import type { QuoteBasket } from "@/domain/quote/entity";
import * as basketMutations from "@/application/use-cases/quote/basket-mutations";
import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  addBasketItemSchema,
  addZoneSchema,
  removeBasketItemSchema,
  removeZoneSchema,
  renameZoneSchema,
  setZoneDimensionsSchema,
  updateBasketItemSchema,
} from "@/lib/validation/quote";

/**
 * Basket Server Actions — the one boundary Client Components (the basket
 * drawer, the zone editor) actually call. Each action re-validates with the
 * same Zod schema the API route would use (docs/04-api-architecture.md
 * §19: the API boundary is authoritative, not just the client form), then
 * delegates to the use-case in `application/use-cases/quote/`.
 *
 * `revalidatePath` targets both locales' basket route: a Server Action has
 * no reliable way to read the current locale segment, and revalidating the
 * wrong one leaves the other locale's basket page stale.
 */
function revalidateBasket(): void {
  revalidatePath("/en/basket");
  revalidatePath("/ar/basket");
}

export async function addBasketItemAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = addBasketItemSchema.parse(input);
    // Locale drives which translation snapshot lands on the line item —
    // defaulted to "en" here because product data is locale-invariant for
    // pricing/packaging; callers needing the Arabic name snapshot pass it
    // explicitly once the basket UI is locale-aware (task #35+).
    const basket = await basketMutations.addBasketItem("en", parsed);
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to add basket item");
  }
}

export async function updateBasketItemAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = updateBasketItemSchema.parse(input);
    const basket = await basketMutations.updateBasketItem(
      parsed.itemId,
      parsed.requiredM2,
    );
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to update basket item");
  }
}

export async function removeBasketItemAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = removeBasketItemSchema.parse(input);
    const basket = await basketMutations.removeBasketItem(parsed.itemId);
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to remove basket item");
  }
}

export async function addZoneAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = addZoneSchema.parse(input);
    const basket = await basketMutations.addZone(parsed);
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to add zone");
  }
}

export async function renameZoneAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = renameZoneSchema.parse(input);
    const basket = await basketMutations.renameZone(parsed.zoneId, parsed.name);
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to rename zone");
  }
}

export async function removeZoneAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = removeZoneSchema.parse(input);
    const basket = await basketMutations.removeZone(parsed.zoneId);
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to remove zone");
  }
}

export async function setZoneDimensionsAction(
  input: unknown,
): Promise<ActionResult<QuoteBasket>> {
  try {
    const parsed = setZoneDimensionsSchema.parse(input);
    const basket = await basketMutations.setZoneDimensions(
      parsed.zoneId,
      parsed.areaM2,
      parsed.wastagePct,
    );
    revalidateBasket();
    return ok(basket);
  } catch (cause) {
    return fail(cause, "failed to set zone dimensions");
  }
}

export async function clearBasketAction(): Promise<ActionResult<null>> {
  try {
    await basketMutations.clearBasket();
    revalidateBasket();
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to clear basket");
  }
}
