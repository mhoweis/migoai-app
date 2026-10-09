CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "ticket_transfers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT,
    "to_email" VARCHAR(255) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "ticket_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_transfers_code_key" ON "ticket_transfers"("code");
CREATE INDEX "ticket_transfers_booking_id_idx" ON "ticket_transfers"("booking_id");
CREATE INDEX "ticket_transfers_to_email_idx" ON "ticket_transfers"("to_email");

ALTER TABLE "ticket_transfers"
  ADD CONSTRAINT "ticket_transfers_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_transfers"
  ADD CONSTRAINT "ticket_transfers_from_user_id_fkey"
  FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_transfers"
  ADD CONSTRAINT "ticket_transfers_to_user_id_fkey"
  FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
