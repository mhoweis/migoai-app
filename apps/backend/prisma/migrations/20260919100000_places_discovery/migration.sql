-- Places: Google Maps venue discovery (cached, shared across users)

CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "external_id" VARCHAR(191) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" VARCHAR(150),
    "address" TEXT,
    "city" VARCHAR(120),
    "country" VARCHAR(120),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" VARCHAR(60),
    "website" TEXT,
    "maps_url" TEXT,
    "thumbnail" TEXT,
    "price_range" VARCHAR(20),
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER DEFAULT 0,
    "instagram" VARCHAR(300),
    "facebook" VARCHAR(300),
    "linkedin" VARCHAR(300),
    "is_venue" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "places_external_id_key" ON "places"("external_id");
CREATE INDEX "places_city_idx" ON "places"("city");
CREATE INDEX "places_category_idx" ON "places"("category");
CREATE INDEX "places_latitude_longitude_idx" ON "places"("latitude", "longitude");
CREATE INDEX "places_is_venue_idx" ON "places"("is_venue");
CREATE INDEX "places_rating_idx" ON "places"("rating");

CREATE TABLE "place_searches" (
    "id" TEXT NOT NULL,
    "query_key" VARCHAR(400) NOT NULL,
    "keyword" VARCHAR(300) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 10000,
    "depth" INTEGER NOT NULL DEFAULT 5,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "job_id" VARCHAR(100),
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requested_by" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "place_searches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "place_searches_query_key_key" ON "place_searches"("query_key");
CREATE INDEX "place_searches_status_created_at_idx" ON "place_searches"("status", "created_at");
CREATE INDEX "place_searches_requested_by_created_at_idx" ON "place_searches"("requested_by", "created_at");

CREATE TABLE "place_search_hits" (
    "id" TEXT NOT NULL,
    "search_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "place_search_hits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "place_search_hits_search_id_place_id_key" ON "place_search_hits"("search_id", "place_id");
CREATE INDEX "place_search_hits_search_id_rank_idx" ON "place_search_hits"("search_id", "rank");

ALTER TABLE "place_search_hits" ADD CONSTRAINT "place_search_hits_search_id_fkey"
    FOREIGN KEY ("search_id") REFERENCES "place_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_search_hits" ADD CONSTRAINT "place_search_hits_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
