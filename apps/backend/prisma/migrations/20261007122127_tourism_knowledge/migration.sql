-- CreateTable
CREATE TABLE "tourism_passages" (
    "id" TEXT NOT NULL,
    "site" VARCHAR(40) NOT NULL,
    "emirate" VARCHAR(40) NOT NULL,
    "region" VARCHAR(40),
    "language" VARCHAR(5) NOT NULL,
    "url" TEXT NOT NULL,
    "page_title" TEXT NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "search" tsvector,

    CONSTRAINT "tourism_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tourism_crawl_runs" (
    "id" TEXT NOT NULL,
    "site" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "pages_failed" INTEGER NOT NULL DEFAULT 0,
    "passages" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "tourism_crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tourism_passages_site_idx" ON "tourism_passages"("site");

-- CreateIndex
CREATE INDEX "tourism_passages_emirate_language_idx" ON "tourism_passages"("emirate", "language");

-- CreateIndex
CREATE UNIQUE INDEX "tourism_passages_site_content_hash_key" ON "tourism_passages"("site", "content_hash");

-- CreateIndex
CREATE INDEX "tourism_crawl_runs_site_started_at_idx" ON "tourism_crawl_runs"("site", "started_at");

CREATE OR REPLACE FUNCTION tourism_ar_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
    translate(
      regexp_replace(input, U&'[\064B-\0652\0640]', '', 'g'),
      'أإآىة',
      'ااايه'
    ),
    E'\\m(وال|بال|كال|فال|لل|ال)([ء-ي]{3,})\\M',
    E'\\2',
    'g'
  );
$function$;

ALTER TABLE "tourism_passages" DROP COLUMN IF EXISTS "search";
ALTER TABLE "tourism_passages" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  CASE
    WHEN language = 'ar' THEN
      setweight(to_tsvector('simple'::regconfig, tourism_ar_normalize(coalesce(page_title, ''))), 'A')
      || setweight(to_tsvector('simple'::regconfig, tourism_ar_normalize(coalesce(heading, ''))), 'B')
      || setweight(to_tsvector('simple'::regconfig, tourism_ar_normalize(coalesce(text, ''))), 'D')
    ELSE
      setweight(to_tsvector('english'::regconfig, coalesce(page_title, '')), 'A')
      || setweight(to_tsvector('english'::regconfig, coalesce(heading, '')), 'B')
      || setweight(to_tsvector('english'::regconfig, coalesce(text, '')), 'D')
  END
) STORED;
CREATE INDEX "tourism_passages_search_idx" ON "tourism_passages" USING GIN ("search");
