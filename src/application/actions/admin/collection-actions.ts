"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  createBrandEntry,
  createCollectionEntry,
  deleteCollectionEntry,
  setBrandActiveEntry,
  setCollectionStatusEntry,
  updateBrandEntry,
  updateCollectionEntry,
} from "@/application/use-cases/admin/collections";
import {
  createBrandSchema,
  createCollectionSchema,
  deleteCollectionSchema,
  setBrandActiveSchema,
  setCollectionStatusSchema,
  updateBrandSchema,
  updateCollectionSchema,
} from "@/lib/validation/admin-collection";

/**
 * Collections and brands are both rendered into cached storefront pages —
 * a collection has its own route, and a brand name appears on every product
 * carrying it — so every mutation invalidates the public layout too.
 */
function revalidateCollections(id?: string) {
  revalidatePath("/admin/collections");
  if (id) revalidatePath(`/admin/collections/${id}`);
  revalidatePath("/[locale]", "layout");
}

export async function createCollectionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createCollectionSchema.parse(input);
    const created = await createCollectionEntry(parsed);
    revalidateCollections(created.id);
    return ok(created);
  } catch (cause) {
    return fail(cause, "failed to create the collection");
  }
}

export async function updateCollectionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, ...values } = updateCollectionSchema.parse(input);
    await updateCollectionEntry(id, values);
    revalidateCollections(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save the collection");
  }
}

export async function setCollectionStatusAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, status } = setCollectionStatusSchema.parse(input);
    await setCollectionStatusEntry(id, status);
    revalidateCollections(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change the collection's status");
  }
}

export async function deleteCollectionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, reason } = deleteCollectionSchema.parse(input);
    await deleteCollectionEntry(id, reason);
    revalidateCollections(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to delete the collection");
  }
}

export async function createBrandAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createBrandSchema.parse(input);
    const created = await createBrandEntry(parsed);
    revalidateCollections();
    return ok(created);
  } catch (cause) {
    return fail(cause, "failed to create the brand");
  }
}

export async function updateBrandAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, ...values } = updateBrandSchema.parse(input);
    await updateBrandEntry(id, values);
    revalidateCollections();
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save the brand");
  }
}

export async function setBrandActiveAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, isActive } = setBrandActiveSchema.parse(input);
    await setBrandActiveEntry(id, isActive);
    revalidateCollections();
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change the brand");
  }
}
