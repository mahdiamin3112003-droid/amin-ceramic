"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  createProduct,
  deleteProduct,
  saveProductTranslation,
  setProductStatus,
  updateProduct,
} from "@/application/use-cases/admin/products";
import type { ProductStatus } from "@/domain/admin/product";
import {
  createProductSchema,
  deleteProductSchema,
  saveTranslationSchema,
  setProductStatusSchema,
  updateProductSchema,
} from "@/lib/validation/admin-product";

/**
 * Server Actions for admin product mutations.
 *
 * Each does exactly three things: parse with Zod, call the use-case, and
 * revalidate. No authorisation logic — that is `adminMutation`'s job, one
 * layer down, where it runs inside the same transaction as the write.
 *
 * `revalidatePath` covers the PUBLIC routes as well as the admin ones. A
 * published product edit that only refreshed the admin table would leave
 * the storefront serving the old cached page, and the person who made the
 * change is the last to notice.
 */

function revalidateProduct(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}`);
  // Both locales — `[locale]` is a dynamic segment, so this is the layout
  // covering every catalogue page beneath it.
  revalidatePath("/[locale]", "layout");
}

export async function createProductAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createProductSchema.parse(input);
    const created = await createProduct(parsed);
    revalidateProduct(created.id);
    return ok(created);
  } catch (cause) {
    return fail(cause, "failed to create product");
  }
}

export async function updateProductAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, product } = updateProductSchema.parse(input);
    await updateProduct(id, product);
    revalidateProduct(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to update product");
  }
}

export async function saveProductTranslationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, translation } = saveTranslationSchema.parse(input);
    await saveProductTranslation(id, translation);
    revalidateProduct(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save translation");
  }
}

export async function setProductStatusAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, status } = setProductStatusSchema.parse(input);
    await setProductStatus(id, status as ProductStatus);
    revalidateProduct(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change product status");
  }
}

export async function deleteProductAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, reason } = deleteProductSchema.parse(input);
    await deleteProduct(id, reason);
    revalidateProduct(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to delete product");
  }
}
