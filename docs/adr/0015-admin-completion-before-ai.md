# 0015 · Finishing the admin before Phase 5, and why the roadmap could not stay as written

**Status:** accepted · between Phase 4 and Phase 5

## What docs/01 §10 says

| #   | Phase                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| 5   | AI retrieval core — embedding pipeline, pgvector + HNSW, hybrid search, **evaluation harness with a labelled test set** |
| 6   | Tile Finder                                                                                                             |
| 7   | Interior Assistant                                                                                                      |
| 8   | Admin AI ingestion — _"Then: bulk-load the real catalog."_                                                              |
| 9   | Launch hardening                                                                                                        |

## The problem

Phase 1's deliverable was specced as _"seed data (~40 real products from your
catalog)"_. That never happened — the seed is placeholder data, because the
client's catalogue has not been supplied.

Phase 5 inherits that assumption and cannot survive it. An embedding pipeline
over invented products produces embeddings of invented products; a "labelled
test set" needs real tiles for a human to label; and score calibration tuned
against placeholders has to be redone the moment real data lands in Phase 8.

So the roadmap contains a real ordering conflict: **Phase 5 needs the
catalogue that Phase 8 loads.** Nobody noticed because Phase 1 was expected to
have provided a representative sample.

## Decision

Complete the operational back office before starting Phase 5:

- taxonomy CRUD (the nine-resource family in docs/04 §14.1)
- the quote-requests board (docs/02 §2.6)
- settings, staff and roles, trade accounts (docs/04 §14.5)

None of it depends on real product data. All of it is what the client uses to
GET real product data in by hand, which also de-risks Phase 8 — an ingestion
pipeline that writes into screens nobody has used is a pipeline whose output
nobody can check.

This is a deviation from the numbered roadmap, but it follows the roadmap's
own stated rationale: _"Business value first, brand theatre second, AI
third."_

## What this is NOT

It is not a renumbering. Phases 5–9 keep their numbers and their contents.
This slice is unnumbered on purpose, because inventing "Phase 6" for it is
exactly the mistake that produced the confusion this ADR exists to correct:
during Phase 4 these sections were annotated "(Phase 6)" and "(Phase 7)" in
`CLAUDE.md` and in code comments, colliding with the real Phase 6 (Tile
Finder) and Phase 7 (Interior Assistant) and misleading a later reader into
believing the roadmap specified it.

## When Phase 5 becomes startable

When there is a real catalogue to embed — either supplied directly, or loaded
through Phase 8's ingestion, which may therefore need to move ahead of Phase 5. That reordering is not decided here; it is flagged so it is a decision
rather than a surprise.

## Related

- `docs/01-architecture.md` §10 — the roadmap this departs from
- `docs/04-api-architecture.md` §14.1, §14.5 — what the slice implements
