#!/usr/bin/env node
/**
 * One-off backfill: unwrap affiliate URLs already stored in Event.externalUrl.
 *
 * Previous import runs stored `https://platinumlist.net/aff/?ref=…&link=<real>`
 * in externalUrl, and the mobile client then wrapped that a second time. From
 * now on externalUrl holds the raw event URL and wrapping happens once, in
 * GET /go/:eventId.
 *
 *   node scripts/unwrap-affiliate-urls.js --dry-run
 *   node scripts/unwrap-affiliate-urls.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function unwrap(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.pathname.startsWith('/aff') && url.searchParams.has('link')) {
      const inner = url.searchParams.get('link');
      return inner ? unwrap(inner) || inner : rawUrl;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

async function main() {
  const events = await prisma.event.findMany({
    where: { externalUrl: { contains: '/aff' } },
    select: { id: true, title: true, externalUrl: true },
  });

  console.log(`Found ${events.length} event(s) with a wrapped externalUrl.\n`);

  let changed = 0;
  for (const event of events) {
    const raw = unwrap(event.externalUrl);
    if (!raw || raw === event.externalUrl) continue;

    changed++;
    console.log(`  ${event.title}`);
    console.log(`    before: ${event.externalUrl}`);
    console.log(`    after : ${raw}\n`);

    if (!DRY_RUN) {
      await prisma.event.update({ where: { id: event.id }, data: { externalUrl: raw } });
    }
  }

  console.log('─────────────────────────────────────');
  console.log(DRY_RUN ? `Would update ${changed} event(s).` : `Updated ${changed} event(s).`);
  console.log('─────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
