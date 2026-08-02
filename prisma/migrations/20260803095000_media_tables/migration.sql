-- =============================================================================
-- 0011 · Media domain — tables
-- docs/03-database-design.md §4
-- =============================================================================
--
-- Prisma-generated DDL for the new media tables. The DropIndex/DropForeignKey
-- statements `prisma migrate diff` also emitted here (against pt_slug_idx,
-- category_path_idx, product_application_idx, product_dimension_idx,
-- product_sku_trgm_idx, product_translation_tenant_id_fkey) are the same
-- recurring artifact seen in every prior migration in this project: Prisma's
-- tracked model never saw the hand-authored indexes/constraints from the
-- constraints migrations, so every subsequent diff wants to "fix" that by
-- dropping them. Excluded, along with the `product.color_lab` DROP/ADD
-- no-op and the `app_user` RenameIndex artifact.

-- CreateEnum
CREATE TYPE "media_provider" AS ENUM ('cloudinary', 'supabase');

-- CreateEnum
CREATE TYPE "product_media_role" AS ENUM ('primary', 'gallery', 'room_scene', 'macro_detail', 'installed', 'technical_drawing', 'packaging', 'swatch');

-- CreateEnum
CREATE TYPE "upload_purpose" AS ENUM ('finder_query', 'ingestion_source', 'trade_document', 'floor_plan', 'visualizer_source', 'generated_pdf', 'generated_image');

-- CreateEnum
CREATE TYPE "upload_scan_status" AS ENUM ('pending', 'clean', 'infected', 'skipped');

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "provider" "media_provider" NOT NULL,
    "public_id" TEXT NOT NULL,
    "secure_url" TEXT,
    "format" TEXT,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BIGINT,
    "blurhash" TEXT,
    "dominant_color" CHAR(7),
    "focal_point_x" DECIMAL(4,3),
    "focal_point_y" DECIMAL(4,3),
    "folder_path" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checksum_sha256" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_translation" (
    "media_asset_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "alt_text" TEXT,
    "caption" TEXT,
    "is_machine_generated" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_translation_pkey" PRIMARY KEY ("media_asset_id","locale")
);

-- CreateTable
CREATE TABLE "product_media" (
    "product_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "role" "product_media_role" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("product_id","media_asset_id","role")
);

-- CreateTable
CREATE TABLE "upload" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID,
    "app_user_id" UUID,
    "purpose" "upload_purpose" NOT NULL,
    "storage_bucket" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "bytes" BIGINT,
    "checksum_sha256" TEXT,
    "scan_status" "upload_scan_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_asset_tenant_id_provider_idx" ON "media_asset"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "media_asset_tenant_id_checksum_sha256_idx" ON "media_asset"("tenant_id", "checksum_sha256");

-- CreateIndex
CREATE INDEX "upload_tenant_id_purpose_expires_at_idx" ON "upload"("tenant_id", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "upload_tenant_id_visitor_id_idx" ON "upload"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "upload_tenant_id_app_user_id_idx" ON "upload"("tenant_id", "app_user_id");

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_translation" ADD CONSTRAINT "media_translation_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
