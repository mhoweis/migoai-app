ALTER TABLE "bookings" ADD COLUMN "invite_code" VARCHAR(16);

CREATE TABLE "follows" (
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id")
);

CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

CREATE TABLE "event_invites" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "event_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_invites_code_key" ON "event_invites"("code");
CREATE UNIQUE INDEX "event_invites_event_id_inviter_id_key" ON "event_invites"("event_id", "inviter_id");

ALTER TABLE "follows"
  ADD CONSTRAINT "follows_follower_id_fkey"
  FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows"
  ADD CONSTRAINT "follows_following_id_fkey"
  FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_invites"
  ADD CONSTRAINT "event_invites_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_invites"
  ADD CONSTRAINT "event_invites_inviter_id_fkey"
  FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
