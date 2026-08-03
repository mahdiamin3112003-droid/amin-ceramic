-- =============================================================================
-- 0030 · tenant — allow public read (fixes a bootstrap circularity)
-- =============================================================================
--
-- Gap found while wiring the RLS-constrained app_runtime role: `tenant_read`
-- required `id = app.tenant_id()`, but tenant_id itself is only known AFTER
-- the app resolves which tenant a request belongs to — for a non-superuser
-- connection, that resolution IS a query against this table. The policy was
-- circular: nothing could ever satisfy it on a bare connection with no
-- claims yet.
--
-- Fix: tenant identification (slug, name, locale/currency defaults) is not
-- sensitive — every real multi-tenant SaaS exposes an equivalent "look up
-- workspace by slug/hostname" read for exactly this bootstrap reason. Only
-- SELECT changes; `tenant_manage` (INSERT/UPDATE/DELETE, gated on
-- tenant.manage permission + id match) is untouched.

DROP POLICY "tenant_read" ON "tenant";

CREATE POLICY "tenant_read" ON "tenant"
  FOR SELECT
  USING (true);
