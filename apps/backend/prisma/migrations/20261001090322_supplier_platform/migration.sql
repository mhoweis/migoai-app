-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'PROSPECT', 'PAUSED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "affiliate_clicks" ADD COLUMN     "platform" VARCHAR(20);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "source_key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(30),
    "website" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_campaigns" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "package_key" VARCHAR(50) NOT NULL,
    "event_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "price_aed" DECIMAL(10,2) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_source_key_key" ON "suppliers"("source_key");

-- CreateIndex
CREATE INDEX "supplier_campaigns_supplier_id_idx" ON "supplier_campaigns"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_campaigns_status_ends_at_idx" ON "supplier_campaigns"("status", "ends_at");

-- AddForeignKey
ALTER TABLE "supplier_campaigns" ADD CONSTRAINT "supplier_campaigns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
