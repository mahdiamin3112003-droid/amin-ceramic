-- =============================================================================
-- 0029 · app_runtime — the application's own non-superuser DB role
-- =============================================================================
--
-- Gap found while starting Phase 2: DATABASE_URL/DIRECT_URL connect as the
-- `postgres` superuser (Supabase's pooler connection strings are all
-- postgres.PROJECT). Postgres never applies row-level security to
-- superusers, regardless of FORCE ROW LEVEL SECURITY — so every RLS policy
-- built across Phase 1 has been silently unenforced on the connection the
-- app actually uses at runtime. It only "worked" during Phase 1 verification
-- because those checks explicitly ran as `SET LOCAL role = anon/authenticated`
-- to simulate a real client, never as the app's real connection.
--
-- Fix: a dedicated LOGIN role for the app's own Prisma client (distinct from
-- the migration/seed connection, which legitimately needs superuser DDL
-- rights). No policy in this schema branches on current_user/current_role
-- (confirmed: zero matches across pg_policies) — every policy reads
-- request.jwt.claims via the app.* helper functions instead — so a single
-- role, granted the same table privileges `authenticated` already has via
-- migration 0004's ALTER DEFAULT PRIVILEGES, is sufficient for both
-- anonymous-visitor and authenticated-staff request contexts. The
-- application differentiates those purely by what it puts in
-- request.jwt.claims per request (src/infrastructure/db/request-context.ts).
--
-- Password is set out-of-band (ALTER ROLE app_runtime PASSWORD '...', run
-- directly against the project, never committed) — the same posture as the
-- existing postgres password already not being in this repo.

CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;

GRANT authenticated TO app_runtime;

-- CONNECT is needed on top of table-level grants — role membership inherits
-- table privileges but not the database-level CONNECT privilege.
GRANT CONNECT ON DATABASE postgres TO app_runtime;
GRANT USAGE ON SCHEMA public, app TO app_runtime;
