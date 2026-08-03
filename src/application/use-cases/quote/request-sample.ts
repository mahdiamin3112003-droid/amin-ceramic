import type { RequestSampleInput } from "@/infrastructure/db/repositories/sample-repository";
import { requestSample as requestSampleRepo } from "@/infrastructure/db/repositories/sample-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

/**
 * PDP "Order a sample" action. The 3-per-30-days limit surfaces as a
 * Postgres trigger error the repository lets propagate — this use-case
 * does not re-check it, so callers should show a generic "try again later"
 * rather than parsing the error for a specific count.
 */
export async function requestSample(
  input: RequestSampleInput,
): Promise<{ reference: string }> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    requestSampleRepo(tx, tenantId, visitorId, input),
  );
}
