import {
  retrieveProducts,
  type RetrievalParams,
} from "@/application/use-cases/ai/retrieve-core";
import type { FusedMatch } from "@/domain/ai/retrieval-fusion";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export {
  retrieveProducts,
  type RetrievalParams,
} from "@/application/use-cases/ai/retrieve-core";

/**
 * Public entry point — not yet called by anything (Tile Finder, Phase 6,
 * is out of scope for this slice), but complete: this is what a future
 * `/api/ai/tile-finder` route calls once it exists, resolving visitor
 * context the same way every other public use-case does
 * (`get-product-detail.ts` is the pattern this mirrors).
 *
 * Separate file from `retrieve-core.ts` on purpose — see that file's
 * header. This is the ONLY export here that should ever import
 * `request-context.ts`'s live bindings; a CLI script wanting the core
 * pipeline imports `retrieve-core.ts` directly, never this file.
 */
export async function findMatchingProducts(
  params: RetrievalParams,
): Promise<readonly FusedMatch[]> {
  const { tenantId } = await getRequestContext();
  return withRequestContext({ tenantId }, (tx) =>
    retrieveProducts(tx, tenantId, params),
  );
}
