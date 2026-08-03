-- =============================================================================
-- 0031 · DELETE grants — fixes a systemic gap found via app_runtime testing
-- =============================================================================
--
-- Migration 0004 deliberately omitted DELETE for tenant/app_user/visitor
-- ("Omitting the grant makes that a database-enforced fact, not just a
-- policy") — a sound decision for those three specific tables. But its
-- blanket `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT,
-- UPDATE ON TABLES` then silently generalised that no-delete posture to
-- every table every later domain migration created — including tables that
-- clearly need row deletion by design (saved_item wishlist removal,
-- quote_request_zone removal, app_setting/url_redirect/feature_flag staff
-- deletes, and more). This was invisible through Phase 1 because every
-- verification query ran as the postgres superuser, which bypasses grants
-- entirely — it only surfaced now, testing the real app_runtime role
-- end-to-end for Phase 2's wishlist repository (permission denied for table
-- saved_item, not an RLS-empty-result — a grant-layer failure, one level
-- below RLS).
--
-- Fix: grant DELETE broadly (future tables via ALTER DEFAULT PRIVILEGES,
-- existing tables backfilled below), preserving the original no-delete
-- posture only where it was actually intentional: tenant/app_user/visitor
-- (§0.4 soft-delete / §2.3 "visitor rows are never deleted"), and
-- audit_log/inventory_movement + their partitions, which are independently
-- enforced append-only by BEFORE DELETE triggers (§11.3, §6.4) — denying
-- the grant too is redundant defence-in-depth for those two, not new
-- behaviour.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT DELETE ON TABLES TO anon, authenticated, service_role;

DO $$
DECLARE
  tbl text;
  excluded text[] := ARRAY[
    'tenant', 'app_user', 'visitor',
    'audit_log', 'audit_log_2026_08', 'audit_log_2026_09', 'audit_log_2026_10', 'audit_log_default',
    'inventory_movement', 'inventory_movement_2026_08', 'inventory_movement_2026_09', 'inventory_movement_2026_10', 'inventory_movement_default',
    '_prisma_migrations'
  ];
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> ALL(excluded)
  LOOP
    EXECUTE format('GRANT DELETE ON %I TO anon, authenticated, service_role', tbl);
  END LOOP;
END $$;
