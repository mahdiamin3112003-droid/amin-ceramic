-- =============================================================================
-- 0027 · Platform domain — tables
-- docs/03-database-design.md §11, §13.2
-- =============================================================================
--
-- Prisma-generated DDL, usual diff noise excluded. audit_log,
-- connector_event_log and notification_delivery are built directly as
-- monthly RANGE-partitioned tables per the plan's partition list, the same
-- as product_view/ai_interaction/analytics_event.

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'whatsapp', 'sms', 'in_app', 'push');

-- CreateEnum
CREATE TYPE "notification_recipient_type" AS ENUM ('user', 'visitor', 'contact', 'role');

-- CreateEnum
CREATE TYPE "notification_priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed');

-- CreateEnum
CREATE TYPE "connector_health_status" AS ENUM ('healthy', 'degraded', 'failing', 'unconfigured');

-- CreateEnum
CREATE TYPE "outbox_event_status" AS ENUM ('pending', 'processing', 'delivered', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "connector_event_direction" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('user', 'system', 'api_key', 'job');

-- CreateEnum
CREATE TYPE "app_setting_scope" AS ENUM ('public', 'private');

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "locale" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "recipient_type" "notification_recipient_type" NOT NULL,
    "recipient_id" UUID,
    "recipient_email" TEXT,
    "recipient_phone" TEXT,
    "template_key" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "priority" "notification_priority" NOT NULL DEFAULT 'normal',
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable (partitioned — see file header)
CREATE TABLE "notification_delivery" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "status" "notification_status" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),
    "clicked_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id","created_at")
) PARTITION BY RANGE ("created_at");

CREATE TABLE "notification_delivery_2026_08" PARTITION OF "notification_delivery"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "notification_delivery_2026_09" PARTITION OF "notification_delivery"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "notification_delivery_2026_10" PARTITION OF "notification_delivery"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "notification_delivery_default" PARTITION OF "notification_delivery" DEFAULT;

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "app_user_id" UUID,
    "visitor_id" UUID,
    "category" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribe_token" TEXT NOT NULL,
    "suppressed_until" TIMESTAMPTZ(6),

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_suppression" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "email" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "connector_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials_ref" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subscribed_events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "health_status" "connector_health_status" NOT NULL DEFAULT 'unconfigured',
    "last_health_check_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "connector_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_event_status" NOT NULL DEFAULT 'pending',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "locked_until" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable (partitioned — see file header)
CREATE TABLE "connector_event_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "connector_config_id" UUID NOT NULL,
    "outbox_event_id" BIGINT,
    "direction" "connector_event_direction" NOT NULL,
    "status" TEXT NOT NULL,
    "request_summary" JSONB,
    "response_summary" JSONB,
    "duration_ms" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_event_log_pkey" PRIMARY KEY ("id","created_at")
) PARTITION BY RANGE ("created_at");

CREATE TABLE "connector_event_log_2026_08" PARTITION OF "connector_event_log"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "connector_event_log_2026_09" PARTITION OF "connector_event_log"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "connector_event_log_2026_10" PARTITION OF "connector_event_log"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "connector_event_log_default" PARTITION OF "connector_event_log" DEFAULT;

-- CreateTable (partitioned — see file header)
CREATE TABLE "audit_log" (
    "id" BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY,
    "tenant_id" UUID NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "entity_label" TEXT,
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");

CREATE TABLE "audit_log_2026_08" PARTITION OF "audit_log"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "audit_log_2026_09" PARTITION OF "audit_log"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "audit_log_2026_10" PARTITION OF "audit_log"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "audit_log_default" PARTITION OF "audit_log" DEFAULT;

-- CreateTable
CREATE TABLE "app_setting" (
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "data_type" TEXT NOT NULL,
    "scope" "app_setting_scope" NOT NULL DEFAULT 'private',
    "description" TEXT,
    "updated_by" UUID,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("tenant_id","key")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "key" TEXT NOT NULL,
    "tenant_id" UUID,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percent" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_redirect" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "tenant_id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 301,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "url_redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_tenant_id_key_channel_locale_key" ON "notification_template"("tenant_id", "key", "channel", "locale");

-- CreateIndex
CREATE INDEX "notification_tenant_id_status_idx" ON "notification"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "notification_tenant_id_recipient_type_recipient_id_idx" ON "notification"("tenant_id", "recipient_type", "recipient_id");

-- CreateIndex
CREATE INDEX "notification_delivery_notification_id_idx" ON "notification_delivery"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_unsubscribe_token_key" ON "notification_preference"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "connector_config_tenant_id_connector_key_key" ON "connector_config"("tenant_id", "connector_key");

-- CreateIndex
CREATE INDEX "connector_event_log_connector_config_id_created_at_idx" ON "connector_event_log"("connector_config_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_entity_id_occurred_at_idx" ON "audit_log"("tenant_id", "entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_actor_id_occurred_at_idx" ON "audit_log"("tenant_id", "actor_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "url_redirect_tenant_id_from_path_key" ON "url_redirect"("tenant_id", "from_path");

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_config" ADD CONSTRAINT "connector_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_event_log" ADD CONSTRAINT "connector_event_log_connector_config_id_fkey" FOREIGN KEY ("connector_config_id") REFERENCES "connector_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_event_log" ADD CONSTRAINT "connector_event_log_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_redirect" ADD CONSTRAINT "url_redirect_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
