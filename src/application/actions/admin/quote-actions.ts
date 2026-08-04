"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  assignQuoteToStaff,
  moveQuote,
} from "@/application/use-cases/admin/quote-requests";
import {
  assignQuoteSchema,
  setQuoteStatusSchema,
} from "@/lib/validation/admin-quote";

/**
 * No `revalidatePath("/[locale]")` here, unlike the catalogue actions: a
 * request's pipeline status is internal. Nothing a customer sees changes
 * when a card moves from New to Acknowledged.
 */
function revalidateRequests(id?: string) {
  revalidatePath("/admin/requests");
  if (id) revalidatePath(`/admin/requests/${id}`);
}

export async function moveQuoteAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const { id, status, lostReason } = setQuoteStatusSchema.parse(input);
    await moveQuote(id, status, lostReason);
    revalidateRequests(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to move this request");
  }
}

export async function assignQuoteAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, appUserId } = assignQuoteSchema.parse(input);
    await assignQuoteToStaff(id, appUserId);
    revalidateRequests(id);
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to assign this request");
  }
}
