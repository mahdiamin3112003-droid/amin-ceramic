-- =============================================================================
-- 0013 · Inventory domain — tables
-- docs/03-database-design.md §6
-- =============================================================================
--
-- Prisma-generated DDL. As with every prior domain migration, the DropIndex/
-- DropForeignKey/color_lab/RenameIndex diff noise against hand-authored SQL
-- from earlier migrations is excluded.

-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('warehouse', 'showroom', 'hybrid');

-- CreateEnum
CREATE TYPE "stock_lot_status" AS ENUM ('available', 'reserved', 'quarantine', 'depleted', 'written_off');

-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('receipt', 'sale', 'reservation', 'release', 'transfer_out', 'transfer_in', 'adjustment', 'return', 'sample', 'damage', 'write_off', 'count_correction');

-- CreateEnum
CREATE TYPE "inventory_reference_type" AS ENUM ('quote', 'order', 'sample_request', 'transfer', 'manual', 'import', 'stocktake');

-- CreateEnum
CREATE TYPE "product_stock_status" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'on_order');

-- CreateEnum
CREATE TYPE "showroom_display_type" AS ENUM ('panel', 'floor_area', 'sample_board', 'full_room');

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_type" "location_type" NOT NULL,
    "holds_sellable_stock" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "country_code" CHAR(2),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "opening_hours" JSONB,
    "timezone" TEXT,
    "accepts_bookings" BOOLEAN NOT NULL DEFAULT false,
    "booking_slot_minutes" INTEGER,
    "max_concurrent_bookings" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_translation" (
    "location_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "directions" TEXT,

    CONSTRAINT "location_translation_pkey" PRIMARY KEY ("location_id","locale")
);

-- CreateTable
CREATE TABLE "stock_lot" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_number" TEXT NOT NULL,
    "caliber" TEXT,
    "shade_code" TEXT,
    "quantity_m2" DECIMAL(12,4) NOT NULL,
    "reserved_m2" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "available_m2" DECIMAL(12,4),
    "boxes" INTEGER,
    "received_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "cost_per_m2" DECIMAL(12,4),
    "cost_currency" CHAR(3),
    "supplier_invoice_ref" TEXT,
    "status" "stock_lot_status" NOT NULL DEFAULT 'available',
    "notes" TEXT,

    CONSTRAINT "stock_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stock" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID,
    "quantity_m2" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "reserved_m2" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "available_m2" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "lot_count" SMALLINT NOT NULL DEFAULT 0,
    "largest_lot_m2" DECIMAL(12,4),
    "stock_status" "product_stock_status" NOT NULL DEFAULT 'out_of_stock',
    "restock_eta" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_display" (
    "location_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "display_type" "showroom_display_type" NOT NULL,
    "position_note" TEXT,
    "has_sample_available" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "showroom_display_pkey" PRIMARY KEY ("location_id","product_id","display_type")
);

-- CreateIndex
CREATE INDEX "location_tenant_id_slug_idx" ON "location"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "location_tenant_id_is_active_idx" ON "location"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "stock_lot_tenant_id_product_id_location_id_status_idx" ON "stock_lot"("tenant_id", "product_id", "location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lot_tenant_id_product_id_location_id_lot_number_key" ON "stock_lot"("tenant_id", "product_id", "location_id", "lot_number");

-- CreateIndex
CREATE INDEX "inventory_movement_tenant_id_product_id_location_id_occurre_idx" ON "inventory_movement"("tenant_id", "product_id", "location_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movement_tenant_id_stock_lot_id_idx" ON "inventory_movement"("tenant_id", "stock_lot_id");

-- CreateIndex
CREATE INDEX "inventory_movement_tenant_id_reference_type_reference_id_idx" ON "inventory_movement"("tenant_id", "reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "product_stock_tenant_id_product_id_idx" ON "product_stock"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "product_stock_tenant_id_location_id_idx" ON "product_stock"("tenant_id", "location_id");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_translation" ADD CONSTRAINT "location_translation_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_stock_lot_id_fkey" FOREIGN KEY ("stock_lot_id") REFERENCES "stock_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_display" ADD CONSTRAINT "showroom_display_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_display" ADD CONSTRAINT "showroom_display_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
