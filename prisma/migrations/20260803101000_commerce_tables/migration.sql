-- =============================================================================
-- 0015 · Commerce domain — tables
-- docs/03-database-design.md §7
-- =============================================================================
--
-- Prisma-generated DDL. As with every prior domain migration, the DropIndex/
-- DropForeignKey/color_lab/RenameIndex diff noise is excluded, along with a
-- new one this round: `ALTER TABLE stock_lot ALTER COLUMN available_m2 DROP
-- DEFAULT` — Prisma doesn't know available_m2 is a real GENERATED STORED
-- column (declared as a plain nullable field in inventory.prisma, the same
-- Unsupported-adjacent workaround used for other generated columns), so it
-- thinks there's a stray default to remove. There isn't one; excluded.

-- CreateEnum
CREATE TYPE "quote_request_status" AS ENUM ('draft', 'submitted', 'acknowledged', 'quoted', 'negotiating', 'won', 'lost', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "project_type" AS ENUM ('residential', 'commercial', 'hospitality', 'retail', 'renovation', 'new_build');

-- CreateEnum
CREATE TYPE "quote_timeline" AS ENUM ('immediate', 'within_1_month', 'within_3_months', 'within_6_months', 'planning');

-- CreateEnum
CREATE TYPE "quote_source" AS ENUM ('catalog', 'tile_finder', 'assistant', 'project', 'showroom', 'whatsapp', 'direct');

-- CreateEnum
CREATE TYPE "quote_lost_reason" AS ENUM ('price', 'availability', 'timeline', 'competitor', 'no_response', 'other');

-- CreateEnum
CREATE TYPE "space_type" AS ENUM ('kitchen', 'bathroom', 'living_room', 'bedroom', 'hallway', 'outdoor', 'commercial_space', 'other');

-- CreateEnum
CREATE TYPE "sample_request_status" AS ENUM ('requested', 'approved', 'preparing', 'shipped', 'delivered', 'collected', 'cancelled');

-- CreateEnum
CREATE TYPE "sample_fulfilment_type" AS ENUM ('ship', 'collect');

-- CreateEnum
CREATE TYPE "sample_type" AS ENUM ('chip', 'full_tile', 'board');

-- CreateEnum
CREATE TYPE "sample_item_status" AS ENUM ('pending', 'packed', 'shipped', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "booking_purpose" AS ENUM ('browse', 'consultation', 'sample_collection', 'quote_review');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('requested', 'confirmed', 'completed', 'no_show', 'cancelled');

-- CreateTable
CREATE TABLE "quote_request" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "app_user_id" UUID,
    "reference" TEXT NOT NULL,
    "status" "quote_request_status" NOT NULL DEFAULT 'draft',
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "contact_whatsapp" TEXT,
    "company_name" TEXT,
    "project_type" "project_type",
    "project_address" TEXT,
    "project_city" TEXT,
    "timeline" "quote_timeline",
    "estimated_budget" DECIMAL(12,2),
    "preferred_location_id" UUID,
    "floor_plan_upload_id" UUID,
    "notes" TEXT,
    "source" "quote_source" NOT NULL,
    "source_session_id" UUID,
    "subtotal" DECIMAL(12,4),
    "quoted_total" DECIMAL(12,4),
    "currency" CHAR(3),
    "total_weight_kg" DECIMAL(12,4),
    "total_area_m2" DECIMAL(12,4),
    "price_tier_id" UUID,
    "assigned_to" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "lost_reason" "quote_lost_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_request_zone" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "quote_request_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "space_type" "space_type",
    "area_m2" DECIMAL(12,4) NOT NULL,
    "layout_pattern_id" UUID,
    "wastage_pct" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "quote_request_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_request_item" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "quote_request_id" UUID NOT NULL,
    "zone_id" UUID,
    "product_id" UUID NOT NULL,
    "quantity_m2" DECIMAL(12,4) NOT NULL,
    "quantity_boxes" INTEGER,
    "quantity_pieces" INTEGER,
    "sku_snapshot" TEXT NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "unit_price_snapshot" DECIMAL(12,4) NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "m2_per_box_snapshot" DECIMAL(10,4),
    "kg_per_box_snapshot" DECIMAL(10,4),
    "spec_snapshot" JSONB NOT NULL DEFAULT '{}',
    "line_total" DECIMAL(12,4) NOT NULL,
    "stock_lot_id" UUID,
    "is_single_lot" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "quote_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_status_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "quote_request_id" UUID NOT NULL,
    "from_status" "quote_request_status",
    "to_status" "quote_request_status" NOT NULL,
    "changed_by" UUID,
    "note" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_request" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "app_user_id" UUID,
    "reference" TEXT NOT NULL,
    "status" "sample_request_status" NOT NULL DEFAULT 'requested',
    "fulfilment_type" "sample_fulfilment_type" NOT NULL,
    "location_id" UUID,
    "shipping_address_line1" TEXT,
    "shipping_address_line2" TEXT,
    "shipping_city" TEXT,
    "shipping_region" TEXT,
    "shipping_postal_code" TEXT,
    "shipping_country_code" CHAR(2),
    "tracking_number" TEXT,
    "carrier" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipped_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "sample_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_request_item" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "sample_request_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sample_type" "sample_type" NOT NULL,
    "status" "sample_item_status" NOT NULL DEFAULT 'pending',

    CONSTRAINT "sample_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_booking" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "visitor_id" UUID,
    "app_user_id" UUID,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "party_size" INTEGER,
    "purpose" "booking_purpose" NOT NULL,
    "quote_request_id" UUID,
    "project_id" UUID,
    "status" "booking_status" NOT NULL DEFAULT 'requested',
    "assigned_to" UUID,
    "notes" TEXT,
    "reminder_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_request_reference_key" ON "quote_request"("reference");

-- CreateIndex
CREATE INDEX "quote_request_tenant_id_status_idx" ON "quote_request"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quote_request_tenant_id_visitor_id_idx" ON "quote_request"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "quote_request_tenant_id_assigned_to_idx" ON "quote_request"("tenant_id", "assigned_to");

-- CreateIndex
CREATE INDEX "quote_request_zone_quote_request_id_idx" ON "quote_request_zone"("quote_request_id");

-- CreateIndex
CREATE INDEX "quote_request_item_quote_request_id_idx" ON "quote_request_item"("quote_request_id");

-- CreateIndex
CREATE INDEX "quote_request_item_zone_id_idx" ON "quote_request_item"("zone_id");

-- CreateIndex
CREATE INDEX "quote_request_item_product_id_idx" ON "quote_request_item"("product_id");

-- CreateIndex
CREATE INDEX "quote_status_history_quote_request_id_changed_at_idx" ON "quote_status_history"("quote_request_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sample_request_reference_key" ON "sample_request"("reference");

-- CreateIndex
CREATE INDEX "sample_request_tenant_id_visitor_id_requested_at_idx" ON "sample_request"("tenant_id", "visitor_id", "requested_at");

-- CreateIndex
CREATE INDEX "sample_request_tenant_id_status_idx" ON "sample_request"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sample_request_item_sample_request_id_idx" ON "sample_request_item"("sample_request_id");

-- CreateIndex
CREATE INDEX "sample_request_item_product_id_idx" ON "sample_request_item"("product_id");

-- CreateIndex
CREATE INDEX "showroom_booking_tenant_id_location_id_scheduled_at_idx" ON "showroom_booking"("tenant_id", "location_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "showroom_booking_tenant_id_status_idx" ON "showroom_booking"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_preferred_location_id_fkey" FOREIGN KEY ("preferred_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "price_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_zone" ADD CONSTRAINT "quote_request_zone_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_zone" ADD CONSTRAINT "quote_request_zone_layout_pattern_id_fkey" FOREIGN KEY ("layout_pattern_id") REFERENCES "layout_pattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_item" ADD CONSTRAINT "quote_request_item_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_item" ADD CONSTRAINT "quote_request_item_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "quote_request_zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_item" ADD CONSTRAINT "quote_request_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_item" ADD CONSTRAINT "quote_request_item_stock_lot_id_fkey" FOREIGN KEY ("stock_lot_id") REFERENCES "stock_lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_status_history" ADD CONSTRAINT "quote_status_history_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request" ADD CONSTRAINT "sample_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request" ADD CONSTRAINT "sample_request_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request" ADD CONSTRAINT "sample_request_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request" ADD CONSTRAINT "sample_request_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request_item" ADD CONSTRAINT "sample_request_item_sample_request_id_fkey" FOREIGN KEY ("sample_request_id") REFERENCES "sample_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request_item" ADD CONSTRAINT "sample_request_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_booking" ADD CONSTRAINT "showroom_booking_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_booking" ADD CONSTRAINT "showroom_booking_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_booking" ADD CONSTRAINT "showroom_booking_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_booking" ADD CONSTRAINT "showroom_booking_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_booking" ADD CONSTRAINT "showroom_booking_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
