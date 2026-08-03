"use server";

import { revalidatePath } from "next/cache";

import * as wishlist from "@/application/use-cases/quote/wishlist";
import { fail, ok, type ActionResult } from "@/application/actions/result";
import { wishlistToggleSchema } from "@/lib/validation/quote";

function revalidateWishlistSurfaces(): void {
  revalidatePath("/en/products", "page");
  revalidatePath("/ar/products", "page");
}

export async function addToWishlistAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = wishlistToggleSchema.parse(input);
    await wishlist.addToWishlist(parsed.productId);
    revalidateWishlistSurfaces();
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to add to wishlist");
  }
}

export async function removeFromWishlistAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = wishlistToggleSchema.parse(input);
    await wishlist.removeFromWishlist(parsed.productId);
    revalidateWishlistSurfaces();
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to remove from wishlist");
  }
}
