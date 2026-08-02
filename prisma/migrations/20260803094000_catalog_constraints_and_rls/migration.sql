-- =============================================================================
-- 0010 · Catalog domain — generated columns, triggers, constraints, RLS
-- docs/03-database-design.md §3, §5.4, §5.6, §12.2, §15.2, §16
-- =============================================================================

-- ── updated_at triggers ──────────────────────────────────────────────────────
-- Only tables carrying updated_at get one. category/material/finish/surface_look/
-- color_family/application/layout_pattern/product_attribute/price_tier have no
-- updated_at (§3.4 lists their shape without one — they change by admin toggle
-- of is_active, not by edit history).

CREATE TRIGGER "brand_set_updated_at"
  BEFORE UPDATE ON "brand"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "collection_set_updated_at"
  BEFORE UPDATE ON "collection"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "product_set_updated_at"
  BEFORE UPDATE ON "product"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "product_price_set_updated_at"
  BEFORE UPDATE ON "product_price"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── category.path — §3.1, §5.6 #4 ────────────────────────────────────────────
--
-- Materialised path, maintained by trigger from parent_id. A GENERATED column
-- cannot express this: the expression would need to read another row (the
-- parent's own path), which Postgres generated columns cannot do.
--
-- Slugs are already citext and URL-safe, but ltree labels are stricter
-- ([A-Za-z0-9_]+) — the slug is sanitised into a label by replacing every
-- run of non-label characters with an underscore.
--
-- Reparenting an existing subtree is handled: the trigger recomputes not just
-- the row being written but every descendant's path and depth too, via a
-- recursive CTE. Without that, moving a category with children would leave
-- their paths stale and every "products in this subtree" query wrong.

CREATE OR REPLACE FUNCTION category_maintain_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = extensions, pg_catalog
AS $$
DECLARE
  parent_path extensions.ltree;
  parent_depth integer;
  own_label text;
BEGIN
  own_label := regexp_replace(NEW.slug::text, '[^A-Za-z0-9_]+', '_', 'g');

  IF NEW.parent_id IS NULL THEN
    NEW.path := own_label::extensions.ltree;
    NEW.depth := 0;
  ELSE
    SELECT c.path, c.depth INTO parent_path, parent_depth
    FROM public.category c WHERE c.id = NEW.parent_id;

    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'category.parent_id % has no path — insert order violation', NEW.parent_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    NEW.path := parent_path || own_label::extensions.ltree;
    NEW.depth := parent_depth + 1;
  END IF;

  IF NEW.depth > 4 THEN
    RAISE EXCEPTION 'category depth % exceeds the maximum of 4 (§3.1)', NEW.depth
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "category_maintain_path"
  BEFORE INSERT OR UPDATE OF parent_id, slug ON "category"
  FOR EACH ROW EXECUTE FUNCTION category_maintain_path();

-- Cascades a path/depth change down to every existing descendant, after the
-- row itself has already been corrected by the BEFORE trigger above.
CREATE OR REPLACE FUNCTION category_cascade_path_to_descendants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = extensions, pg_catalog
AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    WITH RECURSIVE subtree AS (
      SELECT id, parent_id FROM public.category WHERE parent_id = NEW.id
      UNION ALL
      SELECT c.id, c.parent_id FROM public.category c
        JOIN subtree s ON c.parent_id = s.id
    )
    UPDATE public.category c
    SET path = NEW.path || subpath(c.path, nlevel(OLD.path)),
        depth = NEW.depth + (c.depth - OLD.depth) -- preserves relative depth
    FROM subtree s
    WHERE c.id = s.id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "category_cascade_path_to_descendants"
  AFTER UPDATE OF path ON "category"
  FOR EACH ROW EXECUTE FUNCTION category_cascade_path_to_descendants();

ALTER FUNCTION category_maintain_path() SET search_path = extensions, pg_catalog;
ALTER FUNCTION category_cascade_path_to_descendants() SET search_path = extensions, pg_catalog;


-- ── product_translation.search_vector — §3.3, §5.6 #5 ────────────────────────
--
-- Not a GENERATED column: to_tsvector(regconfig, text) is STABLE, not
-- IMMUTABLE, and Postgres rejects any STABLE call in a generated expression
-- (42P17 "generation expression is not immutable") regardless of whether the
-- regconfig argument happens to be a compile-time-constant cast per branch —
-- the planner does not special-case that. Maintained by trigger instead, the
-- same pattern as category.path and product.base_price. Weighted: name (A) is
-- what a search match on the product's own name should rank highest for,
-- short_description (B), description and tags (C).

-- Migration 0009's Prisma-generated DDL created `search_vector` as a plain
-- tsvector column with no default — the trigger below populates it.

CREATE OR REPLACE FUNCTION product_translation_refresh_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  cfg regconfig := CASE WHEN NEW.locale = 'ar' THEN 'arabic'::regconfig ELSE 'english'::regconfig END;
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector(cfg, coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector(cfg, coalesce(NEW.short_description, '')), 'B') ||
    setweight(to_tsvector(cfg, coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector(cfg, coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "product_translation_refresh_search_vector"
  BEFORE INSERT OR UPDATE OF "locale", "name", "short_description", "description", "tags"
  ON "product_translation"
  FOR EACH ROW EXECUTE FUNCTION product_translation_refresh_search_vector();

ALTER FUNCTION product_translation_refresh_search_vector() SET search_path = pg_catalog;


-- ── product_translation.tenant_id — denormalised, §5.6-style ─────────────────
-- Populated from the parent product on every insert/update of product_id, so
-- the slug-uniqueness index below can lead with tenant_id without a join.

CREATE OR REPLACE FUNCTION product_translation_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT p.tenant_id INTO NEW.tenant_id
  FROM public.product p
  WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "product_translation_set_tenant_id"
  BEFORE INSERT OR UPDATE OF "product_id" ON "product_translation"
  FOR EACH ROW EXECUTE FUNCTION product_translation_set_tenant_id();

ALTER FUNCTION product_translation_set_tenant_id() SET search_path = '';

ALTER TABLE "product_translation"
  ADD CONSTRAINT "product_translation_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT;


-- ── product.application_ids — §5.4 ───────────────────────────────────────────
-- The array replaces a junction table; referential integrity is recovered by
-- this trigger rather than a foreign key, which arrays cannot carry.

CREATE OR REPLACE FUNCTION product_validate_application_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  missing_count integer;
BEGIN
  IF NEW.application_ids IS NULL OR array_length(NEW.application_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO missing_count
  FROM unnest(NEW.application_ids) AS app_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.application a
    WHERE a.id = app_id AND a.tenant_id = NEW.tenant_id
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'product.application_ids contains % id(s) not present in application for this tenant', missing_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "product_validate_application_ids"
  BEFORE INSERT OR UPDATE OF application_ids ON "product"
  FOR EACH ROW EXECUTE FUNCTION product_validate_application_ids();

ALTER FUNCTION product_validate_application_ids() SET search_path = '';


-- ── product.base_price — §3.7, §5.6 #1 ───────────────────────────────────────
-- The most defensible denormalisation in the schema (§3.7): lets the catalog
-- grid sort/filter by price without a temporal join on every row. Maintained
-- from product_price whenever a public-tier row changes; correctness lives in
-- the trigger, not application discipline.

CREATE OR REPLACE FUNCTION product_refresh_base_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_product_id uuid;
  affected_tier_key text;
  new_base_price numeric(12,4);
BEGIN
  affected_product_id := coalesce(NEW.product_id, OLD.product_id);

  SELECT pt.key INTO affected_tier_key
  FROM public.price_tier pt
  WHERE pt.id = coalesce(NEW.price_tier_id, OLD.price_tier_id);

  IF affected_tier_key IS DISTINCT FROM 'public' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT pp.price INTO new_base_price
  FROM public.product_price pp
  JOIN public.price_tier pt ON pt.id = pp.price_tier_id
  WHERE pp.product_id = affected_product_id
    AND pt.key = 'public'
    AND pp.min_quantity_m2 = 0
    AND pp.valid_from <= now()
    AND (pp.valid_to IS NULL OR pp.valid_to > now())
  ORDER BY pp.valid_from DESC
  LIMIT 1;

  UPDATE public.product SET base_price = new_base_price WHERE id = affected_product_id;

  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER "product_price_refresh_base_price"
  AFTER INSERT OR UPDATE OR DELETE ON "product_price"
  FOR EACH ROW EXECUTE FUNCTION product_refresh_base_price();

ALTER FUNCTION product_refresh_base_price() SET search_path = '';


-- ── Check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "category" ADD CONSTRAINT "category_depth_max_4" CHECK ("depth" <= 4);
ALTER TABLE "category" ADD CONSTRAINT "category_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "product" ADD CONSTRAINT "product_width_mm_positive" CHECK ("width_mm" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_height_mm_positive" CHECK ("height_mm" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_thickness_mm_positive" CHECK ("thickness_mm" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_pei_class_range" CHECK ("pei_class" IS NULL OR ("pei_class" >= 0 AND "pei_class" <= 5));
ALTER TABLE "product" ADD CONSTRAINT "product_water_absorption_range" CHECK ("water_absorption_pct" IS NULL OR ("water_absorption_pct" >= 0 AND "water_absorption_pct" <= 100));
ALTER TABLE "product" ADD CONSTRAINT "product_pieces_per_box_positive" CHECK ("pieces_per_box" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_m2_per_box_positive" CHECK ("m2_per_box" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_kg_per_box_positive" CHECK ("kg_per_box" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "product" ADD CONSTRAINT "product_search_boost_positive" CHECK ("search_boost" > 0);

ALTER TABLE "product_price" ADD CONSTRAINT "product_price_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_min_quantity_non_negative" CHECK ("min_quantity_m2" >= 0);
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_valid_range" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");

ALTER TABLE "price_tier" ADD CONSTRAINT "price_tier_discount_pct_range" CHECK ("discount_pct" >= 0 AND "discount_pct" <= 100);

ALTER TABLE "layout_pattern" ADD CONSTRAINT "layout_pattern_wastage_pct_range" CHECK ("default_wastage_pct" >= 0 AND "default_wastage_pct" <= 100);

-- §3.6: "A CHECK prevents self-reference."
ALTER TABLE "product_relation" ADD CONSTRAINT "product_relation_not_self" CHECK ("product_id" <> "related_product_id");
ALTER TABLE "product_relation" ADD CONSTRAINT "product_relation_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));


-- ── Partial unique indexes (soft-delete-aware) ───────────────────────────────

CREATE UNIQUE INDEX "brand_tenant_id_slug_key" ON "brand" ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "collection_tenant_id_slug_key" ON "collection" ("tenant_id", "slug") WHERE "deleted_at" IS NULL;

-- product.sku unique per tenant among non-deleted rows — §3.2.
CREATE UNIQUE INDEX "product_tenant_id_sku_key" ON "product" ("tenant_id", "sku") WHERE "deleted_at" IS NULL;


-- ── Indexing plan — §12.2 ─────────────────────────────────────────────────────
-- "Index the query, not the column" — every one of these traces to a named
-- query in the UX blueprint.

-- Primary catalog browse: category page, published only.
CREATE INDEX "product_browse_idx" ON "product"
  ("tenant_id", "status", "category_id", "published_at" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'published';

-- Facet filters, most selective first.
CREATE INDEX "product_facet_idx" ON "product"
  ("tenant_id", "format_group", "finish_id", "color_family_id")
  WHERE "deleted_at" IS NULL AND "status" = 'published';

CREATE INDEX "product_surface_idx" ON "product" ("tenant_id", "surface_look_id", "material_id")
  WHERE "deleted_at" IS NULL AND "status" = 'published';

-- Technical filters (Spec mode / trade).
CREATE INDEX "product_technical_idx" ON "product" ("tenant_id", "slip_rating", "pei_class", "is_outdoor")
  WHERE "deleted_at" IS NULL AND "status" = 'published';

-- Applications containment.
CREATE INDEX "product_application_idx" ON "product" USING GIN ("application_ids");

-- Price sort — the denormalised column earning its keep.
CREATE INDEX "product_price_sort_idx" ON "product" ("tenant_id", "base_price")
  WHERE "deleted_at" IS NULL AND "status" = 'published' AND "base_price" IS NOT NULL;

-- SKU lookup, exact and fuzzy.
CREATE INDEX "product_sku_trgm_idx" ON "product" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX "product_supplier_sku_idx" ON "product" ("tenant_id", "supplier_sku")
  WHERE "supplier_sku" IS NOT NULL;

-- Dimensions range (contractor searching "anything 60 wide").
CREATE INDEX "product_dimension_idx" ON "product" ("tenant_id", "width_mm", "height_mm");

-- Full text, per locale.
CREATE INDEX "pt_search_en_idx" ON "product_translation" USING GIN ("search_vector")
  WHERE "locale" = 'en';
CREATE INDEX "pt_search_ar_idx" ON "product_translation" USING GIN ("search_vector")
  WHERE "locale" = 'ar';
CREATE UNIQUE INDEX "pt_slug_idx" ON "product_translation" ("tenant_id", "locale", "slug");

-- Category subtree.
CREATE INDEX "category_path_idx" ON "category" USING GIST ("path");


-- ── Row Level Security ───────────────────────────────────────────────────────
--
-- Two visibility families cover every table here:
--   "catalog_public_read"  — visible to anon, filtered to published/active
--   "catalog_staff_*"      — gated on the specific permission from §2.5
--
-- product_price and price_tier are the exception: confidential per §16.3
-- ("A trade customer cannot enumerate other tiers' pricing"), staff-only.

-- brand / collection — published taxonomy is public; drafts are staff-only.

ALTER TABLE "brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "brand_public_read" ON "brand"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND "is_active" AND "deleted_at" IS NULL);

CREATE POLICY "brand_staff_all" ON "brand"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

ALTER TABLE "collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "collection_public_read" ON "collection"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND "status" = 'published' AND "deleted_at" IS NULL);

CREATE POLICY "collection_staff_read" ON "collection"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "collection_staff_write" ON "collection"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "collection_staff_update" ON "collection"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

ALTER TABLE "collection_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "collection_translation_public_read" ON "collection_translation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "collection" c
      WHERE c."id" = "collection_translation"."collection_id"
        AND c."tenant_id" = app.tenant_id()
        AND (c."status" = 'published' OR app.has_permission('content.manage'))
    )
  );

CREATE POLICY "collection_translation_staff_write" ON "collection_translation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "collection" c
      WHERE c."id" = "collection_translation"."collection_id"
        AND c."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "collection" c
      WHERE c."id" = "collection_translation"."collection_id"
        AND c."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  );

-- category — no draft state; visible when active, always to staff.

ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "category_public_read" ON "category"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));

CREATE POLICY "category_staff_write" ON "category"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "category_staff_update" ON "category"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

-- Lookup tables — one shared policy shape, repeated per table (material,
-- finish, surface_look, color_family, application, layout_pattern) and their
-- *_translation siblings. Public when active; staff write via content.manage.

CREATE POLICY "material_public_read" ON "material" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "material_staff_write" ON "material" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "material_staff_update" ON "material" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "material_translation_public_read" ON "material_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "material" m WHERE m."id" = "material_translation"."material_id" AND m."tenant_id" = app.tenant_id()));
CREATE POLICY "material_translation_staff_write" ON "material_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "material" m WHERE m."id" = "material_translation"."material_id" AND m."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "material" m WHERE m."id" = "material_translation"."material_id" AND m."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "material_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "finish_public_read" ON "finish" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "finish_staff_write" ON "finish" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "finish_staff_update" ON "finish" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "finish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finish" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "finish_translation_public_read" ON "finish_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "finish" f WHERE f."id" = "finish_translation"."finish_id" AND f."tenant_id" = app.tenant_id()));
CREATE POLICY "finish_translation_staff_write" ON "finish_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "finish" f WHERE f."id" = "finish_translation"."finish_id" AND f."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "finish" f WHERE f."id" = "finish_translation"."finish_id" AND f."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "finish_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finish_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "surface_look_public_read" ON "surface_look" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "surface_look_staff_write" ON "surface_look" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "surface_look_staff_update" ON "surface_look" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "surface_look" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "surface_look" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "surface_look_translation_public_read" ON "surface_look_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "surface_look" s WHERE s."id" = "surface_look_translation"."surface_look_id" AND s."tenant_id" = app.tenant_id()));
CREATE POLICY "surface_look_translation_staff_write" ON "surface_look_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "surface_look" s WHERE s."id" = "surface_look_translation"."surface_look_id" AND s."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "surface_look" s WHERE s."id" = "surface_look_translation"."surface_look_id" AND s."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "surface_look_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "surface_look_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "color_family_public_read" ON "color_family" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "color_family_staff_write" ON "color_family" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "color_family_staff_update" ON "color_family" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "color_family" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "color_family" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "color_family_translation_public_read" ON "color_family_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "color_family" cf WHERE cf."id" = "color_family_translation"."color_family_id" AND cf."tenant_id" = app.tenant_id()));
CREATE POLICY "color_family_translation_staff_write" ON "color_family_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "color_family" cf WHERE cf."id" = "color_family_translation"."color_family_id" AND cf."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "color_family" cf WHERE cf."id" = "color_family_translation"."color_family_id" AND cf."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "color_family_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "color_family_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "application_public_read" ON "application" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "application_staff_write" ON "application" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "application_staff_update" ON "application" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "application_translation_public_read" ON "application_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "application" a WHERE a."id" = "application_translation"."application_id" AND a."tenant_id" = app.tenant_id()));
CREATE POLICY "application_translation_staff_write" ON "application_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "application" a WHERE a."id" = "application_translation"."application_id" AND a."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "application" a WHERE a."id" = "application_translation"."application_id" AND a."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "application_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "layout_pattern_public_read" ON "layout_pattern" FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_active" OR app.has_permission('content.manage')));
CREATE POLICY "layout_pattern_staff_write" ON "layout_pattern" FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
CREATE POLICY "layout_pattern_staff_update" ON "layout_pattern" FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));
ALTER TABLE "layout_pattern" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layout_pattern" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "layout_pattern_translation_public_read" ON "layout_pattern_translation" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "layout_pattern" lp WHERE lp."id" = "layout_pattern_translation"."layout_pattern_id" AND lp."tenant_id" = app.tenant_id()));
CREATE POLICY "layout_pattern_translation_staff_write" ON "layout_pattern_translation" FOR ALL
  USING (EXISTS (SELECT 1 FROM "layout_pattern" lp WHERE lp."id" = "layout_pattern_translation"."layout_pattern_id" AND lp."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM "layout_pattern" lp WHERE lp."id" = "layout_pattern_translation"."layout_pattern_id" AND lp."tenant_id" = app.tenant_id() AND app.has_permission('content.manage')));
ALTER TABLE "layout_pattern_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layout_pattern_translation" FORCE  ROW LEVEL SECURITY;

-- product — the core public_read pattern from §16.3, verbatim: published and
-- non-deleted for anon; staff with product.read see every status.

ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_public_read" ON "product"
  FOR SELECT
  USING (
    "tenant_id" = app.tenant_id()
    AND (
      ("status" = 'published' AND "deleted_at" IS NULL)
      OR app.has_permission('product.read')
    )
  );

CREATE POLICY "product_staff_insert" ON "product"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('product.create'));

CREATE POLICY "product_staff_update" ON "product"
  FOR UPDATE
  USING (
    "tenant_id" = app.tenant_id()
    AND (app.has_permission('product.update') OR app.has_permission('product.publish'))
  )
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND (app.has_permission('product.update') OR app.has_permission('product.publish'))
  );

-- Real DELETE, not just soft-delete-via-UPDATE, is intentionally restricted
-- to product.delete — a narrower grant than update (§2.5: owner/admin only).
CREATE POLICY "product_staff_delete" ON "product"
  FOR DELETE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('product.delete'));

ALTER TABLE "product_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_translation_read" ON "product_translation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_translation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND (
          (p."status" = 'published' AND p."deleted_at" IS NULL)
          OR app.has_permission('product.read')
        )
    )
  );

CREATE POLICY "product_translation_staff_write" ON "product_translation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_translation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_translation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  );

-- product_attribute / product_attribute_translation — filter metadata, not
-- product data. Public when the attribute itself is filterable (so the
-- catalog UI can read the vocabulary); full read plus write is content.manage.

ALTER TABLE "product_attribute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_attribute_public_read" ON "product_attribute"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("is_filterable" OR app.has_permission('content.manage')));

CREATE POLICY "product_attribute_staff_write" ON "product_attribute"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

CREATE POLICY "product_attribute_staff_update" ON "product_attribute"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('content.manage'));

ALTER TABLE "product_attribute_translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_translation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_attribute_translation_read" ON "product_attribute_translation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "product_attribute" pa
      WHERE pa."id" = "product_attribute_translation"."attribute_id"
        AND pa."tenant_id" = app.tenant_id()
    )
  );

CREATE POLICY "product_attribute_translation_staff_write" ON "product_attribute_translation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "product_attribute" pa
      WHERE pa."id" = "product_attribute_translation"."attribute_id"
        AND pa."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "product_attribute" pa
      WHERE pa."id" = "product_attribute_translation"."attribute_id"
        AND pa."tenant_id" = app.tenant_id()
        AND app.has_permission('content.manage')
    )
  );

-- product_attribute_value / product_relation — visibility mirrors the parent
-- product; write follows product.update, since editing attribute values or
-- curating relations is editing the product.

ALTER TABLE "product_attribute_value" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_value" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_attribute_value_read" ON "product_attribute_value"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_attribute_value"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND ((p."status" = 'published' AND p."deleted_at" IS NULL) OR app.has_permission('product.read'))
    )
  );

CREATE POLICY "product_attribute_value_staff_write" ON "product_attribute_value"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_attribute_value"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_attribute_value"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  );

ALTER TABLE "product_relation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_relation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_relation_read" ON "product_relation"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_relation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND ((p."status" = 'published' AND p."deleted_at" IS NULL) OR app.has_permission('product.read'))
    )
  );

CREATE POLICY "product_relation_staff_write" ON "product_relation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_relation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."id" = "product_relation"."product_id"
        AND p."tenant_id" = app.tenant_id()
        AND app.has_permission('product.update')
    )
  );

-- price_tier / product_price — confidential (§16.3: "A trade customer cannot
-- enumerate other tiers' pricing"). The public tier's existence is not
-- sensitive (its 0% discount is what makes product.base_price meaningful);
-- every other tier, and every product_price row regardless of tier, is
-- staff-only. Per-customer trade-price resolution is a server-side use-case
-- (docs/04 §5.3), never a direct client read of this table.

ALTER TABLE "price_tier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_tier" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "price_tier_public_read" ON "price_tier"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND "key" = 'public');

CREATE POLICY "price_tier_staff_read" ON "price_tier"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('price.trade.read'));

CREATE POLICY "price_tier_staff_write" ON "price_tier"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('price.base.write'));

CREATE POLICY "price_tier_staff_update" ON "price_tier"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('price.base.write'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('price.base.write'));

ALTER TABLE "product_price" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_price" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_price_staff_read" ON "product_price"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('price.trade.read'));

CREATE POLICY "product_price_staff_write" ON "product_price"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('price.base.write'));

CREATE POLICY "product_price_staff_update" ON "product_price"
  FOR UPDATE
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('price.trade.write'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('price.trade.write'));

-- No DELETE policy on product_price: a price row is a historical fact
-- (§7.3's snapshot columns depend on prices having existed at a point in
-- time); superseding a price is a new row with a fresh valid_from, not a
-- deletion of the old one.
