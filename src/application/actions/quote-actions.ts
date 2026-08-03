"use server";

import { revalidatePath } from "next/cache";

import type { QuoteSubmissionResult } from "@/domain/quote/entity";
import { submitQuoteRequest } from "@/application/use-cases/quote/submit-quote";
import { fail, ok, type ActionResult } from "@/application/actions/result";
import { submitQuoteRequestSchema } from "@/lib/validation/quote";

/**
 * `/basket/request` submission. The honeypot field (`website`) is stripped
 * before it reaches the use-case — its only job is to have been filled by
 * a bot and never by a real visitor (docs/02-ux-blueprint.md's spam-
 * resistance note for the quote form).
 */
export async function submitQuoteRequestAction(
  input: unknown,
): Promise<ActionResult<QuoteSubmissionResult>> {
  try {
    const parsed = submitQuoteRequestSchema.parse(input);
    if (parsed.website) {
      return fail(
        new Error("submission rejected"),
        "failed to submit quote request",
      );
    }

    const result = await submitQuoteRequest({
      contactName: parsed.contactName,
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactPhone,
      companyName: parsed.companyName,
      notes: parsed.notes,
      source: parsed.source,
    });

    revalidatePath("/en/basket");
    revalidatePath("/ar/basket");
    return ok(result);
  } catch (cause) {
    return fail(cause, "failed to submit quote request");
  }
}
