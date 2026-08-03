"use server";

import { requestSample } from "@/application/use-cases/quote/request-sample";
import { fail, ok, type ActionResult } from "@/application/actions/result";
import { requestSampleSchema } from "@/lib/validation/quote";

/**
 * PDP "Order a sample" action. The 3-per-30-days limit is a database
 * trigger error (src/infrastructure/db/repositories/sample-repository.ts) —
 * it surfaces here as a generic failure; the form should show a
 * rate-limit-flavoured message rather than parse `error` for specifics.
 */
export async function requestSampleAction(
  input: unknown,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const parsed = requestSampleSchema.parse(input);
    const result = await requestSample(parsed);
    return ok(result);
  } catch (cause) {
    return fail(cause, "failed to request sample");
  }
}
