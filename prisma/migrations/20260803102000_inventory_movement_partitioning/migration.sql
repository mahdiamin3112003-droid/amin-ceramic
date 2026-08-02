-- =============================================================================
-- 0017 · inventory_movement — convert to monthly RANGE partitioning
-- docs/03-database-design.md §13.2
-- =============================================================================
--
-- Gap fix: §13.2 lists inventory_movement among the six tables requiring
-- monthly RANGE partitioning (the others land partitioned from the start —
-- product_view here, ai_interaction/audit_log/connector_event_log/
-- notification_delivery in their own domains, analytics_event in analytics).
-- inventory_movement was built as a plain table in the inventory domain
-- migration and missed this. The table is empty (confirmed via a live
-- `SELECT count(*)` before writing this), so it's safe to drop and recreate
-- partitioned rather than migrate data.
--
-- Also switches append-only enforcement from RULEs to BEFORE UPDATE/DELETE
-- triggers: row-level triggers on a partitioned parent are inherited by every
-- partition (including future ones) since PG11; RULEs do not reliably behave
-- the same way across partitions, so triggers are the correct primitive here.

DROP TABLE "inventory_movement";

CREATE TABLE "inventory_movement" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "stock_lot_id" UUID NOT NULL,
    "movement_type" "inventory_movement_type" NOT NULL,
    "quantity_m2" DECIMAL(12,4) NOT NULL,
    "quantity_boxes" INTEGER,
    "reference_type" "inventory_reference_type",
    "reference_id" UUID,
    "reason" TEXT,
    "performed_by" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id", "occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- Current month + next two, matching the plan's "current and next two
-- months" scope. pg_cron maintenance of future partitions is Phase 9.
CREATE TABLE "inventory_movement_2026_08" PARTITION OF "inventory_movement"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "inventory_movement_2026_09" PARTITION OF "inventory_movement"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "inventory_movement_2026_10" PARTITION OF "inventory_movement"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
-- Catches anything outside the pre-created range so inserts never hard-fail
-- before pg_cron partition maintenance exists.
CREATE TABLE "inventory_movement_default" PARTITION OF "inventory_movement" DEFAULT;

ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_movement_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_movement_stock_lot_id_fkey" FOREIGN KEY ("stock_lot_id") REFERENCES "stock_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_movement_reason_required" CHECK ("movement_type" NOT IN ('adjustment', 'damage', 'write_off') OR "reason" IS NOT NULL);

CREATE INDEX "inventory_movement_tenant_id_product_id_location_id_occurre_idx" ON "inventory_movement"("tenant_id", "product_id", "location_id", "occurred_at");
CREATE INDEX "inventory_movement_tenant_id_stock_lot_id_idx" ON "inventory_movement"("tenant_id", "stock_lot_id");
CREATE INDEX "inventory_movement_tenant_id_reference_type_reference_id_idx" ON "inventory_movement"("tenant_id", "reference_type", "reference_id");

CREATE TRIGGER "inventory_movement_apply_to_stock_lot"
  AFTER INSERT ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_apply_to_stock_lot();

CREATE OR REPLACE FUNCTION inventory_movement_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movement is append-only: % not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "inventory_movement_reject_update"
  BEFORE UPDATE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_reject_mutation();

CREATE TRIGGER "inventory_movement_reject_delete"
  BEFORE DELETE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_reject_mutation();

ALTER FUNCTION inventory_movement_reject_mutation() SET search_path = '';

ALTER TABLE "inventory_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "inventory_movement_staff_read" ON "inventory_movement"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.read'));

CREATE POLICY "inventory_movement_staff_insert" ON "inventory_movement"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('inventory.adjust'));
