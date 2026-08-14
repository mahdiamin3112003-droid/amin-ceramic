# 0019 · The visual embedding is 1024-d, not the specified 1152

**Status:** accepted · Phase 5, before any embedding was written

## What docs/01 says

§6.2's dual-vector table:

| Vector             | Model                           | Dim      |
| ------------------ | ------------------------------- | -------- |
| `visual_embedding` | **SigLIP 2** (hosted inference) | **1152** |

`prisma/ai.prisma` and migration `20260803103500_ai_tables` implemented that
literally: `halfvec(1152)`.

## What is actually true

**1152 is the hidden size of one particular SigLIP 2 checkpoint — so400m.**
It is not a property of "SigLIP 2". The family ships in several sizes, and
the checkpoint provisioned for this project, `varad-13/siglip-2-large` on
Replicate, is the ViT-Large one: **1024 dimensions**.

docs/01 §6.2 names the model family and a host category ("hosted inference")
but no specific checkpoint. The 1152 was an assumption about which checkpoint
would be chosen, written before one had been.

## How this surfaced

Not by reading the docs — by running it:

1. A direct probe call against the configured model returned a
   1024-element vector (and, separately, revealed the output is
   batch-wrapped `[[…]]` rather than a flat array — the client's parser was
   wrong about that too and was corrected).
2. The first real backfill then failed on pgvector's own check:
   `ERROR: expected 1152 dimensions, not 1024`.

Both are recorded here because the sequence matters: the schema constraint
caught a mismatch that would otherwise have been discovered much later, as
silently degraded retrieval.

## Decision

**Resize to `halfvec(1024)`** and keep the confirmed-working checkpoint,
rather than hunting for a so400m deployment to satisfy the number.

The dimension count was never a load-bearing decision. Nothing downstream
reads 1152 as a constant: the retrieval queries are dimension-agnostic, HNSW
parameters (`m = 16, ef_construction = 64`) are unaffected, and the
calibration mapping operates on cosine distance, which is normalised. The
**checkpoint** is the decision; its dimension count follows from it.

Migration `20260814120000_siglip_1024_dimensions` also resizes
`finder_session.query_visual_embedding`, which stores a Tile Finder query
vector from the same model — leaving it at 1152 would have reproduced this
exact failure in Phase 6 rather than fixing it once.

## The migration refuses to run against data

Both columns were empty when this was applied (verified directly first), so
the conversion is free. But `ALTER COLUMN … USING NULL::halfvec(1024)`
would silently discard real vectors if either table were populated — a
re-run, a restored backup — and lost embeddings are close to undetectable:
retrieval simply starts returning nothing, with no error anywhere. The
migration therefore opens with a `DO` block that raises if either column
holds a non-null value, on the same fail-closed principle as
`prisma/guard-destructive.ts`.

## Consequences

- If a so400m checkpoint is ever adopted for quality reasons, this is a
  second resize plus a full re-embed — not a schema mistake to avoid, just
  the cost of changing models, which the `is_current` flag in
  `product_embedding` already exists to manage.
- docs/01 §6.2's table is now wrong on this row. It should be read as
  "SigLIP 2, dimension per checkpoint", and this file is the correction.
