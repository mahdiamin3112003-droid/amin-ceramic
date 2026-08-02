-- =============================================================================
-- 0004 · Grants for the PostgREST roles
-- docs/03-database-design.md §16
--
-- Found by testing, not assumed: with only migration 0003 applied, `anon`
-- requesting /rest/v1/tenant got "permission denied for schema app", and
-- `service_role` got "permission denied for table tenant" with the hint
-- "GRANT SELECT ON public.tenant TO service_role". RLS was never actually
-- being exercised — every request failed at the grant layer before a policy
-- ran at all.
--
-- The cause: Supabase's dashboard and migration tooling apply a default-
-- privilege grant to anon/authenticated/service_role automatically when a
-- table is created through them. Tables created by a plain `CREATE TABLE`
-- over a direct connection — which is how Prisma migrations work — do not
-- get that for free. `public` had it already (applied once at project
-- provisioning); `app`, created in migration 0001, never did.
--
-- §16.1: "RLS is defence in depth, not the primary control." Grants are what
-- RLS depends on to run at all — a role with no SELECT grant never reaches a
-- USING clause. Both layers have to be right.
-- =============================================================================

-- PostgREST calls app.tenant_id() etc. as anon/authenticated/service_role.
-- Without USAGE, the role cannot even see the schema to call the function —
-- this is the exact failure `anon` hit above.
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app
  TO anon, authenticated, service_role;

-- Every RLS helper added in Phase 1 onward inherits this without a follow-up
-- migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Table-level DML. RLS policies still filter which ROWS each role sees; this
-- is the separate, necessary permission to attempt the operation at all.
-- `anon` needs INSERT on visitor (guests get a row lazily on first save,
-- docs/03 §2.3) and UPDATE on visitor (last_seen_at) and app_user (self-edit).
GRANT SELECT, INSERT, UPDATE ON tenant TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON app_user TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON visitor TO anon, authenticated, service_role;

-- No DELETE grant anywhere: tenant and app_user are soft-deleted (§0.4), and
-- visitor rows are never deleted (§2.3 — analytics history depends on them).
-- Omitting the grant makes that a database-enforced fact, not just a policy.

-- Applies to every table Phase 1 adds in the public schema, so this migration
-- does not need a sequel each time a new domain lands.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO anon, authenticated, service_role;

-- Append-only tables (docs/03 §0.4: "bigint generated always as identity")
-- need sequence usage to insert at all. None exist yet; this makes the first
-- one work without a follow-up grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO anon, authenticated, service_role;
