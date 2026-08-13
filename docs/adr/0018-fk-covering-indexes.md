# 0018 · Indexing 29 foreign keys of 115, and why not the other 86

**Status:** accepted · before the real catalogue is loaded

## What prompted it

Supabase's performance advisor reported **114 unindexed foreign keys**
(a direct `pg_constraint` query found 115). The headline number invites
adding all of them. That would be wrong.

## What the number actually contains

|                        | Count        |
| ---------------------- | ------------ |
| Unindexed foreign keys | 115          |
| …on **empty** tables   | 82           |
| …on tables with rows   | 33           |
| Largest table involved | **160 rows** |

At 40–160 rows Postgres will not choose an index even where one exists — a
sequential scan of 40 rows is cheaper, and the planner knows it. **None of
these indexes makes anything faster today.**

That is not an argument against adding them. It is the reason to be precise
about why: adding an index to a 40-row table is instant, while adding one to
a 200k-row `product_view` later needs `CREATE INDEX CONCURRENTLY` and care.
This is cheap insurance bought while it is cheap.

## Decision

Index the **29** foreign keys that carry a real access pattern in shipped
code. Skip the other 86, deliberately.

**Indexed** — catalogue filter and facet columns (the listing `groupBy`s each
of them; the taxonomy guards count products by them before allowing a hide);
stock and lots per product and per warehouse; reverse product relations (the
similar-tiles and complete-the-look rails); the requests board and the
lot-crossing warning; wishlist reads; and identity — `role_permission
.permission_key` is on the hot path, since permission resolution runs on
every admin request through `app.resolve_staff_identity`.

**Not indexed, and why:**

- **82 on empty, future-phase tables** — analytics partitions, AI
  conversations and embeddings, ingestion staging, projects, connectors.
  Those phases have not written their queries yet, so any index now is a
  guess at an access pattern. They are also the highest-write tables in the
  schema (`product_view`, `analytics_event`), where a speculative index is an
  ongoing tax with no reader.
- **Every `tenant_id` foreign key.** This is a single-tenant deployment:
  every row carries the same value, so the index has one distinct key and the
  planner will never choose it. It would help exactly one operation —
  deleting a tenant — which will never happen.
- **`visitor.merged_into_visitor_id`** — the cross-device merge trail, written
  once and never queried.
- **`saved_item.project_id`** — projects are Tier 2 (docs/02 §8.2) and the
  table is empty.

Every index costs write throughput on every INSERT, UPDATE and DELETE.
Adding all 115 to satisfy a mechanical advisor would be paying that on the
schema's busiest tables to silence a warning rather than to serve a query.

## Single-column, not `(tenant_id, x)`

Postgres uses an index for a foreign-key constraint check only when the FK
column **leads** it, so the existing `(tenant_id, …)` composites do not cover
these. CLAUDE.md's rule — "`tenant_id` … leading every composite index" — is
untouched, because none of these are composite.

## The migration is hand-written, and had to be

`prisma migrate dev` cannot generate it: the shadow database fails on
`20260803090000_extensions_schema_and_ltree` with `schema "extensions" does
not exist`, because Supabase provides that schema and a fresh shadow database
does not.

`prisma migrate diff` against the live database is actively dangerous here.
It sees only the half of the schema Prisma owns (docs/03 §15.2), so
everything in the SQL-owned half reads as drift to remove. Its output opened
with:

```
DROP INDEX "product_sku_trgm_idx"      -- trigram SKU search
DROP INDEX "category_path_idx"         -- the ltree path
DROP INDEX "product_application_idx"   -- GIN
DROP INDEX "product_stock_..._key"     -- the NULLS NOT DISTINCT unique
DROP CONSTRAINT "product_primary_media_id_fkey"
ALTER TABLE "product" DROP COLUMN "color_lab", ADD COLUMN ...
```

Only the `CREATE INDEX` statements were kept. **Anyone regenerating this
migration with `migrate diff` will reintroduce those drops.** Verified after
applying: all five SQL-owned indexes intact, `color_lab` still present.

## Consequences

- 115 unindexed foreign keys → 86; on tables with rows, 33 → 4.
- The advisor will keep reporting the remaining 86. That is expected. This
  file is the answer to "why hasn't anyone fixed these".
- `CONCURRENTLY` was not used: Prisma runs a migration in one transaction and
  `CREATE INDEX CONCURRENTLY` cannot run inside one. Fine at 160 rows. Any
  index added to these tables **after** the real catalogue is loaded should be
  created concurrently, by hand, outside a migration.
- The remaining performance question is unrelated and still open: at 2,000
  products it is query time that grows, not the round-trip time that made the
  e2e suite flake (see the transaction-timeout diagnosis).

## Postscript: the e2e flake this work was blocked behind

Two full-suite runs failed while verifying this migration, on specs that
passed in isolation. Chasing it produced a diagnosis worth recording, because
the wrong conclusion was reached twice on the way.

**Two false starts, both from an incomplete grep.** `signInAction` logs three
distinct failures — `sign-in rejected`, `credential accepted but no active
staff record`, and `sign-in failed`. Only the first was ever searched for, so
"no environmental signature appeared" was claimed twice when the search could
not have found one. A theory that run-scoped account sharing had hit a
Supabase per-user rate limit was also floated and is **retracted**: no
rate-limit code appears in any captured log.

**What it actually is.** A full run captured with no pipe filtering shows a
`403 user_not_found` raised inside Supabase's `mfa.enroll` / `_useSession` —
not in sign-in at all. `createTestStaff`'s `waitForAuthUser` waits for the
auth user to become READABLE; it does not, and cannot, wait for that user to
become usable by MFA enrolment. The two-factor block is the only block that
enrols MFA on a freshly created account, which is why it is the only one that
flakes.

Confirmed by three independent observations: the block passes 20/20 under
`--repeat-each=5` in isolation; it fails only under full-suite load; and the
failing stack frame is `_enroll`, never the sign-in path.

**Not fixed, deliberately.** The gap lives inside Supabase's own account
propagation, between two states it does not expose separately. A retry around
enrolment would mask a real product behaviour the suite exists to observe, and
a fixed sleep is a guess that rots. Recorded here so the next person does not
spend the afternoon re-deriving it — and so that a green run is not mistaken
for the flake being gone. One pass does not disprove a race.
