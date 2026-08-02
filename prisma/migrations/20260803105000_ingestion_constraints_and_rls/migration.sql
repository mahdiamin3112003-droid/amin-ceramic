-- =============================================================================
-- 0024 · Ingestion domain — triggers, constraints, RLS
-- docs/03-database-design.md §9.5, §16
-- =============================================================================

-- ── staging_field confidence gate — §9.5 ──────────────────────────────────────
-- "A field with confidence < 0.5 stores its raw_value but leaves
-- normalized_value NULL, so the review UI renders an empty required field
-- rather than a plausible wrong one." Enforced here rather than trusted to
-- the extraction pipeline, since a pipeline bug that skips this rule would
-- otherwise surface as a silent wrong-data defect instead of a loud one.

CREATE OR REPLACE FUNCTION staging_field_enforce_confidence_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.confidence IS NOT NULL AND NEW.confidence < 0.5 THEN
    NEW.normalized_value := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "staging_field_enforce_confidence_gate"
  BEFORE INSERT OR UPDATE OF "confidence", "normalized_value" ON "staging_field"
  FOR EACH ROW EXECUTE FUNCTION staging_field_enforce_confidence_gate();

ALTER FUNCTION staging_field_enforce_confidence_gate() SET search_path = '';


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "staging_field"
  ADD CONSTRAINT "staging_field_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

ALTER TABLE "staging_product"
  ADD CONSTRAINT "staging_product_overall_confidence_range" CHECK ("overall_confidence" IS NULL OR ("overall_confidence" >= 0 AND "overall_confidence" <= 1)),
  ADD CONSTRAINT "staging_product_duplicate_score_range" CHECK ("duplicate_score" IS NULL OR ("duplicate_score" >= 0 AND "duplicate_score" <= 1));

ALTER TABLE "ingestion_job"
  ADD CONSTRAINT "ingestion_job_counts_non_negative" CHECK (
    "extracted_count" >= 0 AND "approved_count" >= 0 AND "rejected_count" >= 0 AND "needs_review_count" >= 0
  );

ALTER TABLE "supplier_mapping"
  ADD CONSTRAINT "supplier_mapping_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- Entirely staff-only — this is a back-office review pipeline, never visitor-
-- facing. ingestion.run covers running/configuring jobs; ingestion.approve
-- covers the staging review/approve/reject workflow. Reviewers need read
-- access to jobs/documents/regions to do their work, so read is granted to
-- either permission; write is split per the permission that actually governs
-- each action.

ALTER TABLE "ingestion_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_job" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ingestion_job_staff_read" ON "ingestion_job"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND (app.has_permission('ingestion.run') OR app.has_permission('ingestion.approve')));

CREATE POLICY "ingestion_job_staff_write" ON "ingestion_job"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('ingestion.run'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('ingestion.run'));


ALTER TABLE "ingestion_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_document" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ingestion_document_staff_read" ON "ingestion_document"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "ingestion_document"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND (app.has_permission('ingestion.run') OR app.has_permission('ingestion.approve'))
    )
  );

CREATE POLICY "ingestion_document_staff_write" ON "ingestion_document"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "ingestion_document"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "ingestion_document"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  );


ALTER TABLE "ingestion_region" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_region" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ingestion_region_staff_read" ON "ingestion_region"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_document" d
      JOIN "ingestion_job" j ON j."id" = d."job_id"
      WHERE d."id" = "ingestion_region"."document_id"
        AND j."tenant_id" = app.tenant_id()
        AND (app.has_permission('ingestion.run') OR app.has_permission('ingestion.approve'))
    )
  );

CREATE POLICY "ingestion_region_staff_write" ON "ingestion_region"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_document" d
      JOIN "ingestion_job" j ON j."id" = d."job_id"
      WHERE d."id" = "ingestion_region"."document_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ingestion_document" d
      JOIN "ingestion_job" j ON j."id" = d."job_id"
      WHERE d."id" = "ingestion_region"."document_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  );


ALTER TABLE "staging_product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staging_product" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "staging_product_staff_read" ON "staging_product"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "staging_product"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND (app.has_permission('ingestion.run') OR app.has_permission('ingestion.approve'))
    )
  );

CREATE POLICY "staging_product_pipeline_insert" ON "staging_product"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "staging_product"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  );

CREATE POLICY "staging_product_reviewer_update" ON "staging_product"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "staging_product"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.approve')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ingestion_job" j
      WHERE j."id" = "staging_product"."job_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.approve')
    )
  );


ALTER TABLE "staging_field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staging_field" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "staging_field_staff_read" ON "staging_field"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "staging_product" sp
      JOIN "ingestion_job" j ON j."id" = sp."job_id"
      WHERE sp."id" = "staging_field"."staging_product_id"
        AND j."tenant_id" = app.tenant_id()
        AND (app.has_permission('ingestion.run') OR app.has_permission('ingestion.approve'))
    )
  );

CREATE POLICY "staging_field_pipeline_insert" ON "staging_field"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "staging_product" sp
      JOIN "ingestion_job" j ON j."id" = sp."job_id"
      WHERE sp."id" = "staging_field"."staging_product_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.run')
    )
  );

CREATE POLICY "staging_field_reviewer_update" ON "staging_field"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "staging_product" sp
      JOIN "ingestion_job" j ON j."id" = sp."job_id"
      WHERE sp."id" = "staging_field"."staging_product_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.approve')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "staging_product" sp
      JOIN "ingestion_job" j ON j."id" = sp."job_id"
      WHERE sp."id" = "staging_field"."staging_product_id"
        AND j."tenant_id" = app.tenant_id()
        AND app.has_permission('ingestion.approve')
    )
  );


ALTER TABLE "supplier_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_mapping" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "supplier_mapping_staff_all" ON "supplier_mapping"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('ingestion.run'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('ingestion.run'));
