ALTER TABLE "users"
ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "follow_requests" (
    "requester_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("requester_id", "target_id")
);

CREATE INDEX "follow_requests_target_id_idx" ON "follow_requests"("target_id");

ALTER TABLE "follow_requests"
ADD CONSTRAINT "follow_requests_requester_id_fkey"
FOREIGN KEY ("requester_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follow_requests"
ADD CONSTRAINT "follow_requests_target_id_fkey"
FOREIGN KEY ("target_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
