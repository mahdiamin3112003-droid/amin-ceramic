-- =============================================================================
-- 0003 · Constraints, triggers and Row Level Security for the identity tables
-- docs/03-database-design.md §2.2, §2.3, §15.2, §16
--
-- Everything Prisma does not model: partial unique indexes, check constraints,
-- triggers, and RLS. §15.2 draws the line deliberately — Prisma owns tables,
-- columns, relations and B-tree indexes; SQL owns the rest.
-- =============================================================================

-- ── Partial unique indexes ───────────────────────────────────────────────────
-- §19.2: "Every uniqueness constraint is already tenant-scoped (UNIQUE
-- (tenant_id, sku), not UNIQUE (sku)). This is the single most expensive thing
-- to retrofit, because fixing it later requires resolving real collisions in
-- live data."
--
-- Partial on `deleted_at IS NULL` so a soft-deleted address can be reused —
-- otherwise deleting a user permanently burns their email address.
DROP INDEX IF EXISTS "app_user_tenant_id_email_idx";

CREATE UNIQUE INDEX "app_user_tenant_id_email_key"
  ON "app_user" ("tenant_id", "email")
  WHERE "deleted_at" IS NULL;

-- Retained separately as a lookup path, since the unique index above only
-- covers live rows and admin views need to find deleted ones.
CREATE INDEX "app_user_tenant_id_email_all_idx"
  ON "app_user" ("tenant_id", "email");


-- ── Check constraints ────────────────────────────────────────────────────────
-- §7.5 of docs/01-architecture.md: check constraints on percentages and codes.
-- Reaching the database constraint layer at runtime is treated as a defect
-- (docs/04-api-architecture.md §19.1) — these exist to make that defect loud.

ALTER TABLE "tenant"
  ADD CONSTRAINT "tenant_default_wastage_pct_range"
  CHECK ("default_wastage_pct" >= 0 AND "default_wastage_pct" <= 100);

ALTER TABLE "tenant"
  ADD CONSTRAINT "tenant_default_currency_format"
  CHECK ("default_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "tenant"
  ADD CONSTRAINT "tenant_supported_locales_not_empty"
  CHECK (array_length("supported_locales", 1) >= 1);

-- The default locale has to be one the tenant actually supports. Without this,
-- a one-character typo in settings makes every page fall back silently.
ALTER TABLE "tenant"
  ADD CONSTRAINT "tenant_default_locale_is_supported"
  CHECK ("default_locale" = ANY ("supported_locales"));

ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_preferred_currency_format"
  CHECK ("preferred_currency" IS NULL OR "preferred_currency" ~ '^[A-Z]{3}$');

-- E.164: leading +, then 1–15 digits, first digit non-zero. Normalisation
-- happens at the API boundary (§19.2 of the API document); this is the backstop.
ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_phone_e164"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9]\d{1,14}$');

ALTER TABLE "visitor"
  ADD CONSTRAINT "visitor_country_code_format"
  CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$');

-- A visitor merged into itself would make the merge-trail walk infinite.
ALTER TABLE "visitor"
  ADD CONSTRAINT "visitor_merge_not_self"
  CHECK ("merged_into_visitor_id" IS NULL OR "merged_into_visitor_id" <> "id");


-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE TRIGGER "tenant_set_updated_at"
  BEFORE UPDATE ON "tenant"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "app_user_set_updated_at"
  BEFORE UPDATE ON "app_user"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── The visitor claim invariant ──────────────────────────────────────────────
-- §2.3: "app_user_id … Set on claim; NEVER overwritten."
--
-- This is enforced here rather than in application code because it is a data
-- invariant, not a business rule: re-pointing a claimed visitor at a different
-- user would silently transfer that visitor's saved items, browsing history and
-- open quote requests to someone else. There is no code path that should be
-- able to do it, including a migration or a console session.
CREATE OR REPLACE FUNCTION visitor_claim_is_final()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.app_user_id IS NOT NULL
     AND NEW.app_user_id IS DISTINCT FROM OLD.app_user_id THEN
    RAISE EXCEPTION
      'visitor.app_user_id is set once and never reassigned (visitor %, claimed by %)',
      OLD.id, OLD.app_user_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "visitor_claim_is_final"
  BEFORE UPDATE ON "visitor"
  FOR EACH ROW EXECUTE FUNCTION visitor_claim_is_final();


-- ── Row Level Security ───────────────────────────────────────────────────────
-- docs/03-database-design.md §16.
--
-- RLS is DEFENCE IN DEPTH, not the primary control (§16.1). Authorisation is
-- enforced at three layers: middleware on the route, the withAuth wrapper on
-- every mutation, and these policies at the row. A bug in any one layer does not
-- expose data.
--
-- FORCE, not just ENABLE: without FORCE the policies do not apply to the table
-- owner, which is the role most application code actually connects as.
--
-- Server-side jobs and migrations connect as a BYPASSRLS role (`postgres` on
-- Supabase), so seeding and Phase 1 development are unaffected. Every
-- service-role code path passes tenant_id explicitly (§16.3).
--
-- These policies are deliberately in place from day one on three tables rather
-- than written across eighty at once in Phase 1. §19.2: policies enabled early
-- "are exercised continuously rather than written blind at conversion time".

ALTER TABLE "tenant"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_user" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "visitor"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor"  FORCE  ROW LEVEL SECURITY;

-- tenant: readable by anyone inside it (the public site needs the tenant's
-- locales, currency and wastage default to render), writable only with
-- tenant.manage, which only `owner` holds (§2.5).
CREATE POLICY "tenant_read" ON "tenant"
  FOR SELECT
  USING ("id" = app.tenant_id());

CREATE POLICY "tenant_manage" ON "tenant"
  FOR ALL
  USING ("id" = app.tenant_id() AND app.has_permission('tenant.manage'))
  WITH CHECK ("id" = app.tenant_id() AND app.has_permission('tenant.manage'));

-- app_user: you can read and update yourself; staff holding user.manage can act
-- across the tenant.
--
-- WITH CHECK matters as much as USING here: without it a user could UPDATE a row
-- INTO another tenant (§16.3), which is the classic way a tenant-isolation
-- policy leaks despite looking correct.
CREATE POLICY "app_user_self_read" ON "app_user"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND ("id" = app.app_user_id() OR app.has_permission('user.manage'))
  );

CREATE POLICY "app_user_self_update" ON "app_user"
  FOR UPDATE
  USING (
    "tenant_id" = app.tenant_id()
    AND ("id" = app.app_user_id() OR app.has_permission('user.manage'))
  )
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND ("id" = app.app_user_id() OR app.has_permission('user.manage'))
  );

CREATE POLICY "app_user_staff_write" ON "app_user"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = app.tenant_id() AND app.has_permission('user.manage')
  );

-- No DELETE policy: app_user is soft-deleted (§0.4). An operation with no policy
-- is denied by default, so this is the deletion ban, expressed by omission.

-- visitor: a guest sees only their own row, identified by the signed visitor
-- cookie the edge middleware translates into a claim. "Guests never receive a
-- token that can read another visitor's data" (§2.7).
CREATE POLICY "visitor_own_read" ON "visitor"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      "id" = app.visitor_id()
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
      OR app.has_permission('analytics.read')
    )
  );

CREATE POLICY "visitor_own_write" ON "visitor"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND "id" = app.visitor_id());

CREATE POLICY "visitor_own_update" ON "visitor"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND "id" = app.visitor_id())
  WITH CHECK ("tenant_id" = app.tenant_id() AND "id" = app.visitor_id());

-- No DELETE policy: "We never delete the old visitor row — analytics history
-- depends on it" (§2.3).
