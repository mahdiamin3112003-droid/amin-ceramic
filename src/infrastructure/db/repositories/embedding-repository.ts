import type { RankedMatch } from "@/domain/ai/retrieval-fusion";
import type { RequestTransaction } from "@/infrastructure/db/request-context";

/**
 * Raw SQL against `product_embedding`'s `halfvec` columns —
 * `prisma/ai.prisma` marks them `Unsupported(...)` because Prisma has no
 * native pgvector type, so the client cannot read or write them at all
 * through its normal API. Every function here is raw SQL by necessity, not
 * by choice, mirroring the same `Unsupported(...)` pattern already used for
 * `category.path` (ltree) elsewhere in the schema.
 */

function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(",")}]`;
}

export interface UpsertEmbeddingInput {
  readonly productId: string;
  readonly visualEmbedding: readonly number[];
  readonly semanticEmbedding: readonly number[];
  readonly visualModel: string;
  readonly semanticModel: string;
  readonly sourceMediaId: string | null;
  /** sha256 of the inputs that produced these vectors — see the backfill script's idempotency check. */
  readonly embeddingInputHash: string;
}

/**
 * Retire a product's current embedding, because the thing it describes
 * changed. Returns the number of rows retired (0 when the product was never
 * embedded — the ordinary case for a new product).
 *
 * ── Why demote rather than regenerate here ──
 * Regenerating needs a Replicate call, measured at 36s average and 212s at
 * worst (cold start). `withRequestContext` gives a transaction 15 seconds.
 * Embedding inside an admin mutation would therefore blow the transaction
 * timeout on essentially every save, hold a pooled connection while doing
 * it, and make a provider outage into "nobody can edit products" — for a
 * derived artefact that is not part of the product's truth.
 *
 * ── Why this is the RIGHT failure mode, not a lesser one ──
 * Retrieval filters `is_current = true`, so a retired row makes the product
 * temporarily INVISIBLE to search rather than findable by its stale
 * description or old photo. That is the trade docs/01 §6.3 already makes
 * explicit for low-confidence matches: "An AI feature that confidently
 * returns bad matches damages trust more than one that admits uncertainty."
 * A tile matched on a photo it no longer has is exactly such a bad match.
 *
 * `pnpm ai:backfill-embeddings` restores it; the run is idempotent and
 * keyed on `embedding_input_hash`, so it re-embeds only what changed.
 */
export async function retireProductEmbedding(
  tx: RequestTransaction,
  tenantId: string,
  productId: string,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE product_embedding
    SET is_current = false
    WHERE tenant_id = ${tenantId}::uuid
      AND product_id = ${productId}::uuid
      AND is_current = true
  `;
}

/** How many published products with a photo have no current embedding — the backlog `ai:backfill-embeddings` would clear. */
export async function countProductsNeedingEmbedding(
  tx: RequestTransaction,
  tenantId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM product p
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.deleted_at IS NULL
      AND p.primary_media_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM product_embedding pe
        WHERE pe.product_id = p.id AND pe.is_current = true
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

/** The `embedding_input_hash` of the current row, or null if none exists yet. */
export async function getCurrentEmbeddingHash(
  tx: RequestTransaction,
  tenantId: string,
  productId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ embedding_input_hash: string | null }[]>`
    SELECT embedding_input_hash
    FROM product_embedding
    WHERE tenant_id = ${tenantId}::uuid
      AND product_id = ${productId}::uuid
      AND is_current = true
    LIMIT 1
  `;
  return rows[0]?.embedding_input_hash ?? null;
}

/**
 * Writes a new current row and demotes any previous one — the re-index
 * pattern `prisma/ai.prisma`'s own comment describes: "a new model version
 * writes is_current = false rows; a single transaction flips the flags
 * once coverage hits 100%." At this slice's scale (one product at a time,
 * one model version) that flip happens per-product, in the same
 * transaction as the insert, rather than as a separate coverage-triggered
 * step — correct for a single product, and the mechanism generalises
 * without changes once a real re-index (a new model version) needs it.
 */
export async function upsertProductEmbedding(
  tx: RequestTransaction,
  tenantId: string,
  input: UpsertEmbeddingInput,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE product_embedding
    SET is_current = false
    WHERE tenant_id = ${tenantId}::uuid
      AND product_id = ${input.productId}::uuid
      AND is_current = true
  `;

  await tx.$executeRaw`
    INSERT INTO product_embedding (
      id, tenant_id, product_id,
      visual_embedding, semantic_embedding,
      visual_model, semantic_model,
      source_media_id, embedding_input_hash,
      is_current, generated_at
    ) VALUES (
      uuid_generate_v7(), ${tenantId}::uuid, ${input.productId}::uuid,
      ${toVectorLiteral(input.visualEmbedding)}::halfvec,
      ${toVectorLiteral(input.semanticEmbedding)}::halfvec,
      ${input.visualModel}, ${input.semanticModel},
      ${input.sourceMediaId}::uuid, ${input.embeddingInputHash},
      true, now()
    )
  `;
}

export interface AttributeFilter {
  readonly isIndoor?: boolean;
  readonly isOutdoor?: boolean;
  readonly finishKey?: string;
}

const RETRIEVAL_CANDIDATE_LIMIT = 60;

/**
 * Both kNN legs go through `app.search_product_embeddings`, a SECURITY
 * DEFINER function — NOT a direct query against `product_embedding`.
 *
 * That table is readable only by staff holding `ai.configure`, so a public
 * Tile Finder request selecting from it directly matched zero rows and
 * returned "no matches" with no error at all — indistinguishable from the
 * feature honestly declining to guess. Opening it with a permissive SELECT
 * policy would have fixed the symptom and let anyone copy every vector in
 * the catalogue; the function returns only `(product_id, distance)`.
 * See migration 20260815160000.
 */
async function searchEmbeddings(
  tx: RequestTransaction,
  tenantId: string,
  kind: "visual" | "semantic",
  queryEmbedding: readonly number[],
  filter: AttributeFilter | undefined,
): Promise<readonly RankedMatch[]> {
  // An absent vector means that leg cannot run — returning nothing is
  // correct, and passing an empty literal would be a cast error.
  if (queryEmbedding.length === 0) return [];

  const rows = await tx.$queryRaw<{ product_id: string; distance: number }[]>`
    SELECT product_id, distance
    FROM app.search_product_embeddings(
      ${tenantId}::uuid,
      ${toVectorLiteral(queryEmbedding)}::halfvec,
      ${kind}::text,
      ${RETRIEVAL_CANDIDATE_LIMIT}::int,
      ${filter?.isIndoor ?? null}::boolean,
      ${filter?.isOutdoor ?? null}::boolean,
      ${filter?.finishKey ?? null}::text
    )
  `;
  return rows.map((r) => ({ productId: r.product_id, distance: r.distance }));
}

/** docs/01-architecture.md §6.3 step 5a — visual kNN, top 60, published products only. */
export async function findByVisualSimilarity(
  tx: RequestTransaction,
  tenantId: string,
  queryEmbedding: readonly number[],
  filter?: AttributeFilter,
): Promise<readonly RankedMatch[]> {
  return searchEmbeddings(tx, tenantId, "visual", queryEmbedding, filter);
}

/** docs/01-architecture.md §6.3 step 5c — semantic kNN, top 60, same filter and scope as the visual leg. */
export async function findBySemanticSimilarity(
  tx: RequestTransaction,
  tenantId: string,
  queryEmbedding: readonly number[],
  filter?: AttributeFilter,
): Promise<readonly RankedMatch[]> {
  return searchEmbeddings(tx, tenantId, "semantic", queryEmbedding, filter);
}

/**
 * The taxonomy keys the vision model may answer with — see
 * `ExtractionVocabulary` in `providers/gemini-vision.ts` for why this is
 * read rather than hardcoded.
 *
 * Deliberately NOT filtered to keys that currently have products: a colour
 * the admin has defined but not yet used is still a legitimate reading of a
 * photograph, and constraining the model to only what is in stock would
 * teach it to mislabel anything new.
 */
export async function getExtractionVocabulary(
  tx: RequestTransaction,
  tenantId: string,
): Promise<{
  colorFamilies: readonly string[];
  surfaceLooks: readonly string[];
  finishes: readonly string[];
}> {
  const [colours, looks, finishes] = await Promise.all([
    tx.colorFamily.findMany({ where: { tenantId }, select: { key: true } }),
    tx.surfaceLook.findMany({ where: { tenantId }, select: { key: true } }),
    tx.finish.findMany({ where: { tenantId }, select: { key: true } }),
  ]);

  return {
    colorFamilies: colours.map((c) => c.key),
    surfaceLooks: looks.map((l) => l.key),
    finishes: finishes.map((f) => f.key),
  };
}
