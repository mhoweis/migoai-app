/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `suppliers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('HOST', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "EventStatus" ADD VALUE 'BANNED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPPLIER';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "banned_by_id" TEXT,
ADD COLUMN     "banned_reason" TEXT,
ADD COLUMN     "supplier_rank" INTEGER;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "banner" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "feed_last_status" TEXT,
ADD COLUMN     "feed_last_sync_at" TIMESTAMP(3),
ADD COLUMN     "feed_url" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "slug" VARCHAR(255);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "paused_at" TIMESTAMP(3),
ADD COLUMN     "paused_reason" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supplier_id" TEXT;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" "PlanKey" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "amount_aed" DECIMAL(10,2) NOT NULL,
    "provider" VARCHAR(50),
    "reference" VARCHAR(255),
    "return_url" TEXT,
    "business_name" VARCHAR(120),
    "website" TEXT,
    "current_period_end" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "admin_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "target_id" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_reference_key" ON "subscriptions"("reference");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "admin_actions_target_type_target_id_idx" ON "admin_actions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions"("created_at");

-- CreateIndex
CREATE INDEX "events_supplier_rank_idx" ON "events"("supplier_rank");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_slug_key" ON "suppliers"("slug");

-- CreateIndex
CREATE INDEX "users_supplier_id_idx" ON "users"("supplier_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE users SET role='ORGANIZER' WHERE role='USER' AND is_organizer = true;
UPDATE suppliers SET slug = source_key WHERE slug IS NULL;
