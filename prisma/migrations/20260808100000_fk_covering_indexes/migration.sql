-- FK-covering indexes for the foreign keys that carry a real access pattern.
--
-- ── Why this file is hand-written ──
-- `prisma migrate dev` cannot generate it. The shadow database fails on
-- `20260803090000_extensions_schema_and_ltree` ("schema \"extensions\" does not
-- exist") because Supabase provides that schema and a fresh shadow database
-- does not.
--
-- `prisma migrate diff` against the live database is worse, not better. It
-- sees only the half of the schema Prisma owns (docs/03 §15.2: Prisma owns
-- tables, columns, relations and B-tree indexes; SQL owns vector columns,
-- HNSW/GIN/GiST/partial/covering indexes, generated columns, triggers, RLS and
-- check constraints). Everything in the SQL-owned half looks to it like drift
-- to be removed. Its output began:
--
--     DROP INDEX "product_sku_trgm_idx"          -- trigram SKU search
--     DROP INDEX "category_path_idx"             -- the ltree path
--     DROP INDEX "product_application_idx"       -- GIN
--     DROP INDEX "product_dimension_idx"
--     DROP INDEX "product_stock_..._key"         -- the NULLS NOT DISTINCT unique
--     DROP CONSTRAINT "product_primary_media_id_fkey"
--     ALTER TABLE "product" DROP COLUMN "color_lab", ADD COLUMN ...
--
-- Only the CREATE INDEX statements were kept. Nothing here drops anything.
--
-- ── Why single-column, not (tenant_id, x) ──
-- Postgres only uses an index for a foreign-key constraint check when the FK
-- column LEADS it, so the existing `(tenant_id, …)` composites do not cover
-- these. The house rule that `tenant_id` leads every COMPOSITE index is
-- untouched: none of these are composite.
--
-- ── Why not CONCURRENTLY ──
-- Prisma runs a migration in one transaction and CREATE INDEX CONCURRENTLY
-- cannot run inside one. At today's row counts (largest table: 160 rows) the
-- lock is measured in milliseconds. Any index added to these tables AFTER the
-- real catalogue is loaded should be created concurrently, by hand, outside a
-- migration.
--
-- ── What is deliberately NOT here ──
-- 82 of the 115 unindexed foreign keys are on empty, future-phase tables
-- (analytics partitions, AI, ingestion, projects, connectors) and the
-- `tenant_id` foreign keys are excluded on purpose. Reasoning in
-- docs/adr/0018-fk-covering-indexes.md — this is a decision, not an oversight.

-- Catalogue: the listing groupBy's each of these, and the taxonomy guards
-- count products by them before allowing a hide.
CREATE INDEX IF NOT EXISTS "product_brand_id_idx" ON "product"("brand_id");
CREATE INDEX IF NOT EXISTS "product_collection_id_idx" ON "product"("collection_id");
CREATE INDEX IF NOT EXISTS "product_category_id_idx" ON "product"("category_id");
CREATE INDEX IF NOT EXISTS "product_material_id_idx" ON "product"("material_id");
CREATE INDEX IF NOT EXISTS "product_finish_id_idx" ON "product"("finish_id");
CREATE INDEX IF NOT EXISTS "product_surface_look_id_idx" ON "product"("surface_look_id");
CREATE INDEX IF NOT EXISTS "product_color_family_id_idx" ON "product"("color_family_id");
CREATE INDEX IF NOT EXISTS "product_primary_media_id_idx" ON "product"("primary_media_id");

-- Taxonomy parents: the brand-deactivation guard and the category tree.
CREATE INDEX IF NOT EXISTS "collection_brand_id_idx" ON "collection"("brand_id");
CREATE INDEX IF NOT EXISTS "category_parent_id_idx" ON "category"("parent_id");

-- Reverse relation lookups — the similar-tiles and complete-the-look rails.
CREATE INDEX IF NOT EXISTS "product_relation_related_product_id_idx" ON "product_relation"("related_product_id");

-- Stock and lots, per product and per warehouse.
CREATE INDEX IF NOT EXISTS "product_stock_product_id_idx" ON "product_stock"("product_id");
CREATE INDEX IF NOT EXISTS "product_stock_location_id_idx" ON "product_stock"("location_id");
CREATE INDEX IF NOT EXISTS "stock_lot_product_id_idx" ON "stock_lot"("product_id");
CREATE INDEX IF NOT EXISTS "stock_lot_location_id_idx" ON "stock_lot"("location_id");

-- Trade pricing. `tenant_id` on this table is deliberately left unindexed.
CREATE INDEX IF NOT EXISTS "product_price_price_tier_id_idx" ON "product_price"("price_tier_id");

-- The requests board, and the lot-crossing warning.
CREATE INDEX IF NOT EXISTS "quote_request_visitor_id_idx" ON "quote_request"("visitor_id");
CREATE INDEX IF NOT EXISTS "quote_request_app_user_id_idx" ON "quote_request"("app_user_id");
CREATE INDEX IF NOT EXISTS "quote_request_preferred_location_id_idx" ON "quote_request"("preferred_location_id");
CREATE INDEX IF NOT EXISTS "quote_request_price_tier_id_idx" ON "quote_request"("price_tier_id");
CREATE INDEX IF NOT EXISTS "quote_request_item_stock_lot_id_idx" ON "quote_request_item"("stock_lot_id");

-- Samples.
CREATE INDEX IF NOT EXISTS "sample_request_visitor_id_idx" ON "sample_request"("visitor_id");
CREATE INDEX IF NOT EXISTS "sample_request_app_user_id_idx" ON "sample_request"("app_user_id");
CREATE INDEX IF NOT EXISTS "sample_request_location_id_idx" ON "sample_request"("location_id");

-- Wishlist reads, and what a product delete has to check.
CREATE INDEX IF NOT EXISTS "saved_item_product_id_idx" ON "saved_item"("product_id");
CREATE INDEX IF NOT EXISTS "saved_item_app_user_id_idx" ON "saved_item"("app_user_id");

-- Identity. `role_permission.permission_key` is on the hot path: permission
-- resolution runs on EVERY admin request via `app.resolve_staff_identity`.
-- `user_role.role_id` is what the owner-lockout guards count members with.
CREATE INDEX IF NOT EXISTS "role_permission_permission_key_idx" ON "role_permission"("permission_key");
CREATE INDEX IF NOT EXISTS "user_role_role_id_idx" ON "user_role"("role_id");
CREATE INDEX IF NOT EXISTS "visitor_app_user_id_idx" ON "visitor"("app_user_id");
