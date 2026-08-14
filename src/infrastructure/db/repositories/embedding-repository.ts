import { Prisma } from "@prisma/client";

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

function attributeFilterSql(filter: AttributeFilter | undefined) {
  const clauses: Prisma.Sql[] = [];
  if (filter?.isIndoor !== undefined) {
    clauses.push(Prisma.sql`p.is_indoor = ${filter.isIndoor}`);
  }
  if (filter?.isOutdoor !== undefined) {
    clauses.push(Prisma.sql`p.is_outdoor = ${filter.isOutdoor}`);
  }
  if (filter?.finishKey !== undefined) {
    clauses.push(Prisma.sql`f.key = ${filter.finishKey}`);
  }
  return clauses.length > 0
    ? Prisma.sql`AND ${Prisma.join(clauses, " AND ")}`
    : Prisma.empty;
}

const RETRIEVAL_CANDIDATE_LIMIT = 60;

/** docs/01-architecture.md §6.3 step 5a — visual kNN, top 60, published products only. */
export async function findByVisualSimilarity(
  tx: RequestTransaction,
  tenantId: string,
  queryEmbedding: readonly number[],
  filter?: AttributeFilter,
): Promise<readonly RankedMatch[]> {
  const rows = await tx.$queryRaw<{ product_id: string; distance: number }[]>`
    SELECT p.id AS product_id, (pe.visual_embedding <=> ${toVectorLiteral(queryEmbedding)}::halfvec) AS distance
    FROM product_embedding pe
    JOIN product p ON p.id = pe.product_id
    JOIN finish f ON f.id = p.finish_id
    WHERE pe.tenant_id = ${tenantId}::uuid
      AND pe.is_current = true
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      ${attributeFilterSql(filter)}
    ORDER BY pe.visual_embedding <=> ${toVectorLiteral(queryEmbedding)}::halfvec
    LIMIT ${RETRIEVAL_CANDIDATE_LIMIT}
  `;
  return rows.map((r) => ({ productId: r.product_id, distance: r.distance }));
}

/** docs/01-architecture.md §6.3 step 5c — semantic kNN, top 60, same filter and scope as the visual leg. */
export async function findBySemanticSimilarity(
  tx: RequestTransaction,
  tenantId: string,
  queryEmbedding: readonly number[],
  filter?: AttributeFilter,
): Promise<readonly RankedMatch[]> {
  const rows = await tx.$queryRaw<{ product_id: string; distance: number }[]>`
    SELECT p.id AS product_id, (pe.semantic_embedding <=> ${toVectorLiteral(queryEmbedding)}::halfvec) AS distance
    FROM product_embedding pe
    JOIN product p ON p.id = pe.product_id
    JOIN finish f ON f.id = p.finish_id
    WHERE pe.tenant_id = ${tenantId}::uuid
      AND pe.is_current = true
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      ${attributeFilterSql(filter)}
    ORDER BY pe.semantic_embedding <=> ${toVectorLiteral(queryEmbedding)}::halfvec
    LIMIT ${RETRIEVAL_CANDIDATE_LIMIT}
  `;
  return rows.map((r) => ({ productId: r.product_id, distance: r.distance }));
}
