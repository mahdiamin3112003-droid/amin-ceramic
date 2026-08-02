# 0011 · PostgREST grants, function search_path, and the deferred extension move

**Status:** accepted (grants, search_path) · deferred (extension schema) · Phase 0

## What testing found

Once real Supabase credentials existed, `docs/03-database-design.md` §16 was
verified against a live project rather than assumed. Two things migrations
0001–0003 missed, neither visible from a local Postgres because they are
Supabase-specific:

**1. `anon` and `service_role` had no table or schema grants.** RLS policies
existed and were enabled, but every request failed _before_ a policy ran:
`anon` calling `/rest/v1/tenant` got `permission denied for schema app` (it
could not even call `app.tenant_id()`), and `service_role` got
`permission denied for table tenant`. Supabase's dashboard and migration
tooling apply default-privilege grants to `anon`/`authenticated`/`service_role`
automatically when a table is created through them. A table created by a plain
`CREATE TABLE` over a direct connection — which is how Prisma migrations
work — does not get that for free. `public` had the grant already, applied
once at project provisioning; the `app` schema, created fresh in migration
0001, never did.

**Fixed in migration 0004** (`grants_for_postgrest_roles`): `USAGE` and
`EXECUTE` on the `app` schema and its functions, `SELECT`/`INSERT`/`UPDATE` on
the three tables (deliberately no `DELETE` — see below), plus
`ALTER DEFAULT PRIVILEGES` so every table and function Phase 1 adds inherits
this without a follow-up migration.

**Verified against live PostgREST**, not just re-read: anonymous `SELECT` on
all three tables returns `[]`; anonymous `INSERT` into `tenant` is refused with
`"new row violates row-level security policy"` (RLS now actually reached);
`service_role` `SELECT` returns the real row (it bypasses RLS but still needed
the grant); `service_role` `DELETE` is refused with a grant error, because no
`DELETE` was ever granted — `tenant` and `app_user` are soft-deleted (§0.4) and
`visitor` rows are never deleted (§2.3), so the omission makes that a
database-enforced fact rather than a convention.

**2. Every function had a mutable `search_path`.** The Supabase security
advisor flagged all eight functions from migrations 0001–0003. An unpinned
search_path resolves unqualified names against whatever schema is first on the
_caller's_ path at call time, not the schema the function's author intended —
a role that can create objects earlier in that path can shadow a built-in and
hijack what the function actually calls. This matters most for
`app.has_permission()` and its siblings, since every RLS policy in the system
calls them.

**Fixed in migration 0005**: `ALTER FUNCTION … SET search_path = ''` on all
eight. Verified safe first — `gen_random_uuid()` has been a `pg_catalog`
built-in since Postgres 13, so despite living conceptually beside `pgcrypto`,
`uuid_generate_v7()` does not need the `extensions` schema on its path. None of
the eight functions reference anything outside `pg_catalog`. Confirmed working
after the change: `uuid_generate_v7()` and `app.jwt_claims()` both still
execute correctly.

## What is deferred

**`citext`, `pg_trgm`, `unaccent` and `btree_gin` are installed in `public`**,
which the advisor also flags (`extension_in_public`, WARN level). `pgcrypto`
and `pg_stat_statements` are already isolated in an `extensions` schema —
Supabase pre-provisions those there; the other four landed in `public` because
Prisma's `extensions = [...]` array has no per-extension schema option, and
`public` was first on the search path when the migration ran.

**Not fixed now.** Moving them is a materially bigger change than the two
above: `ALTER EXTENSION … SET SCHEMA extensions`, plus confirming every role's
effective `search_path` still resolves `citext` (already used as a column
_type_ on `email` and `slug` — safe for existing columns, since Postgres
resolves column types by OID at creation time, not by name on every access,
but any _future_ raw SQL naming `citext` unqualified would need `extensions` on
the path) and the trigram/unaccent functions the ingestion pipeline will use
for fuzzy search in Phase 1–2. That is exactly the kind of change that
deserves a deliberate pass with the search functionality it will affect, not a
reflexive fix bundled into unrelated grant work.

Revisit when Phase 1's fuzzy-search and dedup work (§9.5) lands, since that is
the point at which `pg_trgm` and `unaccent` actually get used and the correct
`search_path` becomes verifiable end to end rather than theoretical.
