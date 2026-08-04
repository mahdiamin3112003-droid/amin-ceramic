"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  createTaxonomyEntry,
  reorderTaxonomyEntries,
  setTaxonomyEntryActive,
  updateTaxonomyEntry,
} from "@/application/use-cases/admin/taxonomy";
import {
  createTaxonomySchema,
  reorderTaxonomySchema,
  setTaxonomyActiveSchema,
  updateTaxonomySchema,
} from "@/lib/validation/admin-taxonomy";

/**
 * Taxonomy Server Actions.
 *
 * `revalidatePath("/[locale]", "layout")` on every one of these: a filter
 * chip's name, colour and ORDER are all rendered into cached catalogue
 * pages. An editor who renames "Matt" to "Matte" and sees the storefront
 * unchanged will rename it again.
 */
function revalidateTaxonomy(resource: string) {
  revalidatePath(`/admin/taxonomy/${resource}`);
  revalidatePath("/admin/taxonomy");
  revalidatePath("/[locale]", "layout");
}

export async function createTaxonomyAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { resource, ...values } = createTaxonomySchema.parse(input);
    const created = await createTaxonomyEntry(resource, values);
    revalidateTaxonomy(resource);
    return ok(created);
  } catch (cause) {
    return fail(cause, "failed to create");
  }
}

export async function updateTaxonomyAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { resource, id, ...values } = updateTaxonomySchema.parse(input);
    await updateTaxonomyEntry(resource, id, values);
    revalidateTaxonomy(resource);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save");
  }
}

export async function setTaxonomyActiveAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { resource, id, isActive } = setTaxonomyActiveSchema.parse(input);
    await setTaxonomyEntryActive(resource, id, isActive);
    revalidateTaxonomy(resource);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change availability");
  }
}

export async function reorderTaxonomyAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { resource, ids } = reorderTaxonomySchema.parse(input);
    await reorderTaxonomyEntries(resource, ids);
    revalidateTaxonomy(resource);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to reorder");
  }
}
