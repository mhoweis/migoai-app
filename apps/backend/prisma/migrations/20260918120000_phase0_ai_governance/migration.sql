-- Phase 0: AI cost governance, signal capture, affiliate attribution

-- Per-user daily AI usage (quota + token budget enforcement)
CREATE TABLE "ai_usage_daily" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_usage_daily_user_id_day_key" ON "ai_usage_daily"("user_id", "day");
CREATE INDEX "ai_usage_daily_day_idx" ON "ai_usage_daily"("day");

-- Global daily spend + kill switch
CREATE TABLE "ai_spend_daily" (
    "day" DATE NOT NULL,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "killed" BOOLEAN NOT NULL DEFAULT false,
    "killed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_spend_daily_pkey" PRIMARY KEY ("day")
);

-- Append-only behavioural signals (feeds the taste model from week 6)
CREATE TABLE "user_signals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT,
    "type" VARCHAR(40) NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_signals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_signals_user_id_created_at_idx" ON "user_signals"("user_id", "created_at");
CREATE INDEX "user_signals_event_id_idx" ON "user_signals"("event_id");
CREATE INDEX "user_signals_type_idx" ON "user_signals"("type");

-- One row per click-out, for affiliate attribution
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "user_id" TEXT,
    "event_id" TEXT NOT NULL,
    "supplier" VARCHAR(50) NOT NULL,
    "target_url" TEXT NOT NULL,
    "placement" VARCHAR(60),
    "ip_hash" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "affiliate_clicks_token_key" ON "affiliate_clicks"("token");
CREATE INDEX "affiliate_clicks_user_id_created_at_idx" ON "affiliate_clicks"("user_id", "created_at");
CREATE INDEX "affiliate_clicks_event_id_idx" ON "affiliate_clicks"("event_id");
CREATE INDEX "affiliate_clicks_supplier_created_at_idx" ON "affiliate_clicks"("supplier", "created_at");
