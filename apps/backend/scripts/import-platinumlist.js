#!/usr/bin/env node
/**
 * Platinumlist CSV Import Script
 *
 * Usage:
 *   node scripts/import-platinumlist.js /path/to/platinumlist-export.csv
 *   node scripts/import-platinumlist.js /path/to/platinumlist-export.pdf
 *
 * CSV/TSV is the preferred input. A PDF (the Looker Studio "export to PDF" of
 * the same report) is accepted too, but it is a rendered table: long values are
 * visually ellipsised, so categories, venue and country import truncated. URLs
 * and images are recovered in full from the PDF's link annotations, and titles
 * from their event-URL slug. Use CSV when you have the choice.
 *
 * Expected columns (15 columns total, tab or comma separated):
 *   Column 0  → Event ID
 *   Column 1  → Event name
 *   Column 2  → URL
 *   Column 3  → All categories
 *   Column 4  → Venue
 *   Column 5  → City           (separate column)
 *   Column 6  → Country        (separate column)
 *   Column 7  → Img 1600x615
 *   Column 8  → Img 768x768
 *   Column 9  → Min price
 *   Column 10 → Currency
 *   Column 11 → Commission
 *   Column 12 → Start datetime (separate column)
 *   Column 13 → End datetime   (separate column)
 *   Column 14 → Description
 *
 * Affiliate ref: nmu2yjg
 * Events are upserted using externalId = "pl-{Event ID}" so re-running is safe.
 */

const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Event URLs ───────────────────────────────────────────────────────────────
// We store the RAW event URL. Affiliate wrapping happens once, server-side, in
// GET /go/:eventId. Storing a pre-wrapped URL here is what produced nested
// tracking URLs (the client then wrapped it a second time) — the classic way
// to silently lose commission.
const PLATINUMLIST_BASE = 'https://platinumlist.net';

/** Unwraps a URL that a previous import run already wrapped. */
function rawEventUrl(eventUrl) {
  const dest = (eventUrl || '').trim();
  if (!dest) return PLATINUMLIST_BASE;
  try {
    const url = new URL(dest);
    if (url.pathname.startsWith('/aff') && url.searchParams.has('link')) {
      return rawEventUrl(url.searchParams.get('link'));
    }
    return dest;
  } catch {
    return dest;
  }
}

// ─── Category mapper ──────────────────────────────────────────────────────────
function mapCategory(rawCategories) {
  const raw = (rawCategories || '').toLowerCase();
  if (raw.includes('music') || raw.includes('concert') || raw.includes('dj'))         return 'Music';
  if (raw.includes('sport') || raw.includes('fitness') || raw.includes('marathon'))   return 'Sports';
  if (raw.includes('art') || raw.includes('exhibition') || raw.includes('gallery'))   return 'Art';
  if (raw.includes('food') || raw.includes('iftar') || raw.includes('suhoor') ||
      raw.includes('dining') || raw.includes('brunch') || raw.includes('restaurant')) return 'Food';
  if (raw.includes('tech') || raw.includes('digital') || raw.includes('startup'))     return 'Tech';
  if (raw.includes('business') || raw.includes('conference') || raw.includes('seminar')) return 'Business';
  if (raw.includes('kids') || raw.includes('family') || raw.includes('children'))     return 'Family';
  if (raw.includes('theater') || raw.includes('theatrical') || raw.includes('comedy') ||
      raw.includes('play') || raw.includes('show') || raw.includes('stand-up'))       return 'Theater';
  if (raw.includes('ramadan'))  return 'Food';
  if (raw.includes('wellness') || raw.includes('yoga') || raw.includes('spa'))        return 'Wellness';
  // Extract first readable subcategory as fallback
  const firstGroup = (rawCategories || '').split(';')[0] || '';
  const parts      = firstGroup.split(',');
  const sub        = (parts[parts.length - 1] || parts[0] || 'Other').trim();
  return sub || 'Other';
}

// ─── Date parser ──────────────────────────────────────────────────────────────
// Handles Platinumlist format: "Feb 21, 2026, 2:15:00 PM"
// Also handles truncated formats from Looker Studio: "Feb 21 2026 2:15:…"
function parseDate(raw) {
  if (!raw || raw.trim() === '') return null;

  let cleaned = raw.trim();

  // Remove the extra comma: "Feb 21, 2026, 2:15:00 PM" → "Feb 21, 2026 2:15:00 PM"
  cleaned = cleaned.replace(/(\d{4}),\s*/, '$1 ');

  // Remove ellipsis character (Looker Studio truncation): "Feb 21 2026 2:15:…" → "Feb 21 2026 2:15:"
  cleaned = cleaned.replace(/…/g, '');

  // If the time is incomplete (ends with : or no AM/PM), try to fix it
  if (cleaned.match(/\d{1,2}:\d{0,2}:?\s*$/)) {
    // Has time but no AM/PM, likely truncated - add default time completion
    cleaned = cleaned.replace(/:$/, ':00'); // Remove trailing colon
    if (!cleaned.match(/[AP]M/i)) {
      cleaned += ' PM'; // Most events are PM
    }
  }

  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// ─── CSV/TSV parser ───────────────────────────────────────────────────────────
// Handles tab-separated (TSV) as primary; falls back to comma-separated with
// proper quote handling for CSV files.
function parseRows(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];

  // Detect separator: if the header line has more tabs than commas, use TSV
  const headerLine = lines[0];
  const tabCount   = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const sep        = tabCount >= commaCount ? '\t' : null; // null = use CSV parser

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let cols;
    if (sep === '\t') {
      cols = line.split('\t');
    } else {
      // Minimal RFC 4180 CSV parser
      cols = [];
      let cur = '';
      let inQ = false;
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (inQ) {
          if (ch === '"') {
            if (line[c + 1] === '"') { cur += '"'; c++; } // escaped quote
            else inQ = false;
          } else {
            cur += ch;
          }
        } else {
          if (ch === '"') { inQ = true; }
          else if (ch === ',') { cols.push(cur); cur = ''; }
          else { cur += ch; }
        }
      }
      cols.push(cur);
    }

    rows.push(cols.map(c => c.trim()));
  }

  return rows;
}

// ─── PDF parser ───────────────────────────────────────────────────────────────
// Looker Studio exports the Platinumlist report as a rendered table, so there is
// no delimiter to split on: cells are positioned glyph runs. We rebuild the grid
// from coordinates — cluster text items into rows by y, then assign each item to
// a column by comparing its x against the header cells' x positions.
//
// The render also ellipsises anything too wide for its column ("https://dubai.…"),
// so the visible text of long fields is lossy. Two things make it recoverable:
//   • Every URL cell carries a PDF link annotation holding the FULL url (wrapped
//     in a Google redirect), matched back to its cell by rectangle position.
//   • A truncated title can be completed from the slug in its event URL.
// Fields with no such backup (categories, venue, country) stay truncated, and the
// trailing "…" is stripped rather than stored.

// Header labels in export order, lowercased. Matched by prefix because the header
// row is ellipsised too ("Img 1600x615" renders as "Img 160…").
const PDF_HEADERS = [
  'event id', 'event name', 'url', 'all categories', 'venue', 'city', 'country',
  'img 1600x615', 'img 768x768', 'min price', 'currency', 'comission',
  'start datetime', 'end datetime', 'description',
];

const ROW_TOLERANCE = 3;   // pt; two items within this y are the same table row
const LINK_TOLERANCE = 6;  // pt; how far a link annotation may sit from its row

/** Strips the Google redirect that Looker Studio wraps exported links in. */
function unwrapRedirect(href) {
  try {
    const url = new URL(href);
    if (url.hostname.endsWith('google.com') && url.searchParams.has('q')) {
      return url.searchParams.get('q');
    }
    return href;
  } catch {
    return href;
  }
}

const stripEllipsis = s => (s || '').replace(/…/g, '').trim();

/**
 * Completes a title the PDF truncated, using the slug of its event URL.
 * "The Laughter Lounge …" + ".../the-laughter-lounge-by-3albaraka"
 *   → "The Laughter Lounge By 3albaraka"
 * The kept prefix preserves the original casing and punctuation; only the tail
 * the render dropped is rebuilt from the slug. Returns the prefix unchanged if
 * the slug does not line up with it.
 */
function recoverTitle(visible, eventUrl) {
  let prefix = stripEllipsis(visible);
  if (!visible.includes('…') || !eventUrl) return prefix;

  let slug;
  try {
    slug = decodeURIComponent(new URL(eventUrl).pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    return prefix;
  }
  if (!slug) return prefix;

  const slugWords = slug.split('-').filter(Boolean);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const prefixWords = prefix.split(/\s+/).map(norm).filter(Boolean);

  // Find how much of the slug the visible prefix already covers.
  let consumed = 0;
  for (let w = 0; w < prefixWords.length; w++) {
    const word = prefixWords[w];
    const isLast = w === prefixWords.length - 1;
    let matched = '';
    while (consumed < slugWords.length && matched.length < word.length) {
      matched += norm(slugWords[consumed]);
      consumed++;
    }
    // The render can cut mid-word ("…Mohamme" for "mohammed"), so the final
    // visible word only has to be a prefix of the slug word it lands in.
    if (matched === word) continue;
    if (isLast && matched.startsWith(word)) {
      // Drop the half-word from the prefix; the slug supplies it whole.
      prefix = prefix.replace(/\s*\S+$/, '').trim();
      consumed--;
      continue;
    }
    return prefix; // slug diverges — don't guess
  }

  const tail = slugWords.slice(consumed)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return tail ? `${prefix} ${tail}`.replace(/\s+/g, ' ').trim() : prefix;
}

/**
 * Expands a value the render cut short ("Abu D…") back to a full name, but only
 * when exactly one known name starts with it. An ambiguous or unknown prefix is
 * left as-is rather than guessed at.
 */
const UAE_CITIES = [
  'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah',
  'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain',
];
const COUNTRIES = ['United Arab Emirates'];

function expandTruncated(raw, candidates) {
  const text = stripEllipsis(raw);
  if (!raw.includes('\u2026') || !text) return text;
  const matches = candidates.filter(c => c.toLowerCase().startsWith(text.toLowerCase()));
  return matches.length === 1 ? matches[0] : text;
}

/** Groups positioned text items into rows, then columns, for one page. */
function buildGrid(textItems, annotations) {
  const items = textItems
    .filter(i => i.str && i.str.trim())
    .map(i => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const item of items) {
    let line = lines.find(l => Math.abs(l.y - item.y) <= ROW_TOLERANCE);
    if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
    line.items.push(item);
  }

  // The topmost line is the report's filter bar, not the table header, so find
  // the header by content: the line matching the most expected column labels.
  let header = null;
  let bestScore = 0;
  for (const line of lines) {
    const score = line.items.filter(i => {
      const t = stripEllipsis(i.str).toLowerCase();
      return t.length > 2 && PDF_HEADERS.some(h => h.startsWith(t));
    }).length;
    if (score > bestScore) { bestScore = score; header = line; }
  }
  if (!header || bestScore < 5) return [];

  // Walk the header in x order against the expected label sequence. This drops
  // decorations (sort arrows) that share the header row and pins each column's
  // left edge to a known field.
  const bounds = [];
  const sorted = [...header.items].sort((a, b) => a.x - b.x);
  let expected = 0;
  for (const item of sorted) {
    const text = stripEllipsis(item.str).toLowerCase();
    if (!text) continue;
    for (let h = expected; h < PDF_HEADERS.length; h++) {
      if (PDF_HEADERS[h].startsWith(text)) {
        bounds[h] = item.x;
        expected = h + 1;
        break;
      }
    }
  }
  if (bounds.filter(b => b !== undefined).length < 5) return [];

  // Fill any column the header failed to yield so indices stay aligned.
  for (let i = 0; i < PDF_HEADERS.length; i++) {
    if (bounds[i] === undefined) bounds[i] = i === 0 ? -Infinity : bounds[i - 1];
  }

  const columnOf = x => {
    let col = 0;
    for (let i = 0; i < bounds.length; i++) if (x >= bounds[i] - 2) col = i;
    return col;
  };

  const links = (annotations || [])
    .filter(a => a.subtype === 'Link' && a.url)
    .map(a => ({ url: unwrapRedirect(a.url), x: a.rect[0], cy: (a.rect[1] + a.rect[3]) / 2 }));

  const rows = [];
  for (const line of lines) {
    if (line.y >= header.y - ROW_TOLERANCE) continue; // header and everything above it

    const cells = Array(PDF_HEADERS.length).fill('');
    for (const item of line.items) cells[columnOf(item.x)] += item.str;

    // Overwrite link columns with the full URL from the annotation layer. The
    // annotation's baseline sits slightly above the text item's, hence the +4.
    for (const link of links) {
      if (Math.abs(link.cy - (line.y + 4)) <= LINK_TOLERANCE) {
        cells[columnOf(link.x + 1)] = link.url;
      }
    }

    // Looker prints missing values as the literal string "null".
    const clean = cells.map(c => {
      const t = stripEllipsis(c);
      return t === 'null' ? '' : t;
    });

    if (!clean[0] || !/^\d+$/.test(clean[0])) continue; // not an event row

    clean[1] = recoverTitle(cells[1], clean[2]);
    clean[5] = expandTruncated(cells[5], UAE_CITIES);
    clean[6] = expandTruncated(cells[6], COUNTRIES);
    rows.push(clean);
  }

  return rows;
}

/** Reads a Looker Studio PDF export into the same row shape as the CSV parser. */
async function parsePdfRows(absPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(absPath)),
    useSystemFonts: true,
  }).promise;

  const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const [text, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    rows.push(...buildGrid(text.items, annotations));
  }
  await doc.destroy();
  return rows;
}

// ─── Column indices (0-based) — matching the order in the user's export ───────
const COL = {
  EVENT_ID:    0,
  NAME:        1,
  URL:         2,
  CATEGORIES:  3,
  VENUE:       4,
  CITY:        5,
  COUNTRY:     6,
  IMG_WIDE:    7,
  IMG_SQUARE:  8,
  MIN_PRICE:   9,
  CURRENCY:    10,
  COMMISSION:  11,
  START_DATE:  12,
  END_DATE:    13,
  DESCRIPTION: 14,
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args     = process.argv.slice(2);
  const dryRun   = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));
  if (!filePath) {
    console.error('❌  Usage: node scripts/import-platinumlist.js <path-to-csv|tsv|pdf>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`❌  File not found: ${absPath}`);
    process.exit(1);
  }

  // Get the system user that owns all external events. --dry-run parses the
  // file and prints what would be imported without opening a DB connection.
  const systemUser = dryRun
    ? { id: '(dry-run)' }
    : await prisma.user.findUnique({ where: { email: 'system@migo.events' } });

  if (!systemUser) {
    console.error('❌  System user (system@migo.events) not found.');
    console.error('    Run: npm run prisma:seed');
    process.exit(1);
  }

  const isPdf = path.extname(absPath).toLowerCase() === '.pdf';
  const rows  = isPdf
    ? await parsePdfRows(absPath)
    : parseRows(fs.readFileSync(absPath, 'utf-8'));

  if (rows.length === 0) {
    console.error(`❌  No event rows found in ${absPath}`);
    process.exit(1);
  }

  console.log(`\n📂  File : ${absPath} (${isPdf ? 'PDF' : 'CSV/TSV'})`);
  console.log(`📊  Rows : ${rows.length} events to import\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const rawId       = (row[COL.EVENT_ID]    || '').trim();
    const rawName     = (row[COL.NAME]         || '').trim();
    const rawUrl      = (row[COL.URL]          || '').trim();
    const rawCats     = (row[COL.CATEGORIES]   || '').trim();
    const rawVenue    = (row[COL.VENUE]        || '').trim();
    const rawCity     = (row[COL.CITY]         || '').trim();
    const rawCountry  = (row[COL.COUNTRY]      || '').trim();
    const rawImgWide  = (row[COL.IMG_WIDE]     || '').trim();
    const rawImgSq    = (row[COL.IMG_SQUARE]   || '').trim();
    const rawPrice    = (row[COL.MIN_PRICE]    || '0').trim();
    const rawCurrency = (row[COL.CURRENCY]     || 'AED').trim();
    const rawStart    = (row[COL.START_DATE]   || '').trim();
    const rawEnd      = (row[COL.END_DATE]     || '').trim();
    const rawDesc     = (row[COL.DESCRIPTION]  || '').trim();

    if (!rawId || !rawName) { skipped++; continue; }

    // A row sitting on the page boundary of a PDF export is clipped: only some
    // of its glyphs reach the text layer, leaving shrapnel like "Di l FdLit".
    // Nothing can rebuild it, so say why rather than blaming the date.
    const fragments = rawName.split(/\s+/);
    const isClipped = fragments.length >= 4 &&
      fragments.filter(f => f.length <= 2).length > fragments.length / 2;
    if (isClipped) {
      console.warn(`  ⚠️  Row ${i + 2}: skipping event ${rawId} — clipped at the page edge of the PDF, text unrecoverable. Re-export as CSV to include it.`);
      skipped++;
      continue;
    }

    const startDate = parseDate(rawStart);
    if (!startDate) {
      console.warn(`  ⚠️  Row ${i + 2}: skipping "${rawName}" — invalid date: "${rawStart}"`);
      skipped++;
      continue;
    }

    const minPrice  = parseFloat(rawPrice) || 0;
    const isFree    = minPrice === 0;
    const externalId = `pl-${rawId}`;

    // Description: if empty or just punctuation, use a fallback
    const description = rawDesc && rawDesc.replace(/[.]/g, '').trim()
      ? rawDesc
      : `${rawName} at ${rawVenue || rawCity || 'the venue'}.`;

    const eventData = {
      title:          rawName,
      description,
      category:       mapCategory(rawCats),
      venueName:      rawVenue   || null,
      city:           rawCity    || null,
      country:        rawCountry || null,
      coverImage:     rawImgWide  || null,
      thumbnailImage: rawImgSq    || null,
      priceFrom:      isFree ? null : minPrice,
      currency:       rawCurrency || 'AED',
      isFree,
      startDate,
      endDate:        parseDate(rawEnd) || null,
      externalId,
      externalSource: 'platinumlist',
      externalUrl:    rawEventUrl(rawUrl),
      source:         'platinumlist',
      status:         'ACTIVE',
      visibility:     'PUBLIC',
      isVerified:     true,
      organizerId:    systemUser.id,
      bookingType:    isFree ? 'FREE' : 'PAID',
    };

    if (dryRun) {
      created++;
      process.stdout.write(`  🔎  ${externalId} | ${eventData.title} | ${eventData.category} | ${eventData.city} | ${startDate.toISOString()} | ${eventData.currency} ${minPrice}\n       url: ${eventData.externalUrl}\n       img: ${eventData.coverImage || '(none)'}\n`);
      continue;
    }

    try {
      const existing = await prisma.event.findUnique({ where: { externalId } });

      if (existing) {
        await prisma.event.update({ where: { externalId }, data: eventData });
        updated++;
        process.stdout.write(`  ✏️  Updated : ${rawName}\n`);
      } else {
        await prisma.event.create({ data: eventData });
        created++;
        process.stdout.write(`  ✅  Created : ${rawName}\n`);
      }
    } catch (err) {
      console.error(`  ❌  Failed  : ${rawName} — ${err.message}`);
      skipped++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅  Created : ${created}`);
  console.log(`✏️   Updated : ${updated}`);
  console.log(`⚠️   Skipped : ${skipped}`);
  console.log(`📦  Total   : ${rows.length}`);
  console.log('─────────────────────────────────────\n');
}

main()
  .catch(err => {
    console.error('❌  Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
