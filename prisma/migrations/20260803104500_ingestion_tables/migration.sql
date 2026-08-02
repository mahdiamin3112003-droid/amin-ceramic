-- =============================================================================
-- 0023 · Ingestion domain — tables
-- docs/03-database-design.md §9.5
-- =============================================================================
--
-- Prisma-generated DDL, usual diff noise excluded. Fixed before generating
-- this file: staging_product.widthMm/heightMm were missing @map() in the
-- schema (caught by inspecting the raw diff, same class of bug as the
-- catalog domain's colorLab/searchVector/valueText omissions) — corrected to
-- width_mm/height_mm here.

-- CreateEnum
CREATE TYPE "ingestion_job_type" AS ENUM ('pdf_catalog', 'spreadsheet', 'image_batch', 'url_scrape');

-- CreateEnum
CREATE TYPE "ingestion_job_status" AS ENUM ('queued', 'parsing', 'extracting', 'enriching', 'embedding', 'review_pending', 'partially_approved', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ingestion_document_status" AS ENUM ('pending', 'parsed', 'failed');

-- CreateEnum
CREATE TYPE "staging_product_status" AS ENUM ('extracted', 'needs_review', 'approved', 'rejected', 'merged');

-- CreateTable
CREATE TABLE "ingestion_job" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "created_by" UUID,
    "job_type" "ingestion_job_type" NOT NULL,
    "supplier_id" UUID,
    "status" "ingestion_job_status" NOT NULL DEFAULT 'queued',
    "total_items" INTEGER,
    "extracted_count" INTEGER NOT NULL DEFAULT 0,
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "needs_review_count" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "inngest_run_id" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_document" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "job_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "page_count" INTEGER,
    "parsed_layout" JSONB,
    "status" "ingestion_document_status" NOT NULL DEFAULT 'pending',

    CONSTRAINT "ingestion_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_region" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "document_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "bbox" numeric[],
    "region_image_upload_id" UUID,
    "staging_product_id" UUID,

    CONSTRAINT "ingestion_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_product" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "job_id" UUID NOT NULL,
    "sku" TEXT,
    "supplier_sku" TEXT,
    "ean" TEXT,
    "gtin" TEXT,
    "brand_id" UUID,
    "collection_id" UUID,
    "category_id" UUID,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "thickness_mm" DECIMAL(5,2),
    "material_id" UUID,
    "finish_id" UUID,
    "surface_look_id" UUID,
    "color_family_id" UUID,
    "color_hex" TEXT,
    "shade_variation" "shade_variation",
    "slip_rating" "slip_rating",
    "pei_class" INTEGER,
    "water_absorption_pct" DECIMAL(5,3),
    "is_frost_resistant" BOOLEAN,
    "is_indoor" BOOLEAN,
    "is_outdoor" BOOLEAN,
    "pieces_per_box" INTEGER,
    "m2_per_box" DECIMAL(8,4),
    "kg_per_box" DECIMAL(8,3),
    "boxes_per_pallet" INTEGER,
    "origin_country" TEXT,
    "status" "staging_product_status" NOT NULL DEFAULT 'extracted',
    "overall_confidence" DECIMAL(4,3),
    "duplicate_of_product_id" UUID,
    "duplicate_score" DECIMAL(4,3),
    "promoted_product_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_field" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "staging_product_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "raw_value" JSONB,
    "normalized_value" JSONB,
    "confidence" DECIMAL(4,3),
    "source_region_id" UUID,
    "was_edited" BOOLEAN NOT NULL DEFAULT false,
    "edited_value" JSONB,
    "edited_by" UUID,

    CONSTRAINT "staging_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_mapping" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "document_signature" TEXT NOT NULL,
    "field_mappings" JSONB NOT NULL,
    "transformation_rules" JSONB,
    "confidence" DECIMAL(4,3),
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_job_tenant_id_status_idx" ON "ingestion_job"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ingestion_document_job_id_idx" ON "ingestion_document"("job_id");

-- CreateIndex
CREATE INDEX "ingestion_region_document_id_page_number_idx" ON "ingestion_region"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "staging_product_job_id_status_idx" ON "staging_product"("job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staging_field_staging_product_id_field_key_key" ON "staging_field"("staging_product_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_mapping_tenant_id_brand_id_document_signature_key" ON "supplier_mapping"("tenant_id", "brand_id", "document_signature");

-- AddForeignKey
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_document" ADD CONSTRAINT "ingestion_document_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ingestion_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_region" ADD CONSTRAINT "ingestion_region_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ingestion_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_region" ADD CONSTRAINT "ingestion_region_staging_product_id_fkey" FOREIGN KEY ("staging_product_id") REFERENCES "staging_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_product" ADD CONSTRAINT "staging_product_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ingestion_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_field" ADD CONSTRAINT "staging_field_staging_product_id_fkey" FOREIGN KEY ("staging_product_id") REFERENCES "staging_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_field" ADD CONSTRAINT "staging_field_source_region_id_fkey" FOREIGN KEY ("source_region_id") REFERENCES "ingestion_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_mapping" ADD CONSTRAINT "supplier_mapping_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_mapping" ADD CONSTRAINT "supplier_mapping_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
