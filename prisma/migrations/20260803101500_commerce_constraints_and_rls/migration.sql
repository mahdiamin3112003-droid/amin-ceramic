-- =============================================================================
-- 0016 · Commerce domain — triggers, constraints, RLS
-- docs/03-database-design.md §7, §12, §16
-- =============================================================================

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER "quote_request_set_updated_at"
  BEFORE UPDATE ON "quote_request"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── sample_request_item — 3-sample limit per visitor per 30 days — §7.5 ──────
-- "Shipped samples write `sample` movements to the inventory ledger" (§7.5) is
-- NOT implemented as a DB trigger here: unlike the 3-sample cap (a pure count
-- constraint), picking which stock_lot a shipped sample debits is a business
-- decision the app makes explicitly, the same way §6.7 has the app write
-- `reservation` movements rather than inferring them — Phase 1 has no
-- Server Actions yet to hold that logic. Flagging per CLAUDE.md rule 5 rather
-- than guessing a lot-selection algorithm into a trigger.

CREATE OR REPLACE FUNCTION sample_request_item_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_visitor_id uuid;
  recent_count integer;
BEGIN
  SELECT visitor_id INTO target_visitor_id
  FROM public.sample_request
  WHERE id = NEW.sample_request_id;

  SELECT coalesce(sum(sri.quantity), 0) INTO recent_count
  FROM public.sample_request_item sri
  JOIN public.sample_request sr ON sr.id = sri.sample_request_id
  WHERE sr.visitor_id = target_visitor_id
    AND sr.requested_at >= now() - interval '30 days'
    AND sri.status <> 'cancelled';

  IF recent_count + NEW.quantity > 3 THEN
    RAISE EXCEPTION 'sample limit of 3 per visitor per 30 days exceeded (already has %, requesting %)', recent_count, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sample_request_item_enforce_limit"
  BEFORE INSERT ON "sample_request_item"
  FOR EACH ROW EXECUTE FUNCTION sample_request_item_enforce_limit();

ALTER FUNCTION sample_request_item_enforce_limit() SET search_path = '';


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "quote_request_zone"
  ADD CONSTRAINT "quote_request_zone_area_m2_positive" CHECK ("area_m2" > 0),
  ADD CONSTRAINT "quote_request_zone_wastage_pct_range" CHECK ("wastage_pct" >= 0 AND "wastage_pct" <= 100);

ALTER TABLE "quote_request_item"
  ADD CONSTRAINT "quote_request_item_quantity_m2_positive" CHECK ("quantity_m2" > 0),
  ADD CONSTRAINT "quote_request_item_line_total_non_negative" CHECK ("line_total" >= 0);

ALTER TABLE "quote_request"
  ADD CONSTRAINT "quote_request_reference_format" CHECK ("reference" ~ '^[A-Z]{2,4}-[0-9]{4}-[0-9]{3,6}$');

ALTER TABLE "sample_request"
  ADD CONSTRAINT "sample_request_reference_format" CHECK ("reference" ~ '^[A-Z]{2,4}-[0-9]{4}-[0-9]{3,6}$');

ALTER TABLE "sample_request_item"
  ADD CONSTRAINT "sample_request_item_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <= 3);

ALTER TABLE "showroom_booking"
  ADD CONSTRAINT "showroom_booking_duration_positive" CHECK ("duration_minutes" > 0),
  ADD CONSTRAINT "showroom_booking_party_size_positive" CHECK ("party_size" IS NULL OR "party_size" > 0);


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- quote_request/sample_request/showroom_booking: owner (visitor or app_user
-- matching the session) can insert and read their own; staff read/write
-- gated on request.read / request.respond. Child tables (zone, item, status
-- history) mirror the parent's visibility via a join — the parent's
-- visibility rule is the single source of truth for "who can see this quote".

ALTER TABLE "quote_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_request" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "quote_request_owner_select" ON "quote_request"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      "visitor_id" = app.visitor_id()
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
      OR app.has_permission('request.read')
    )
  );

CREATE POLICY "quote_request_owner_insert" ON "quote_request"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND "visitor_id" = app.visitor_id()
    AND "status" = 'draft'
  );

CREATE POLICY "quote_request_staff_update" ON "quote_request"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'));


ALTER TABLE "quote_request_zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_request_zone" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "quote_request_zone_read" ON "quote_request_zone"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_zone"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR (qr."app_user_id" IS NOT NULL AND qr."app_user_id" = app.app_user_id()) OR app.has_permission('request.read'))
    )
  );

CREATE POLICY "quote_request_zone_write" ON "quote_request_zone"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_zone"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_zone"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  );


ALTER TABLE "quote_request_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_request_item" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "quote_request_item_read" ON "quote_request_item"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_item"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR (qr."app_user_id" IS NOT NULL AND qr."app_user_id" = app.app_user_id()) OR app.has_permission('request.read'))
    )
  );

CREATE POLICY "quote_request_item_write" ON "quote_request_item"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_item"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_request_item"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  );


ALTER TABLE "quote_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_status_history" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "quote_status_history_read" ON "quote_status_history"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_status_history"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR (qr."app_user_id" IS NOT NULL AND qr."app_user_id" = app.app_user_id()) OR app.has_permission('request.read'))
    )
  );

CREATE POLICY "quote_status_history_staff_insert" ON "quote_status_history"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_status_history"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND app.has_permission('request.respond')
    )
  );


ALTER TABLE "sample_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sample_request" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "sample_request_owner_select" ON "sample_request"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      "visitor_id" = app.visitor_id()
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
      OR app.has_permission('request.read')
    )
  );

CREATE POLICY "sample_request_owner_insert" ON "sample_request"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND "visitor_id" = app.visitor_id()
    AND "status" = 'requested'
  );

CREATE POLICY "sample_request_staff_update" ON "sample_request"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'));


ALTER TABLE "sample_request_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sample_request_item" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "sample_request_item_read" ON "sample_request_item"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "sample_request" sr
      WHERE sr."id" = "sample_request_item"."sample_request_id"
        AND sr."tenant_id" = app.tenant_id()
        AND (sr."visitor_id" = app.visitor_id() OR (sr."app_user_id" IS NOT NULL AND sr."app_user_id" = app.app_user_id()) OR app.has_permission('request.read'))
    )
  );

CREATE POLICY "sample_request_item_write" ON "sample_request_item"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "sample_request" sr
      WHERE sr."id" = "sample_request_item"."sample_request_id"
        AND sr."tenant_id" = app.tenant_id()
        AND (sr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "sample_request" sr
      WHERE sr."id" = "sample_request_item"."sample_request_id"
        AND sr."tenant_id" = app.tenant_id()
        AND (sr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  );


ALTER TABLE "showroom_booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "showroom_booking" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "showroom_booking_owner_select" ON "showroom_booking"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      ("visitor_id" IS NOT NULL AND "visitor_id" = app.visitor_id())
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
      OR app.has_permission('request.read')
    )
  );

CREATE POLICY "showroom_booking_owner_insert" ON "showroom_booking"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND "visitor_id" = app.visitor_id()
    AND "status" = 'requested'
  );

CREATE POLICY "showroom_booking_staff_update" ON "showroom_booking"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('request.respond'));
