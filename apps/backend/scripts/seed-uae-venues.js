#!/usr/bin/env node
/**
 * Queues place searches for the UAE venues named in the upgrade plan.
 *
 * This does NOT scrape directly — it writes rows into `place_searches`, and the
 * worker drains them one at a time with cooldowns. That is deliberate: firing
 * 30 scrape jobs at once is exactly what gets your IP rate-limited by Google.
 *
 * Expect this to take a while. With the default 20s cooldown and ~1 minute per
 * job, a full seed is roughly 45–60 minutes. Leave it running.
 *
 *   node scripts/seed-uae-venues.js --dry-run
 *   node scripts/seed-uae-venues.js
 *   node scripts/seed-uae-venues.js --only dubai
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex > -1 ? (process.argv[onlyIndex + 1] || '').toLowerCase() : null;

const AREAS = {
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  'dubai marina': { latitude: 25.0805, longitude: 55.1403 },
  downtown: { latitude: 25.1972, longitude: 55.2744 },
  'al quoz': { latitude: 25.142, longitude: 55.2311 },
  jumeirah: { latitude: 25.2048, longitude: 55.2409 },
  'abu dhabi': { latitude: 24.4539, longitude: 54.3773 },
  'yas island': { latitude: 24.4992, longitude: 54.6072 },
  'saadiyat island': { latitude: 24.5395, longitude: 54.437 },
  sharjah: { latitude: 25.3463, longitude: 55.4209 },
  'ras al khaimah': { latitude: 25.7895, longitude: 55.9432 },
};

/** Venue categories worth having in the directory before launch. */
const KEYWORDS = [
  'event venue',
  'concert hall',
  'theatre',
  'art gallery',
  'museum',
  'live music venue',
  'comedy club',
  'rooftop lounge',
  'beach club',
  'brunch restaurant',
  'specialty coffee shop',
  'padel court',
  'bowling alley',
  'exhibition centre',
  'community centre',
];

/** Which keywords to run in which area. Keeps the job count sane. */
const PLAN = [
  ['dubai', KEYWORDS],
  ['dubai marina', ['rooftop lounge', 'beach club', 'brunch restaurant', 'padel court']],
  ['downtown', ['event venue', 'theatre', 'live music venue', 'rooftop lounge']],
  ['al quoz', ['art gallery', 'event venue', 'specialty coffee shop']],
  ['jumeirah', ['beach club', 'brunch restaurant', 'art gallery']],
  ['abu dhabi', KEYWORDS],
  ['yas island', ['event venue', 'concert hall', 'beach club']],
  ['saadiyat island', ['museum', 'art gallery', 'beach club']],
  ['sharjah', ['art gallery', 'museum', 'exhibition centre', 'event venue']],
  ['ras al khaimah', ['event venue', 'beach club', 'community centre']],
];

function queryKey(keyword, lat, lon, radius = 10000, depth = 5) {
  const k = keyword.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${k}|${lat.toFixed(2)},${lon.toFixed(2)}|r${radius}|d${depth}`.slice(0, 400);
}

async function main() {
  const jobs = [];

  for (const [area, keywords] of PLAN) {
    if (ONLY && area !== ONLY) continue;
    const coords = AREAS[area];
    if (!coords) continue;

    for (const keyword of keywords) {
      jobs.push({ area, keyword, ...coords });
    }
  }

  console.log(`\n${jobs.length} search(es) planned.\n`);

  if (DRY_RUN) {
    for (const job of jobs) console.log(`  • ${job.keyword}  @  ${job.area}`);
    console.log('\nDry run — nothing queued.\n');
    return;
  }

  let queued = 0;
  let skipped = 0;

  for (const job of jobs) {
    const key = queryKey(job.keyword, job.latitude, job.longitude);
    const existing = await prisma.placeSearch.findUnique({ where: { queryKey: key } });

    if (existing && existing.status === 'ok') {
      skipped++;
      continue;
    }

    if (existing) {
      await prisma.placeSearch.update({
        where: { id: existing.id },
        data: { status: 'pending', attempts: 0, error: null },
      });
    } else {
      await prisma.placeSearch.create({
        data: {
          queryKey: key,
          keyword: job.keyword,
          latitude: job.latitude,
          longitude: job.longitude,
          radiusMeters: 10000,
          depth: 5,
          status: 'pending',
        },
      });
    }

    queued++;
    console.log(`  queued: ${job.keyword} @ ${job.area}`);
  }

  console.log('\n─────────────────────────────────────');
  console.log(`  queued  : ${queued}`);
  console.log(`  skipped : ${skipped} (already cached)`);
  console.log('─────────────────────────────────────');
  console.log('\nThe worker drains these one at a time. Watch progress with:');
  console.log("  SELECT status, count(*) FROM place_searches GROUP BY status;\n");
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
