-- =============================================================================
-- 0020 · Engagement domain — triggers, constraints, RLS
-- docs/03-database-design.md §8, §12, §16
-- =============================================================================

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER "project_set_updated_at"
  BEFORE UPDATE ON "project"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── product_view partitions — RLS, same gap as inventory_movement ───────────

ALTER TABLE "product_view_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_view_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_view_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_view_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_view_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_view_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_view_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_view_default" FORCE ROW LEVEL SECURITY;


-- ── stock_alert — §8.4 ────────────────────────────────────────────────────────
-- min_quantity_m2 matters: a contractor needing 340 m² doesn't want an alert
-- when 12 m² arrives. This trigger only flips status to 'notified' — actually
-- sending the email/WhatsApp is the platform domain's notification_delivery
-- concern, which doesn't exist yet.

CREATE OR REPLACE FUNCTION product_stock_evaluate_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stock_alert
  SET status = 'notified', notified_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND product_id = NEW.product_id
    AND status = 'active'
    AND (location_id IS NULL OR location_id = NEW.location_id)
    AND NEW.available_m2 >= min_quantity_m2;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "product_stock_evaluate_alerts"
  AFTER UPDATE OF "available_m2" ON "product_stock"
  FOR EACH ROW EXECUTE FUNCTION product_stock_evaluate_alerts();

ALTER FUNCTION product_stock_evaluate_alerts() SET search_path = '';

-- SECURITY DEFINER functions are exposed by PostgREST as public RPC
-- endpoints by default. This one is a trigger-only implementation detail —
-- unlike get_shared_project/submit_project_comment below, it has no business
-- being callable directly.
REVOKE EXECUTE ON FUNCTION product_stock_evaluate_alerts() FROM PUBLIC, anon, authenticated;


-- ── project sharing — §8.3 ───────────────────────────────────────────────────
-- Public read/comment is granted by token through these SECURITY DEFINER
-- functions, not by opening RLS on project/project_comment — RLS on both
-- stays owner/staff-only regardless of shares. SECURITY DEFINER lets the
-- function see rows RLS would otherwise hide from an anonymous caller; the
-- function itself is the access-control boundary, so it re-checks
-- expiry/revocation on every call rather than trusting the caller.

CREATE OR REPLACE FUNCTION get_shared_project(p_token text)
RETURNS SETOF "project"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT ps.project_id INTO v_project_id
  FROM public.project_share ps
  WHERE ps.token = p_token
    AND ps.revoked_at IS NULL
    AND (ps.expires_at IS NULL OR ps.expires_at > now());

  IF v_project_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.project_share
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE token = p_token;

  RETURN QUERY SELECT * FROM public.project p WHERE p.id = v_project_id;
END;
$$;

ALTER FUNCTION get_shared_project(text) SET search_path = '';
GRANT EXECUTE ON FUNCTION get_shared_project(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION submit_project_comment(p_token text, p_author_name text, p_body text, p_project_item_id uuid DEFAULT NULL)
RETURNS "project_comment"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_share public.project_share;
  v_comment public.project_comment;
BEGIN
  SELECT * INTO v_share
  FROM public.project_share
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND permission = 'comment';

  IF v_share.id IS NULL THEN
    RAISE EXCEPTION 'invalid or non-commentable share token' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.project_comment (project_id, project_item_id, share_id, author_name, body)
  VALUES (v_share.project_id, p_project_item_id, v_share.id, p_author_name, p_body)
  RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$;

ALTER FUNCTION submit_project_comment(text, text, text, uuid) SET search_path = '';
GRANT EXECUTE ON FUNCTION submit_project_comment(text, text, text, uuid) TO anon, authenticated;


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "project_zone"
  ADD CONSTRAINT "project_zone_area_m2_positive" CHECK ("area_m2" > 0),
  ADD CONSTRAINT "project_zone_wastage_pct_range" CHECK ("wastage_pct" >= 0 AND "wastage_pct" <= 100);

ALTER TABLE "project_item"
  ADD CONSTRAINT "project_item_quantity_m2_positive" CHECK ("quantity_m2" > 0);

ALTER TABLE "stock_alert"
  ADD CONSTRAINT "stock_alert_min_quantity_m2_positive" CHECK ("min_quantity_m2" > 0),
  ADD CONSTRAINT "stock_alert_contact_present" CHECK ("contact_email" IS NOT NULL OR "contact_phone" IS NOT NULL);


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────

ALTER TABLE "saved_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_item" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "saved_item_owner_all" ON "saved_item"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id())
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id());


ALTER TABLE "product_view" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_view" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_view_owner_insert" ON "product_view"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id());

CREATE POLICY "product_view_owner_read" ON "product_view"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('analytics.read')));


ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "project_owner_all" ON "project"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('content.manage')))
  WITH CHECK ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('content.manage')));


ALTER TABLE "project_zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_zone" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "project_zone_owner_all" ON "project_zone"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_zone"."project_id"
        AND p."tenant_id" = app.tenant_id()
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_zone"."project_id"
        AND p."tenant_id" = app.tenant_id()
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  );


ALTER TABLE "project_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_item" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "project_item_owner_all" ON "project_item"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_item"."project_id"
        AND p."tenant_id" = app.tenant_id()
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_item"."project_id"
        AND p."tenant_id" = app.tenant_id()
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  );


ALTER TABLE "project_share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_share" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "project_share_owner_all" ON "project_share"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_share"."project_id"
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_share"."project_id"
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  );


ALTER TABLE "project_comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_comment" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "project_comment_owner_read" ON "project_comment"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_comment"."project_id"
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  );

CREATE POLICY "project_comment_owner_write" ON "project_comment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_comment"."project_id"
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "project" p
      WHERE p."id" = "project_comment"."project_id"
        AND (p."visitor_id" = app.visitor_id() OR app.has_permission('content.manage'))
    )
  );


ALTER TABLE "stock_alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_alert" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "stock_alert_owner_select" ON "stock_alert"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('inventory.read')));

CREATE POLICY "stock_alert_owner_insert" ON "stock_alert"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id() AND "status" = 'active');

CREATE POLICY "stock_alert_owner_update" ON "stock_alert"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id())
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id() AND "status" = 'cancelled');
