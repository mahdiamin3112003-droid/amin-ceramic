-- =============================================================================
-- 0028 · Platform domain — indexes, constraints, RLS
-- docs/03-database-design.md §11, §12, §16
-- =============================================================================

-- ── partitions — RLS, same pattern as every other partitioned table ─────────

ALTER TABLE "notification_delivery_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_default" FORCE ROW LEVEL SECURITY;

ALTER TABLE "connector_event_log_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log_default" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_log_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_default" FORCE ROW LEVEL SECURITY;


-- ── audit_log is append-only — §11.3 ──────────────────────────────────────────
-- "Not even the tenant owner can rewrite history." Enforced twice, same as
-- inventory_movement: no UPDATE/DELETE RLS policy at all, plus triggers that
-- reject the operation unconditionally (including for roles that bypass
-- RLS). Triggers, not rules, because they're inherited by every partition —
-- see the inventory_movement partitioning migration's note on why.

CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_reject_update"
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER "audit_log_reject_delete"
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

ALTER FUNCTION audit_log_reject_mutation() SET search_path = '';


-- ── outbox_event index — §11.2, given verbatim in the doc ────────────────────

CREATE INDEX ON "outbox_event" ("status", "available_at") WHERE "status" IN ('pending', 'failed');


-- ── NULLS NOT DISTINCT uniqueness ─────────────────────────────────────────────
-- notification_preference: keyed by whichever of app_user_id/visitor_id is
-- set — the other is always NULL, so a plain UNIQUE would never actually
-- prevent a duplicate preference row for the same owner. feature_flag:
-- tenant_id NULL means "global" (§11.4); same problem, same fix — the
-- product_stock roll-up row's pattern, reused twice more here.

CREATE UNIQUE INDEX "notification_preference_owner_category_channel_key"
  ON "notification_preference" ("app_user_id", "visitor_id", "category", "channel") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "feature_flag_key_tenant_id_key"
  ON "feature_flag" ("key", "tenant_id") NULLS NOT DISTINCT;


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "notification_preference"
  ADD CONSTRAINT "notification_preference_owner_present" CHECK ("app_user_id" IS NOT NULL OR "visitor_id" IS NOT NULL);

ALTER TABLE "notification_suppression"
  ADD CONSTRAINT "notification_suppression_contact_present" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

ALTER TABLE "feature_flag"
  ADD CONSTRAINT "feature_flag_rollout_percent_range" CHECK ("rollout_percent" >= 0 AND "rollout_percent" <= 100);

ALTER TABLE "url_redirect"
  ADD CONSTRAINT "url_redirect_status_code_valid" CHECK ("status_code" IN (301, 302, 307, 308)),
  ADD CONSTRAINT "url_redirect_not_self" CHECK ("from_path" <> "to_path");


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- notification_template/app_setting/feature_flag/url_redirect: staff config,
-- gated on settings.write (read open to any staff with content.manage for
-- url_redirect/feature_flag since those affect the public site, tighter
-- settings.write for the rest). connector_config/connector_event_log: staff
-- only, tenant.manage — these hold credentials_ref and integration health,
-- the most sensitive platform data. notification/notification_delivery/
-- outbox_event: staff read only (audit.read); no client write policy at all
-- — outbox rows are written inside the same transaction as the triggering
-- business change via the server-side service role (which bypasses RLS),
-- never directly by a client. notification_preference: owner only (privacy).
-- notification_suppression: staff only (settings.write) — a compliance list,
-- never visitor-readable. audit_log: staff read (audit.read) + staff insert
-- (any authenticated staff action can log itself); append-only enforced
-- above.

ALTER TABLE "notification_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_template" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "notification_template_staff_all" ON "notification_template"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'));


ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "notification_staff_read" ON "notification"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('audit.read'));


ALTER TABLE "notification_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "notification_delivery_staff_read" ON "notification_delivery"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "notification" n
      WHERE n."id" = "notification_delivery"."notification_id"
        AND n."tenant_id" = app.tenant_id()
        AND app.has_permission('audit.read')
    )
  );


ALTER TABLE "notification_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preference" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "notification_preference_owner_all" ON "notification_preference"
  FOR ALL
  USING (
    ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
    OR ("visitor_id" IS NOT NULL AND "visitor_id" = app.visitor_id())
  )
  WITH CHECK (
    ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
    OR ("visitor_id" IS NOT NULL AND "visitor_id" = app.visitor_id())
  );


ALTER TABLE "notification_suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_suppression" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "notification_suppression_staff_all" ON "notification_suppression"
  FOR ALL
  USING (app.has_permission('settings.write'))
  WITH CHECK (app.has_permission('settings.write'));


ALTER TABLE "connector_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_config" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "connector_config_staff_all" ON "connector_config"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('tenant.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('tenant.manage'));


ALTER TABLE "outbox_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_event" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "outbox_event_staff_read" ON "outbox_event"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('audit.read'));


ALTER TABLE "connector_event_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_event_log" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "connector_event_log_staff_read" ON "connector_event_log"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "connector_config" cc
      WHERE cc."id" = "connector_event_log"."connector_config_id"
        AND cc."tenant_id" = app.tenant_id()
        AND app.has_permission('tenant.manage')
    )
  );


ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "audit_log_staff_read" ON "audit_log"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('audit.read'));

CREATE POLICY "audit_log_staff_insert" ON "audit_log"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id());


ALTER TABLE "app_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_setting" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "app_setting_read" ON "app_setting"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("scope" = 'public' OR app.has_permission('settings.write')));

CREATE POLICY "app_setting_staff_write" ON "app_setting"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'));

CREATE POLICY "app_setting_staff_update" ON "app_setting"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'));

CREATE POLICY "app_setting_staff_delete" ON "app_setting"
  FOR DELETE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('settings.write'));


ALTER TABLE "feature_flag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "feature_flag_read" ON "feature_flag"
  FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = app.tenant_id());

CREATE POLICY "feature_flag_staff_write" ON "feature_flag"
  FOR INSERT
  WITH CHECK (("tenant_id" IS NULL OR "tenant_id" = app.tenant_id()) AND app.has_permission('settings.write'));

CREATE POLICY "feature_flag_staff_update" ON "feature_flag"
  FOR UPDATE
  USING (("tenant_id" IS NULL OR "tenant_id" = app.tenant_id()) AND app.has_permission('settings.write'))
  WITH CHECK (("tenant_id" IS NULL OR "tenant_id" = app.tenant_id()) AND app.has_permission('settings.write'));

CREATE POLICY "feature_flag_staff_delete" ON "feature_flag"
  FOR DELETE
  USING (("tenant_id" IS NULL OR "tenant_id" = app.tenant_id()) AND app.has_permission('settings.write'));


ALTER TABLE "url_redirect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "url_redirect" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "url_redirect_read" ON "url_redirect"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND "is_active");

CREATE POLICY "url_redirect_staff_write" ON "url_redirect"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "url_redirect_staff_update" ON "url_redirect"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "url_redirect_staff_delete" ON "url_redirect"
  FOR DELETE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
