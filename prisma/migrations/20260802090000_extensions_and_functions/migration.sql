-- =============================================================================
-- 0001 · Extensions, UUIDv7, and the RLS claim helpers
-- docs/03-database-design.md §0.4, §16.2
--
-- Runs before any table, because uuid_generate_v7() is a column default and the
-- helper functions are referenced by every policy.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS "public";

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- `vector` (pgvector >= 0.7, for halfvec) and `pg_cron` are enabled in Phase 1
-- alongside the embedding and rollup tables that need them.


-- ── UUIDv7 ───────────────────────────────────────────────────────────────────
-- docs/03-database-design.md §0.1 revision 2 specifies UUIDv7 for domain
-- entities: time-ordered, so it has the index locality of a sequential key while
-- staying globally unique, and it does not leak row counts in public URLs.
--
-- §0.4 lists `pg_uuidv7` as a required extension. It is NOT in Supabase's
-- available-extension catalogue, so this is a pure-SQL equivalent built on
-- pgcrypto. Same layout, same ordering guarantees, no extension dependency —
-- and it works identically on a local Postgres. See docs/adr/0009-uuid-v7.md.
--
-- Implementation: take a v4 UUID for its random bits, overlay the first 48 bits
-- with a Unix-millisecond timestamp, then flip the version nibble from 0100 (v4)
-- to 0111 (v7). Postgres numbers bytea bits LSB-first within each byte, so the
-- version nibble of byte 6 is bits 52–55; setting 52 and 53 turns 0100 into 0111.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL SAFE
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(
            int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
            FROM 3
          )
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

COMMENT ON FUNCTION uuid_generate_v7() IS
  'Time-ordered UUIDv7 (RFC 9562). Stands in for the pg_uuidv7 extension, which Supabase does not offer. See docs/adr/0009-uuid-v7.md.';


-- ── updated_at ───────────────────────────────────────────────────────────────
-- §0.4: "updated_at maintained by trigger, not application code." Application
-- code forgets; a trigger cannot. It also catches writes from migrations, the
-- SQL console and background jobs, which application code never sees.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── RLS claim helpers ────────────────────────────────────────────────────────
-- docs/03-database-design.md §16.2 names these `auth.tenant_id()` etc. They live
-- in a dedicated `app` schema instead, because Supabase explicitly warns against
-- creating objects in the `auth` schema — that schema is owned by
-- supabase_auth_admin and its contents can be replaced during a platform
-- upgrade, which would silently drop every policy's predicate. Same functions,
-- same behaviour, a schema we own. See docs/adr/0010-rls-helper-schema.md.
--
-- STABLE, not VOLATILE: the planner then evaluates each once per query rather
-- than once per row. On a large table that is the difference between an index
-- scan and a sequential scan — §16.2 calls it the single biggest performance
-- decision in the RLS design.
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.jwt_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION app.tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(app.jwt_claims() ->> 'tenant_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(app.jwt_claims() ->> 'app_user_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.visitor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(app.jwt_claims() ->> 'visitor_id', '')::uuid;
$$;

-- Permissions are flattened into the token at issue time (§2.7), so a policy
-- can authorise without a join on every query.
CREATE OR REPLACE FUNCTION app.has_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    app.jwt_claims() -> 'permissions' ? permission,
    false
  );
$$;

COMMENT ON SCHEMA app IS
  'Application-owned helpers read by RLS policies. Deliberately not the auth schema, which Supabase reserves.';
