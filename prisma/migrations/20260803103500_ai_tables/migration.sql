-- =============================================================================
-- 0021 · AI domain — tables
-- docs/03-database-design.md §9, §13.2
-- =============================================================================
--
-- Prisma-generated DDL, usual diff noise excluded. ai_interaction is built
-- directly as a monthly RANGE-partitioned table (by created_at, §13.2),
-- same as product_view — it's new, no data-safety reason to convert later.

-- CreateEnum
CREATE TYPE "finder_gate_result" AS ENUM ('accepted', 'not_a_tile', 'too_dark', 'too_angled', 'unsafe');

-- CreateEnum
CREATE TYPE "finder_confidence_band" AS ENUM ('strong', 'moderate', 'weak', 'none');

-- CreateEnum
CREATE TYPE "assistant_type" AS ENUM ('interior', 'admin', 'search');

-- CreateEnum
CREATE TYPE "ai_conversation_status" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "ai_tool_call_status" AS ENUM ('success', 'error', 'timeout');

-- CreateEnum
CREATE TYPE "ai_feature" AS ENUM ('tile_finder', 'assistant', 'ingestion_extract', 'ingestion_copy', 'embedding_visual', 'embedding_semantic', 'alt_text', 'translation', 'rerank', 'safety_gate', 'visualizer');

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('openai', 'gemini', 'siglip_host', 'local');

-- CreateEnum
CREATE TYPE "ai_operation" AS ENUM ('chat', 'vision', 'embed', 'rerank', 'image_gen');

-- CreateEnum
CREATE TYPE "ai_interaction_status" AS ENUM ('success', 'error', 'timeout', 'rate_limited', 'filtered');

-- CreateEnum
CREATE TYPE "ai_feedback_reference_type" AS ENUM ('finder_result', 'ai_message', 'recommendation', 'generated_copy');

-- CreateEnum
CREATE TYPE "ai_feedback_rating" AS ENUM ('positive', 'negative');

-- CreateEnum
CREATE TYPE "ai_feedback_reason" AS ENUM ('wrong_colour', 'wrong_size', 'wrong_finish', 'not_relevant', 'inaccurate_spec', 'other');

-- CreateEnum
CREATE TYPE "ai_interaction_reference_type" AS ENUM ('finder_session', 'ai_conversation', 'quote_request', 'ingestion_job', 'product');

-- CreateTable
CREATE TABLE "product_embedding" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "visual_embedding" halfvec(1152),
    "semantic_embedding" halfvec(1536),
    "visual_model" TEXT,
    "semantic_model" TEXT,
    "visual_model_version" TEXT,
    "semantic_model_version" TEXT,
    "source_media_id" UUID,
    "embedding_input_hash" TEXT,
    "is_current" BOOLEAN NOT NULL,
    "generated_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finder_session" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "app_user_id" UUID,
    "upload_id" UUID,
    "image_phash" TEXT,
    "gate_result" "finder_gate_result" NOT NULL,
    "extracted_attributes" JSONB,
    "user_corrections" JSONB,
    "query_visual_embedding" halfvec(1152),
    "top_score" DECIMAL(6,5),
    "score_distribution" JSONB,
    "confidence_band" "finder_confidence_band",
    "result_count" SMALLINT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finder_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finder_result" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "finder_session_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "visual_score" DECIMAL(6,5),
    "semantic_score" DECIMAL(6,5),
    "fused_score" DECIMAL(6,5),
    "calibrated_percent" DECIMAL(5,2),
    "explanation" TEXT,
    "was_clicked" BOOLEAN NOT NULL DEFAULT false,
    "was_saved" BOOLEAN NOT NULL DEFAULT false,
    "was_quoted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "finder_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "app_user_id" UUID,
    "assistant_type" "assistant_type" NOT NULL,
    "title" TEXT,
    "locale" TEXT,
    "status" "ai_conversation_status" NOT NULL DEFAULT 'active',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "resulted_in_quote" BOOLEAN NOT NULL DEFAULT false,
    "quote_request_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT,
    "content_summary" TEXT,
    "tool_payload" JSONB,
    "referenced_product_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "latency_ms" INTEGER,
    "finish_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_call" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "message_id" BIGINT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "result_summary" JSONB,
    "result_row_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "ai_tool_call_status" NOT NULL,
    "duration_ms" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "ai_tool_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable (partitioned — see file header)
CREATE TABLE "ai_interaction" (
    "id" BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY,
    "tenant_id" UUID NOT NULL,
    "feature" "ai_feature" NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" TEXT,
    "model_version" TEXT,
    "operation" "ai_operation" NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "image_count" INTEGER,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "status" "ai_interaction_status" NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "cache_hit" BOOLEAN,
    "request_hash" TEXT,
    "reference_type" "ai_interaction_reference_type",
    "reference_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_pkey" PRIMARY KEY ("id","created_at")
) PARTITION BY RANGE ("created_at");

CREATE TABLE "ai_interaction_2026_08" PARTITION OF "ai_interaction"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "ai_interaction_2026_09" PARTITION OF "ai_interaction"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "ai_interaction_2026_10" PARTITION OF "ai_interaction"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "ai_interaction_default" PARTITION OF "ai_interaction" DEFAULT;

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "reference_type" "ai_feedback_reference_type" NOT NULL,
    "reference_id" UUID NOT NULL,
    "rating" "ai_feedback_rating" NOT NULL,
    "reason" "ai_feedback_reason",
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_embedding_tenant_id_product_id_idx" ON "product_embedding"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "finder_session_tenant_id_visitor_id_idx" ON "finder_session"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "finder_result_finder_session_id_rank_idx" ON "finder_result"("finder_session_id", "rank");

-- CreateIndex
CREATE INDEX "ai_conversation_tenant_id_visitor_id_idx" ON "ai_conversation"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "ai_conversation_tenant_id_status_idx" ON "ai_conversation"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_conversation_id_sequence_key" ON "ai_message"("conversation_id", "sequence");

-- CreateIndex
CREATE INDEX "ai_tool_call_message_id_idx" ON "ai_tool_call"("message_id");

-- CreateIndex
CREATE INDEX "ai_interaction_tenant_id_feature_created_at_idx" ON "ai_interaction"("tenant_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_interaction_tenant_id_created_at_idx" ON "ai_interaction"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_feedback_tenant_id_reference_type_reference_id_idx" ON "ai_feedback"("tenant_id", "reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "product_embedding" ADD CONSTRAINT "product_embedding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embedding" ADD CONSTRAINT "product_embedding_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finder_session" ADD CONSTRAINT "finder_session_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finder_session" ADD CONSTRAINT "finder_session_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finder_session" ADD CONSTRAINT "finder_session_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finder_result" ADD CONSTRAINT "finder_result_finder_session_id_fkey" FOREIGN KEY ("finder_session_id") REFERENCES "finder_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finder_result" ADD CONSTRAINT "finder_result_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_call" ADD CONSTRAINT "ai_tool_call_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction" ADD CONSTRAINT "ai_interaction_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
