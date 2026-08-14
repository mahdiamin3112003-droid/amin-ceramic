import { fuseRankings, type FusedMatch } from "@/domain/ai/retrieval-fusion";
import {
  findByVisualSimilarity,
  findBySemanticSimilarity,
  type AttributeFilter,
} from "@/infrastructure/db/repositories/embedding-repository";
import type { RequestTransaction } from "@/infrastructure/db/request-context";

/**
 * Hybrid retrieval, tx-first core — docs/01-architecture.md §6.3 steps 4–5.
 *
 * Deliberately separate from `retrieve.ts`: this file takes NO runtime
 * (value) import of `request-context.ts`, only the `RequestTransaction`
 * TYPE, which TypeScript erases entirely at compile time. `request-context.ts`
 * constructs the Prisma client at module scope and throws immediately if
 * `RUNTIME_DATABASE_URL` is unset (by design — see `db/client.ts`) — fine
 * inside a Next request, fatal the moment a plain CLI script or a vitest
 * file merely IMPORTS a module that pulls it in, whether or not that code
 * path is ever called. `retrieval-fusion.test.ts` hit exactly this before
 * `fuseRankings` was moved to the domain layer; this is the same fix
 * applied one level up, for the same reason: `evaluate-retrieval.ts` (a
 * CLI script, its own raw transaction, no request context) needs
 * `retrieveProducts` without pulling in code that assumes a live request.
 *
 * The fusion math itself lives in `src/domain/ai/retrieval-fusion.ts`
 * (pure, unit tested there); this file is the orchestration around it —
 * running both kNN legs and fusing their results.
 *
 * Steps 6 (cross-encoder rerank) and 7 (grounded explanation) are Tile
 * Finder result-screen concerns, not retrieval-core ones, and are out of
 * scope for this slice per the Phase 5 plan.
 */

const DEFAULT_RESULT_LIMIT = 12;

export interface RetrievalParams {
  readonly visualEmbedding: readonly number[];
  readonly semanticEmbedding: readonly number[];
  readonly filter?: AttributeFilter;
  readonly limit?: number;
}

/**
 * Sequential, not `Promise.all` — see the project memory on
 * `withRequestContext` concurrency: two queries racing for the same
 * transaction's single connection is the exact shape of the P2028 issue
 * documented there, not just a page-level concern.
 */
export async function retrieveProducts(
  tx: RequestTransaction,
  tenantId: string,
  params: RetrievalParams,
): Promise<readonly FusedMatch[]> {
  const visual = await findByVisualSimilarity(
    tx,
    tenantId,
    params.visualEmbedding,
    params.filter,
  );
  const semantic = await findBySemanticSimilarity(
    tx,
    tenantId,
    params.semanticEmbedding,
    params.filter,
  );

  return fuseRankings(visual, semantic).slice(
    0,
    params.limit ?? DEFAULT_RESULT_LIMIT,
  );
}
