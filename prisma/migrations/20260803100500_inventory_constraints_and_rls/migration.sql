-- =============================================================================
-- 0014 · Inventory domain — generated columns, triggers, constraints, RLS
-- docs/03-database-design.md §6, §12, §16
-- =============================================================================

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER "location_set_updated_at"
  BEFORE UPDATE ON "location"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── stock_lot.available_m2 — §6.3 ─────────────────────────────────────────────
-- A real GENERATED column: subtraction of two plain numeric columns is
-- IMMUTABLE, unlike the to_tsvector case in the catalog migration.

ALTER TABLE "stock_lot" DROP COLUMN "available_m2";
ALTER TABLE "stock_lot"
  ADD COLUMN "available_m2" numeric(12,4) GENERATED ALWAYS AS ("quantity_m2" - "reserved_m2") STORED;


-- ── product_stock uniqueness, including the roll-up row — §6.6 ───────────────
-- location_id = NULL is the tenant-wide roll-up row per product, so plain
-- UNIQUE (which treats NULLs as distinct) would allow duplicate roll-up rows.
-- NULLS NOT DISTINCT (PG15+) is what Prisma cannot express, hence hand-authored.

CREATE UNIQUE INDEX "product_stock_tenant_id_product_id_location_id_key"
  ON "product_stock" ("tenant_id", "product_id", "location_id") NULLS NOT DISTINCT;


-- ── inventory_movement is append-only — §6.4 ──────────────────────────────────
-- Enforced twice: RLS below grants no UPDATE/DELETE policy at all (so no role
-- without BYPASSRLS can modify or remove a row), and these rules block it
-- unconditionally, including for roles that bypass RLS (service_role).

CREATE RULE "inventory_movement_no_update" AS ON UPDATE TO "inventory_movement" DO INSTEAD NOTHING;
CREATE RULE "inventory_movement_no_delete" AS ON DELETE TO "inventory_movement" DO INSTEAD NOTHING;


-- ── inventory_movement → stock_lot — §6.1, §5.6-style ─────────────────────────
-- Every movement is signed (§6.4: "negative reduces"). reservation/release
-- movements adjust reserved_m2; every other movement type adjusts quantity_m2.

CREATE OR REPLACE FUNCTION inventory_movement_apply_to_stock_lot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.movement_type IN ('reservation', 'release') THEN
    UPDATE public.stock_lot
    SET reserved_m2 = reserved_m2 + NEW.quantity_m2
    WHERE id = NEW.stock_lot_id;
  ELSE
    UPDATE public.stock_lot
    SET quantity_m2 = quantity_m2 + NEW.quantity_m2
    WHERE id = NEW.stock_lot_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_movement_apply_to_stock_lot"
  AFTER INSERT ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_apply_to_stock_lot();

ALTER FUNCTION inventory_movement_apply_to_stock_lot() SET search_path = '';


-- ── stock_lot → product_stock — §6.1, §6.6 ────────────────────────────────────
-- Recomputed from stock_lot (not incremented) so it can never drift: one row
-- per (tenant, product, location) aggregating that location's lots, plus a
-- location_id = NULL roll-up row aggregating every location for the product.
-- Thresholds (low below 30 m², out at 0) are §6.6's stated defaults, inlined
-- because app_setting (the platform domain, where a tenant could override
-- them) doesn't exist yet — revisit when that domain lands.

CREATE OR REPLACE FUNCTION stock_lot_refresh_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_tenant_id uuid;
  affected_product_id uuid;
  affected_location_id uuid;
BEGIN
  affected_tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  affected_product_id := coalesce(NEW.product_id, OLD.product_id);
  affected_location_id := coalesce(NEW.location_id, OLD.location_id);

  -- Per-location row.
  INSERT INTO public.product_stock AS ps
    (tenant_id, product_id, location_id, quantity_m2, reserved_m2, available_m2, lot_count, largest_lot_m2, stock_status, updated_at)
  SELECT
    affected_tenant_id,
    affected_product_id,
    affected_location_id,
    coalesce(sum(quantity_m2), 0),
    coalesce(sum(reserved_m2), 0),
    coalesce(sum(available_m2), 0),
    count(*) FILTER (WHERE status = 'available'),
    max(available_m2),
    CASE
      WHEN coalesce(sum(available_m2), 0) <= 0 THEN 'out_of_stock'::public.product_stock_status
      WHEN coalesce(sum(available_m2), 0) < 30 THEN 'low_stock'::public.product_stock_status
      ELSE 'in_stock'::public.product_stock_status
    END,
    now()
  FROM public.stock_lot
  WHERE tenant_id = affected_tenant_id
    AND product_id = affected_product_id
    AND location_id = affected_location_id
    AND status NOT IN ('depleted', 'written_off')
  ON CONFLICT (tenant_id, product_id, location_id) DO UPDATE SET
    quantity_m2 = excluded.quantity_m2,
    reserved_m2 = excluded.reserved_m2,
    available_m2 = excluded.available_m2,
    lot_count = excluded.lot_count,
    largest_lot_m2 = excluded.largest_lot_m2,
    stock_status = excluded.stock_status,
    updated_at = excluded.updated_at;

  -- Tenant-wide roll-up row (location_id IS NULL) across every location.
  INSERT INTO public.product_stock AS ps
    (tenant_id, product_id, location_id, quantity_m2, reserved_m2, available_m2, lot_count, largest_lot_m2, stock_status, updated_at)
  SELECT
    affected_tenant_id,
    affected_product_id,
    NULL,
    coalesce(sum(quantity_m2), 0),
    coalesce(sum(reserved_m2), 0),
    coalesce(sum(available_m2), 0),
    count(*) FILTER (WHERE status = 'available'),
    max(available_m2),
    CASE
      WHEN coalesce(sum(available_m2), 0) <= 0 THEN 'out_of_stock'::public.product_stock_status
      WHEN coalesce(sum(available_m2), 0) < 30 THEN 'low_stock'::public.product_stock_status
      ELSE 'in_stock'::public.product_stock_status
    END,
    now()
  FROM public.stock_lot
  WHERE tenant_id = affected_tenant_id
    AND product_id = affected_product_id
    AND status NOT IN ('depleted', 'written_off')
  ON CONFLICT (tenant_id, product_id, location_id) DO UPDATE SET
    quantity_m2 = excluded.quantity_m2,
    reserved_m2 = excluded.reserved_m2,
    available_m2 = excluded.available_m2,
    lot_count = excluded.lot_count,
    largest_lot_m2 = excluded.largest_lot_m2,
    stock_status = excluded.stock_status,
    updated_at = excluded.updated_at;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "stock_lot_refresh_product_stock"
  AFTER INSERT OR UPDATE OF "quantity_m2", "reserved_m2", "status" OR DELETE ON "stock_lot"
  FOR EACH ROW EXECUTE FUNCTION stock_lot_refresh_product_stock();

ALTER FUNCTION stock_lot_refresh_product_stock() SET search_path = '';


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "stock_lot"
  ADD CONSTRAINT "stock_lot_quantity_m2_non_negative" CHECK ("quantity_m2" >= 0),
  ADD CONSTRAINT "stock_lot_reserved_m2_non_negative" CHECK ("reserved_m2" >= 0),
  ADD CONSTRAINT "stock_lot_boxes_non_negative" CHECK ("boxes" IS NULL OR "boxes" >= 0);

ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_reason_required" CHECK (
    "movement_type" NOT IN ('adjustment', 'damage', 'write_off') OR "reason" IS NOT NULL
  );

ALTER TABLE "location"
  ADD CONSTRAINT "location_latitude_range" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
  ADD CONSTRAINT "location_longitude_range" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)),
  ADD CONSTRAINT "location_booking_slot_minutes_positive" CHECK ("booking_slot_minutes" IS NULL OR "booking_slot_minutes" > 0);


-- ── indexes — §12 ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "location_tenant_id_slug_key" ON "location" ("tenant_id", "slug");
CREATE INDEX "product_stock_tenant_id_stock_status_idx" ON "product_stock" ("tenant_id", "stock_status") WHERE "location_id" IS NULL;


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- location/location_translation: public-read (is_active + is_public), staff
-- write (content.manage — the same permission that governs brand/collection).
-- stock_lot: staff-only, both read and write (inventory.read / .adjust) — lot
-- numbers and cost_per_m2 never reach anon/authenticated.
-- inventory_movement: staff insert (inventory.adjust) and read (inventory.read);
-- no update/delete policy at all — append-only per §6.4, reinforced by the
-- rules above. showroom_display: public-read like product_media, staff write
-- gated the same as stock_lot since it's an inventory-adjacent operational
-- concern, not a content one. product_stock: public-read (aggregated, no
-- cost data), written only by the trigger above — the write policies are
-- gated on inventory.adjust so the trigger succeeds for whichever staff
-- member's insert into inventory_movement triggered it.

ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "location_read" ON "location"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND (("is_active" AND "is_public") OR app.has_permission('content.manage')));

CREATE POLICY "location_staff_write" ON "location"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "location_staff_update" ON "location"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "location_staff_delete" ON "location"
  FOR DELETE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));


ALTER TABLE "location_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "location_translation_read" ON "location_translation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "location_translation"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND ((l."is_active" AND l."is_public") OR app.has_permission('content.manage'))
    )
  );

CREATE POLICY "location_translation_staff_write" ON "location_translation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "location_translation"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "location_translation"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  );


ALTER TABLE "stock_lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_lot" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "stock_lot_staff_read" ON "stock_lot"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.read'));

CREATE POLICY "stock_lot_staff_insert" ON "stock_lot"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'));

CREATE POLICY "stock_lot_staff_update" ON "stock_lot"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'));


ALTER TABLE "inventory_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "inventory_movement_staff_read" ON "inventory_movement"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.read'));

CREATE POLICY "inventory_movement_staff_insert" ON "inventory_movement"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'));


ALTER TABLE "product_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_stock" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_stock_read" ON "product_stock"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id());

CREATE POLICY "product_stock_staff_write" ON "product_stock"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'));


ALTER TABLE "showroom_display" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "showroom_display" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "showroom_display_read" ON "showroom_display"
  FOR SELECT
  USING (
    "is_active"
    AND EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "showroom_display"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND l."is_active"
        AND l."is_public"
    )
  );

CREATE POLICY "showroom_display_staff_write" ON "showroom_display"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "showroom_display"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND app.has_permission('inventory.adjust')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "location" l
      WHERE l."id" = "showroom_display"."location_id"
        AND l."tenant_id" = app.tenant_id()
        AND app.has_permission('inventory.adjust')
    )
  );
