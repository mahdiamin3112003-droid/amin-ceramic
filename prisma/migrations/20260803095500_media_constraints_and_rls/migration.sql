-- =============================================================================
-- 0012 · Media domain — generated columns, triggers, constraints, RLS
-- docs/03-database-design.md §4, §5.6, §12, §16
-- =============================================================================

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER "media_asset_set_updated_at"
  BEFORE UPDATE ON "media_asset"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── product.primary_media_id — §4.3, §5.6 ─────────────────────────────────────
--
-- A partial unique index enforces exactly one `primary` product_media row per
-- product. product.primary_media_id is then trigger-maintained from it so the
-- catalog grid renders many cards without a join per card.

CREATE UNIQUE INDEX "product_media_one_primary_idx"
  ON "product_media" ("product_id")
  WHERE "role" = 'primary';

CREATE OR REPLACE FUNCTION product_refresh_primary_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_product_id uuid;
BEGIN
  affected_product_id := COALESCE(NEW.product_id, OLD.product_id);

  UPDATE public.product
  SET primary_media_id = (
    SELECT pm.media_asset_id
    FROM public.product_media pm
    WHERE pm.product_id = affected_product_id
      AND pm.role = 'primary'
      AND pm.is_active
    LIMIT 1
  )
  WHERE id = affected_product_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "product_media_refresh_primary_insert_update"
  AFTER INSERT OR UPDATE ON "product_media"
  FOR EACH ROW EXECUTE FUNCTION product_refresh_primary_media();

CREATE TRIGGER "product_media_refresh_primary_delete"
  AFTER DELETE ON "product_media"
  FOR EACH ROW EXECUTE FUNCTION product_refresh_primary_media();

ALTER FUNCTION product_refresh_primary_media() SET search_path = '';

ALTER TABLE "product"
  ADD CONSTRAINT "product_primary_media_id_fkey"
  FOREIGN KEY ("primary_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL;


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "media_asset"
  ADD CONSTRAINT "media_asset_focal_point_x_range" CHECK ("focal_point_x" IS NULL OR ("focal_point_x" >= 0 AND "focal_point_x" <= 1)),
  ADD CONSTRAINT "media_asset_focal_point_y_range" CHECK ("focal_point_y" IS NULL OR ("focal_point_y" >= 0 AND "focal_point_y" <= 1)),
  ADD CONSTRAINT "media_asset_dominant_color_format" CHECK ("dominant_color" IS NULL OR "dominant_color" ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT "media_asset_width_positive" CHECK ("width" IS NULL OR "width" > 0),
  ADD CONSTRAINT "media_asset_height_positive" CHECK ("height" IS NULL OR "height" > 0),
  ADD CONSTRAINT "media_asset_bytes_non_negative" CHECK ("bytes" IS NULL OR "bytes" >= 0);

ALTER TABLE "product_media"
  ADD CONSTRAINT "product_media_sort_order_non_negative" CHECK ("sort_order" >= 0);

ALTER TABLE "upload"
  ADD CONSTRAINT "upload_bytes_non_negative" CHECK ("bytes" IS NULL OR "bytes" >= 0),
  ADD CONSTRAINT "upload_owner_present" CHECK ("visitor_id" IS NOT NULL OR "app_user_id" IS NOT NULL);


-- ── indexes — §12 ─────────────────────────────────────────────────────────────

CREATE INDEX "product_media_media_asset_id_idx" ON "product_media" ("media_asset_id");
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media" ("product_id", "sort_order");


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- media_asset/media_translation/product_media: tenant-scoped public-read
-- library content (the images themselves carry no confidentiality — only
-- product.status governs whether a page showing them is reachable), staff
-- write gated on media.manage. upload: private, owner-only (visitor or
-- app_user matching the session), plus staff read for ingestion/content
-- review.

ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_asset" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "media_asset_read" ON "media_asset"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND "deleted_at" IS NULL);

CREATE POLICY "media_asset_staff_write" ON "media_asset"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('media.manage'));

CREATE POLICY "media_asset_staff_update" ON "media_asset"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('media.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('media.manage'));

CREATE POLICY "media_asset_staff_delete" ON "media_asset"
  FOR DELETE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('media.manage'));


ALTER TABLE "media_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "media_translation_read" ON "media_translation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "media_asset" m
      WHERE m."id" = "media_translation"."media_asset_id"
        AND m."tenant_id" = app.tenant_id()
    )
  );

CREATE POLICY "media_translation_staff_write" ON "media_translation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "media_asset" m
      WHERE m."id" = "media_translation"."media_asset_id"
        AND m."tenant_id" = app.tenant_id()
        AND app.has_permission('media.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "media_asset" m
      WHERE m."id" = "media_translation"."media_asset_id"
        AND m."tenant_id" = app.tenant_id()
        AND app.has_permission('media.manage')
    )
  );


ALTER TABLE "product_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_media" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_media_read" ON "product_media"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_media"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND ((p."status" = 'published' AND p."deleted_at" IS NULL) OR app.has_permission('product.read'))
    )
  );

CREATE POLICY "product_media_staff_write" ON "product_media"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_media"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('media.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_media"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('media.manage')
    )
  );


ALTER TABLE "upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "upload" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "upload_owner_all" ON "upload"
  FOR ALL
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      ("visitor_id" IS NOT NULL AND "visitor_id" = app.visitor_id())
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
    )
  )
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND (
      ("visitor_id" IS NOT NULL AND "visitor_id" = app.visitor_id())
      OR ("app_user_id" IS NOT NULL AND "app_user_id" = app.app_user_id())
    )
  );

CREATE POLICY "upload_staff_read" ON "upload"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
