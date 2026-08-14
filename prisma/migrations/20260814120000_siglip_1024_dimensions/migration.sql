-- Visual embeddings: halfvec(1152) → halfvec(1024).
--
-- docs/01-architecture.md §6.2 specifies "SigLIP 2 (hosted inference), 1152".
-- 1152 is the hidden size of the SigLIP-2 **so400m** checkpoint. The model
-- actually provisioned — `varad-13/siglip-2-large` on Replicate — is the
-- ViT-Large checkpoint, which outputs **1024** dimensions. Confirmed twice
-- against reality, not assumed: a direct probe call returned a 1024-element
-- vector, and the first backfill attempt failed with pgvector's own
-- `expected 1152 dimensions, not 1024`.
--
-- The dimension count was never a load-bearing decision in docs/01 — nothing
-- downstream depends on 1152 specifically, it is simply "whatever SigLIP 2
-- outputs". The checkpoint is the decision; its dimension count follows from
-- it. Recorded in docs/adr/0019-siglip-checkpoint-dimensions.md.
--
-- `finder_session.query_visual_embedding` is resized in the same migration,
-- deliberately: it stores a Tile Finder query vector produced by the SAME
-- model, so leaving it at 1152 would reproduce this exact failure in Phase 6
-- instead of now.

-- ── Guard: refuse to run if either column holds data ──────────────────────
-- Both tables are empty today (verified before writing this), so the resize
-- is free. If that is ever untrue — a re-run against a populated database, a
-- restored backup — the conversion below would destroy real vectors, and a
-- silent loss of embeddings is close to undetectable: retrieval would simply
-- start returning nothing, with no error. Fail loudly instead.
DO $$
DECLARE
  embedding_rows bigint;
  session_rows   bigint;
BEGIN
  SELECT count(*) INTO embedding_rows FROM product_embedding
    WHERE visual_embedding IS NOT NULL;
  SELECT count(*) INTO session_rows FROM finder_session
    WHERE query_visual_embedding IS NOT NULL;

  IF embedding_rows > 0 OR session_rows > 0 THEN
    RAISE EXCEPTION
      'Refusing to resize visual embedding columns: % product_embedding row(s) '
      'and % finder_session row(s) hold vectors that this migration would '
      'discard. Re-embed with the new model into a fresh column instead.',
      embedding_rows, session_rows;
  END IF;
END $$;

-- ── product_embedding.visual_embedding ────────────────────────────────────
-- The HNSW index is dropped first: an index cannot survive a change to the
-- dimensionality of the column it covers. Recreated below with the identical
-- parameters and partial predicate from 20260803104000_ai_constraints_and_rls
-- (m = 16, ef_construction = 64, WHERE is_current) — not re-derived, copied,
-- so the two stay in step.
DROP INDEX IF EXISTS "product_embedding_visual_embedding_idx";

ALTER TABLE "product_embedding"
  ALTER COLUMN "visual_embedding" TYPE halfvec(1024)
  USING NULL::halfvec(1024);

CREATE INDEX "product_embedding_visual_embedding_idx"
  ON "product_embedding" USING hnsw ("visual_embedding" halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE "is_current";

-- ── finder_session.query_visual_embedding ─────────────────────────────────
-- No index on this column (it is stored for reproducibility, never searched),
-- so the type change stands alone.
ALTER TABLE "finder_session"
  ALTER COLUMN "query_visual_embedding" TYPE halfvec(1024)
  USING NULL::halfvec(1024);
