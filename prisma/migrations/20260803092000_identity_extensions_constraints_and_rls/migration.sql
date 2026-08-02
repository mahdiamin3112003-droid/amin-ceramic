-- =============================================================================
-- 0008 · Constraints, triggers and RLS for role, permission, role_permission,
--        user_role, trade_account
-- docs/03-database-design.md §2.4 – §2.6, §15.2, §16
-- =============================================================================

-- ── Check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "role"
  ADD CONSTRAINT "role_key_format"
  CHECK ("key" ~ '^[a-z][a-z0-9_]*$');

-- Dot-separated lowercase segments — product.create, price.trade.read. This is
-- the vocabulary shape every permission key in §2.5 follows.
ALTER TABLE "permission"
  ADD CONSTRAINT "permission_key_format"
  CHECK ("key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');

ALTER TABLE "trade_account"
  ADD CONSTRAINT "trade_account_credit_limit_non_negative"
  CHECK ("credit_limit" IS NULL OR "credit_limit" >= 0);

ALTER TABLE "trade_account"
  ADD CONSTRAINT "trade_account_payment_terms_non_negative"
  CHECK ("payment_terms_days" IS NULL OR "payment_terms_days" >= 0);

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- Only trade_account carries updated_at; role/permission/role_permission/
-- user_role are either append-only or immutable-once-granted (§2.4).

CREATE TRIGGER "trade_account_set_updated_at"
  BEFORE UPDATE ON "trade_account"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
--
-- role / role_permission / user_role are staff-administered, not visitor- or
-- customer-facing. §2.4: "only owner can manage roles (otherwise an admin can
-- grant themselves anything, which makes the whole matrix decorative)" — so
-- role.manage, not user.manage, gates every write to all three tables:
-- defining a role, changing what it grants, and assigning it to a user are the
-- same trust boundary, because any of the three can be used to escalate.
--
-- Reading the role list is broader than writing it: user.manage-holders need
-- to see available roles when assigning one to a user, even though only
-- role.manage can create or reassign one.

ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "role_staff_read" ON "role"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (app.has_permission('user.manage') OR app.has_permission('role.manage'))
  );

CREATE POLICY "role_manage" ON "role"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('role.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('role.manage'));

-- permission: a global vocabulary, not tenant-scoped (§2.4 — "the vocabulary is
-- the same everywhere"). Readable by anyone; the keys are not sensitive, and
-- the RLS predicate has no tenant_id to filter on even if it wanted to. Writes
-- are confined to migrations and seed — no policy exists for INSERT/UPDATE/
-- DELETE, which denies them by default for every role including owner.
ALTER TABLE "permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "permission_read" ON "permission"
  FOR SELECT
  USING (true);

-- role_permission and user_role have no tenant_id of their own — both are
-- pure join rows keyed off role_id/app_user_id, whose tenancy comes from the
-- role/app_user they reference. The policy joins back to role to establish
-- tenancy, mirroring how a junction table's RLS has to work when it carries
-- no discriminator column itself.
ALTER TABLE "role_permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permission" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "role_permission_staff_read" ON "role_permission"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "role_permission"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND (app.has_permission('user.manage') OR app.has_permission('role.manage'))
    )
  );

CREATE POLICY "role_permission_manage" ON "role_permission"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "role_permission"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND app.has_permission('role.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "role_permission"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND app.has_permission('role.manage')
    )
  );

ALTER TABLE "user_role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_role" FORCE  ROW LEVEL SECURITY;

-- A user may always see their own role assignments (the JWT already carries
-- role_keys[] per §2.7, but the admin "your roles" screen still reads this
-- table directly), in addition to staff with visibility into the roster.
CREATE POLICY "user_role_read" ON "user_role"
  FOR SELECT
  USING (
    "app_user_id" = app.app_user_id()
    OR EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "user_role"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND (app.has_permission('user.manage') OR app.has_permission('role.manage'))
    )
  );

CREATE POLICY "user_role_manage" ON "user_role"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "user_role"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND app.has_permission('role.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "role" r
      WHERE r."id" = "user_role"."role_id"
        AND r."tenant_id" = app.tenant_id()
        AND app.has_permission('role.manage')
    )
  );

-- trade_account: the applicant reads and updates their own application (so the
-- trade-signup flow works without an admin in the loop); staff with
-- user.manage — there is no dedicated trade.* permission key in §2.5, and
-- approving a trade application is a user-status change in substance — read
-- and decide every application in the tenant.
ALTER TABLE "trade_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trade_account" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "trade_account_self_read" ON "trade_account"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND ("app_user_id" = app.app_user_id() OR app.has_permission('user.manage'))
  );

-- WITH CHECK pins every privileged field to its safe starting value, so a
-- self-service application can't insert itself pre-approved with a credit
-- line — status/approval/credit are staff-only from that point forward, via
-- the UPDATE policy below.
CREATE POLICY "trade_account_self_insert" ON "trade_account"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND "app_user_id" = app.app_user_id()
    AND "status" = 'pending'
    AND "approved_by" IS NULL
    AND "approved_at" IS NULL
    AND "credit_limit" IS NULL
  );

CREATE POLICY "trade_account_staff_update" ON "trade_account"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('user.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('user.manage'));

-- No DELETE policy anywhere in this migration: role assignments, permission
-- grants and trade applications are all business history, not disposable rows.
-- An operation with no policy is denied by default.
