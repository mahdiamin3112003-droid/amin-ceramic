-- =============================================================================
-- 0022 · AI domain — indexes, constraints, RLS
-- docs/03-database-design.md §9, §12, §16
-- =============================================================================

-- ── ai_interaction partitions — RLS, same pattern as inventory_movement/
-- product_view ───────────────────────────────────────────────────────────────

ALTER TABLE "ai_interaction_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_2026_08" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_2026_09" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_2026_10" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction_default" FORCE ROW LEVEL SECURITY;


-- ── product_embedding — §9.1 vector indexes ──────────────────────────────────
-- Partial HNSW on is_current keeps the index at exactly one entry per
-- product during a re-index migration rather than two. The unique index
-- mirrors the doc's example for visual_model; a matching one for
-- semantic_model is added for the same reason — not in the doc's SQL sample
-- verbatim but the same "exactly one current row per (product, model
-- family)" invariant §9.1's prose states for both vectors.

CREATE INDEX ON "product_embedding" USING hnsw ("visual_embedding" halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE "is_current";
CREATE INDEX ON "product_embedding" USING hnsw ("semantic_embedding" halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE "is_current";
CREATE UNIQUE INDEX ON "product_embedding" ("product_id", "visual_model") WHERE "is_current";
CREATE UNIQUE INDEX ON "product_embedding" ("product_id", "semantic_model") WHERE "is_current";


-- ── check constraints ─────────────────────────────────────────────────────────

ALTER TABLE "finder_result"
  ADD CONSTRAINT "finder_result_rank_positive" CHECK ("rank" > 0);

ALTER TABLE "ai_message"
  ADD CONSTRAINT "ai_message_sequence_non_negative" CHECK ("sequence" >= 0);

ALTER TABLE "ai_interaction"
  ADD CONSTRAINT "ai_interaction_cost_non_negative" CHECK ("cost_usd" >= 0);


-- ── RLS — §16 ─────────────────────────────────────────────────────────────────
-- product_embedding: staff/service only — raw vectors aren't meant to reach
-- anon clients directly; search reads them via a backend service role, which
-- bypasses RLS. finder_session/result and ai_conversation/message/tool_call:
-- owner (visitor) + staff (analytics.read). ai_interaction: the cost ledger —
-- staff read only (ai.costs.read); no client-side insert policy at all,
-- since these rows are written by the backend AI service layer (service_role,
-- which bypasses RLS), the same posture as inventory_movement being
-- staff-driven rather than end-user-driven. ai_feedback: owner insert, staff
-- read.

ALTER TABLE "product_embedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_embedding" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "product_embedding_staff_read" ON "product_embedding"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('ai.configure'));

CREATE POLICY "product_embedding_staff_write" ON "product_embedding"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('ai.configure'))
  WITH CHECK ("tenant_id" = app.tenant_id() AND app.has_permission('ai.configure'));


ALTER TABLE "finder_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finder_session" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "finder_session_owner_all" ON "finder_session"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('analytics.read')))
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id());


ALTER TABLE "finder_result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finder_result" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "finder_result_read" ON "finder_result"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "finder_session" fs
      WHERE fs."id" = "finder_result"."finder_session_id"
        AND fs."tenant_id" = app.tenant_id()
        AND (fs."visitor_id" = app.visitor_id() OR app.has_permission('analytics.read'))
    )
  );

CREATE POLICY "finder_result_owner_update" ON "finder_result"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "finder_session" fs
      WHERE fs."id" = "finder_result"."finder_session_id"
        AND fs."tenant_id" = app.tenant_id()
        AND fs."visitor_id" = app.visitor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "finder_session" fs
      WHERE fs."id" = "finder_result"."finder_session_id"
        AND fs."tenant_id" = app.tenant_id()
        AND fs."visitor_id" = app.visitor_id()
    )
  );


ALTER TABLE "ai_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_conversation" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ai_conversation_owner_all" ON "ai_conversation"
  FOR ALL
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('analytics.read')))
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id());


ALTER TABLE "ai_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_message" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ai_message_read" ON "ai_message"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ai_conversation" c
      WHERE c."id" = "ai_message"."conversation_id"
        AND c."tenant_id" = app.tenant_id()
        AND (c."visitor_id" = app.visitor_id() OR app.has_permission('analytics.read'))
    )
  );

CREATE POLICY "ai_message_owner_insert" ON "ai_message"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ai_conversation" c
      WHERE c."id" = "ai_message"."conversation_id"
        AND c."tenant_id" = app.tenant_id()
        AND c."visitor_id" = app.visitor_id()
    )
  );


ALTER TABLE "ai_tool_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_tool_call" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ai_tool_call_read" ON "ai_tool_call"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ai_message" m
      JOIN "ai_conversation" c ON c."id" = m."conversation_id"
      WHERE m."id" = "ai_tool_call"."message_id"
        AND c."tenant_id" = app.tenant_id()
        AND (c."visitor_id" = app.visitor_id() OR app.has_permission('analytics.read'))
    )
  );

CREATE POLICY "ai_tool_call_owner_insert" ON "ai_tool_call"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ai_message" m
      JOIN "ai_conversation" c ON c."id" = m."conversation_id"
      WHERE m."id" = "ai_tool_call"."message_id"
        AND c."tenant_id" = app.tenant_id()
        AND c."visitor_id" = app.visitor_id()
    )
  );


ALTER TABLE "ai_interaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interaction" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ai_interaction_staff_read" ON "ai_interaction"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND app.has_permission('ai.costs.read'));


ALTER TABLE "ai_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_feedback" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "ai_feedback_owner_insert" ON "ai_feedback"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id() AND "visitor_id" = app.visitor_id());

CREATE POLICY "ai_feedback_read" ON "ai_feedback"
  FOR SELECT
  USING ("tenant_id" = app.tenant_id() AND ("visitor_id" = app.visitor_id() OR app.has_permission('analytics.read')));
