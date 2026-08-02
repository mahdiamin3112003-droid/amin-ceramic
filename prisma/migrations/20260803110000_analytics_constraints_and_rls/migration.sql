-- =============================================================================
-- 0026 · Analytics domain — constraints, RLS
-- docs/03-database-design.md §10, §16
-- =============================================================================

-- ── analytics_event partitions — RLS, same pattern as the other partitioned
-- tables ──────────────────────────────────────────────────────────────────────

ALTER TABLE "analytics_event_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event_default" FORCE ROW LEVEL SECURITY;


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "daily_product_stat"
  ADD CONSTRAINT "daily_product_stat_conversion_rate_range" CHECK ("conversion_rate" IS NULL OR ("conversion_rate" >= 0 AND "conversion_rate" <= 1));

ALTER TABLE "daily_ai_stat"
  ADD CONSTRAINT "daily_ai_stat_error_rate_range" CHECK ("error_rate" IS NULL OR ("error_rate" >= 0 AND "error_rate" <= 1)),
  ADD CONSTRAINT "daily_ai_stat_cache_hit_rate_range" CHECK ("cache_hit_rate" IS NULL OR ("cache_hit_rate" >= 0 AND "cache_hit_rate" <= 1)),
  ADD CONSTRAINT "daily_ai_stat_mean_confidence_range" CHECK ("mean_confidence" IS NULL OR ("mean_confidence" >= 0 AND "mean_confidence" <= 1)),
  ADD CONSTRAINT "daily_ai_stat_positive_feedback_rate_range" CHECK ("positive_feedback_rate" IS NULL OR ("positive_feedback_rate" >= 0 AND "positive_feedback_rate" <= 1));


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- analytics_event: anyone (including anon) can write their own beacon —
-- visitor_id must match the session, same client-analytics pattern as
-- product_view; read is staff-only (analytics.read). daily_*_stat rollups:
-- staff read only (analytics.read); no client write policy at all — they're
-- populated by pg_cron via service_role, which bypasses RLS, the same
-- posture as product_stock's trigger-only writes.

ALTER TABLE "analytics_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_event" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "analytics_event_owner_insert" ON "analytics_event"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND ("visitor_id" IS NULL OR "visitor_id" = app.visitor_id()));

CREATE POLICY "analytics_event_staff_read" ON "analytics_event"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));


ALTER TABLE "daily_product_stat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_product_stat" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "daily_product_stat_staff_read" ON "daily_product_stat"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));


ALTER TABLE "daily_search_stat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_search_stat" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "daily_search_stat_staff_read" ON "daily_search_stat"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));


ALTER TABLE "daily_filter_stat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_filter_stat" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "daily_filter_stat_staff_read" ON "daily_filter_stat"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));


ALTER TABLE "daily_ai_stat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_ai_stat" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "daily_ai_stat_staff_read" ON "daily_ai_stat"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));


ALTER TABLE "daily_quote_stat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_quote_stat" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "daily_quote_stat_staff_read" ON "daily_quote_stat"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('analytics.read'));
