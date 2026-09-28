#!/usr/bin/env node
/**
 * End-to-end smoke test for the Google Maps scraper.
 *
 * Talks to the scraper container DIRECTLY — no database, no auth, no Express.
 * That isolation is the point: if this passes, the scraper works and any
 * remaining problem is in the API, the worker or the app. If it fails, you
 * know to stop looking at the rest of the stack.
 *
 *   node scripts/test-scraper.js
 *   node scripts/test-scraper.js "padel court" 25.0805 55.1403
 *   node scripts/test-scraper.js "art gallery in Alserkal" 25.1417 55.2278 --depth 3
 */

const BASE = (process.env.SCRAPER_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const KEY = process.env.SCRAPER_API_KEY || '';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const depthFlag = process.argv.indexOf('--depth');
const DEPTH = depthFlag > -1 ? Number(process.argv[depthFlag + 1]) : 3;

const KEYWORD = args[0] || 'specialty coffee shop';
const LAT = Number(args[1] ?? 25.0805); // Dubai Marina
const LON = Number(args[2] ?? 55.1403);

const headers = { 'Content-Type': 'application/json', ...(KEY ? { 'X-API-Key': KEY } : {}) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function line() {
  console.log('─'.repeat(64));
}

async function main() {
  line();
  console.log('  Google Maps scraper smoke test');
  line();
  console.log(`  scraper : ${BASE}`);
  console.log(`  keyword : "${KEYWORD}"`);
  console.log(`  centre  : ${LAT}, ${LON}`);
  console.log(`  depth   : ${DEPTH}`);
  line();

  // ── 1. Is the container reachable? ────────────────────────────────────────
  process.stdout.write('1. Container reachable... ');
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/jobs`, { headers });
  } catch (err) {
    console.log('NO\n');
    console.error(`   Could not reach ${BASE}`);
    console.error(`   ${err.message}\n`);
    console.error('   Start it with:');
    console.error('     docker compose -f docker-compose.scraper.yml up -d\n');
    console.error('   Then check it is running:');
    console.error('     docker ps | grep migo-gmaps-scraper');
    console.error('     docker logs migo-gmaps-scraper\n');
    process.exit(1);
  }

  if (!res.ok) {
    console.log(`NO (HTTP ${res.status})\n`);
    process.exit(1);
  }
  const existing = await res.json();
  console.log(`yes (${Array.isArray(existing) ? existing.length : 0} job(s) on the queue)`);

  // ── 2. Create a job ───────────────────────────────────────────────────────
  process.stdout.write('2. Creating job... ');
  const body = {
    name: `smoke-test-${Date.now()}`,
    keywords: [KEYWORD],
    lang: 'en',
    zoom: 15,
    lat: String(LAT),
    lon: String(LON),
    fast_mode: false,
    radius: 10000,
    depth: DEPTH,
    // Off deliberately: scraped emails are personal data under PDPL/GDPR and
    // Migo has no lawful basis to collect them. Also much slower.
    email: false,
    max_time: 600,
  };

  res = await fetch(`${BASE}/api/v1/jobs`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    console.log(`FAILED (HTTP ${res.status})`);
    console.error(`   ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const { id: jobId } = await res.json();
  if (!jobId) {
    console.log('FAILED (no job id returned)');
    process.exit(1);
  }
  console.log(`ok  (id ${jobId.slice(0, 8)}…)`);

  // ── 3. Poll ───────────────────────────────────────────────────────────────
  console.log('3. Working — first runs take longer (Chromium cold start):');
  const started = Date.now();
  let status = 'pending';

  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    res = await fetch(`${BASE}/api/v1/jobs/${jobId}`, { headers });
    const json = await res.json();
    status = (json.Status ?? json.status ?? 'pending').toLowerCase();
    const secs = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`\r   status: ${status.padEnd(10)} ${secs}s elapsed   `);
    if (status === 'ok' || status === 'failed') break;
  }
  console.log();

  if (status === 'failed') {
    console.log('\n   JOB FAILED.\n');
    console.log('   Almost always means Google is rate-limiting this IP.');
    console.log('   It clears on its own in minutes to hours, and never affects');
    console.log('   your Google account. Wait, lower --depth, or add proxies via');
    console.log('   SCRAPER_PROXIES.\n');
    process.exit(1);
  }

  if (status !== 'ok') {
    console.log('\n   TIMED OUT after 7.5 minutes. Check: docker logs migo-gmaps-scraper\n');
    process.exit(1);
  }

  // ── 4. Download and show results ──────────────────────────────────────────
  process.stdout.write('4. Downloading results... ');
  res = await fetch(`${BASE}/api/v1/jobs/${jobId}/download`, { headers });
  if (!res.ok) {
    console.log(`FAILED (HTTP ${res.status})`);
    process.exit(1);
  }

  const csv = await res.text();
  const rows = csv.split('\n').filter((r) => r.trim());
  const count = Math.max(0, rows.length - 1);
  console.log(`ok  (${count} row(s))`);
  line();

  if (count === 0) {
    console.log('\n  ZERO RESULTS.\n');
    console.log('  On a plausible query this is itself a block signal — it is how');
    console.log('  soft rate-limiting usually shows up. Try again in a while, or');
    console.log('  test with a broad keyword like "restaurant" to rule out the');
    console.log('  query being genuinely empty.\n');
    process.exit(1);
  }

  // Show the first few, using the same columns the app stores.
  const header = rows[0].split(',').map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const cols = {
    title: idx('title'),
    category: idx('category'),
    rating: idx('review_rating'),
    reviews: idx('review_count'),
    lat: idx('latitude'),
    lon: idx('longitude'),
    website: idx('website'),
    phone: idx('phone'),
  };

  console.log(`\n  First ${Math.min(5, count)} of ${count}:\n`);
  for (const row of rows.slice(1, 6)) {
    // Crude split — fine for a preview; the real client parses CSV properly.
    const cells = row.split(',');
    const get = (i) => (i >= 0 ? (cells[i] || '').replace(/^"|"$/g, '').trim() : '');
    const rating = get(cols.rating);
    const reviews = get(cols.reviews);
    console.log(`  • ${get(cols.title) || '(no title)'}`);
    const meta = [
      get(cols.category),
      rating ? `${rating}★${reviews ? ` (${reviews})` : ''}` : null,
      get(cols.phone),
    ].filter(Boolean);
    if (meta.length) console.log(`    ${meta.join('  |  ')}`);
    if (get(cols.website)) console.log(`    ${get(cols.website)}`);
    console.log();
  }

  // Coordinate coverage matters: it is what makes "near me" and drive-time
  // ranking possible, and it is the gap in the events table today.
  let withCoords = 0;
  for (const row of rows.slice(1)) {
    const cells = row.split(',');
    const lat = cols.lat >= 0 ? cells[cols.lat] : '';
    if (lat && !Number.isNaN(Number(lat))) withCoords++;
  }

  line();
  console.log(`  ✅  Scraper works. ${count} places, ${withCoords} with coordinates.`);
  line();
  console.log('\n  Next: the same query through the app will now be served from');
  console.log('  the database cache rather than re-scraped.\n');

  // Tidy up so the container's job list does not grow forever.
  await fetch(`${BASE}/api/v1/jobs/${jobId}`, { method: 'DELETE', headers }).catch(() => {});
}

main().catch((err) => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
