-- =============================================================================
-- 0006 · Extensions into a dedicated schema; ltree, vector, pg_cron installed
-- docs/03-database-design.md §0.4, §9.1, §3.1 · docs/adr/0011-supabase-grants-and-hardening.md
--
-- Phase 0 left citext/pg_trgm/unaccent/btree_gin in `public` and documented it as
-- deferred until something actually exercised them (ADR 0011). Phase 1 is that
-- something: the ingestion domain's dedup logic and the catalog's fuzzy SKU search
-- both need pg_trgm/unaccent, and product_embedding needs `vector` fresh. Doing the
-- move now, rather than deferring again, is cheaper than doing it twice.
--
-- Verified safe before writing this migration: the database's default search_path
-- is `"$user", public, extensions` (confirmed via pg_db_role_setting), and none of
-- anon/authenticated/service_role have a role-level override. Every connection —
-- including PostgREST's — already resolves `extensions` schema objects unqualified.
-- pgcrypto and pg_stat_statements are already there (Supabase's own provisioning);
-- this migration brings the rest of the catalog's extensions in line with them.
--
-- `ltree` is required by category.path (§3.1) but is missing from §0.4's required-
-- extensions list — a gap in the document, flagged rather than silently patched.
-- =============================================================================

-- ── New extensions, installed directly into `extensions` ────────────────────────
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "ltree" SCHEMA extensions;

-- ── Move the four already installed in `public` ──────────────────────────────────
ALTER EXTENSION "citext" SET SCHEMA extensions;
ALTER EXTENSION "pg_trgm" SET SCHEMA extensions;
ALTER EXTENSION "unaccent" SET SCHEMA extensions;
ALTER EXTENSION "btree_gin" SET SCHEMA extensions;

COMMENT ON SCHEMA extensions IS
  'All Postgres extensions live here, never in public — the isolation Supabase''s security linter recommends. Every role''s search_path already includes this schema, so unqualified type/function names (citext, gen_random_uuid, similarity(), unaccent()) continue resolving without change.';
