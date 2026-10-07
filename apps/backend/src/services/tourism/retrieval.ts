import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { TourismSite, tourismSites } from './sources';

const emirateDefinitions = [
  { name: 'Dubai', english: /\bdubai\b/i, arabic: ['دبي'], aliases: 'Dubai دبي' },
  {
    name: 'Abu Dhabi',
    english: /\babu\s+dhabi\b/i,
    arabic: ['أبوظبي', 'ابوظبي', 'أبو ظبي'],
    aliases: 'Abu Dhabi أبوظبي ابوظبي أبو ظبي',
  },
  { name: 'Al Ain', english: /\bal\s+ain\b/i, arabic: ['العين'], aliases: 'Al Ain العين' },
  { name: 'Sharjah', english: /\bsharjah\b/i, arabic: ['الشارقة'], aliases: 'Sharjah الشارقة' },
  {
    name: 'Ras Al Khaimah',
    english: /\b(?:ras\s+al[-\s]+khaimah|rak)\b/i,
    arabic: ['رأس الخيمة'],
    aliases: 'Ras Al Khaimah Ras Al-Khaimah RAK رأس الخيمة',
  },
  { name: 'Fujairah', english: /\bfujairah\b/i, arabic: ['الفجيرة'], aliases: 'Fujairah الفجيرة' },
  { name: 'Ajman', english: /\bajman\b/i, arabic: ['عجمان'], aliases: 'Ajman عجمان' },
  {
    name: 'Umm Al Quwain',
    english: /\b(?:umm\s+al\s+quwain|umm\s+al\s+qaiwain|umm\s+el\s+quwain|uaq)\b/i,
    arabic: ['أم القيوين', 'ام القيوين'],
    aliases: 'Umm Al Quwain Umm Al Qaiwain Umm El Quwain UAQ أم القيوين ام القيوين',
  },
];

const genericWords =
  'uae emirate emirat visit tourism tourist place thing best top go see can also ما ماذا هي هو في من على إلى الى عن مع هل أين اين كيف متى لماذا التي الذي هذه هذا ذلك تلك أو او و ثم كل بعض أي اي يمكن يمكنني أفضل افضل لي';
const emirateOrder = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ras Al Khaimah',
  'Fujairah',
  'Ajman',
  'Umm Al Quwain',
];

export function detectEmirates(text: string): string[] {
  const detected = new Set<string>();
  for (const definition of emirateDefinitions) {
    if (definition.english.test(text) || definition.arabic.some(alias => text.includes(alias))) {
      detected.add(definition.name === 'Al Ain' ? 'Abu Dhabi' : definition.name);
    }
  }
  return emirateOrder.filter(emirate => detected.has(emirate));
}

function detectedEmirateAliases(text: string): string {
  return emirateDefinitions
    .filter(definition =>
      definition.english.test(text) || definition.arabic.some(alias => text.includes(alias)))
    .map(definition => definition.aliases)
    .join(' ');
}

function sitesForEmirates(emirates: string[]): TourismSite[] {
  return emirates.length
    ? tourismSites.filter(site => emirates.includes(site.emirate))
    : tourismSites;
}

interface LexemeRow {
  questionLexemes: string[];
  genericLexemes: string[];
  emirateLexemes: string[];
}

interface TourismSearchRow {
  site: string;
  emirate: string;
  url: string;
  pageTitle: string;
  heading: string | null;
  text: string;
  fetchedAt: Date;
  coverage: number;
  preferredSite: number;
  rank: number;
}

export async function searchTourism(
  question: string,
  options: { limit?: number } = {},
): Promise<{
  language: 'en' | 'ar';
  emirates: string[];
  passages: Array<{
    site: string;
    siteName: string;
    emirate: string;
    url: string;
    pageTitle: string;
    heading?: string;
    text: string;
    fetchedAt: Date;
  }>;
  missingSites: TourismSite[];
}> {
  const language = /[\u0600-\u06FF]/.test(question) ? 'ar' : 'en';
  const emirates = detectEmirates(question);
  const filteredSites = sitesForEmirates(emirates);
  const filteredSiteKeys = filteredSites.map(site => site.key);
  const configName = language === 'ar' ? 'simple' : 'english';
  const aliasText = detectedEmirateAliases(question);
  const normalizedQuestion = language === 'ar'
    ? Prisma.sql`tourism_ar_normalize(${question})`
    : Prisma.sql`${question}`;
  const normalizedGenericWords = language === 'ar'
    ? Prisma.sql`tourism_ar_normalize(${genericWords})`
    : Prisma.sql`${genericWords}`;
  const normalizedAliasText = language === 'ar'
    ? Prisma.sql`tourism_ar_normalize(${aliasText})`
    : Prisma.sql`${aliasText}`;
  const [lexemes] = await prisma.$queryRaw<LexemeRow[]>(Prisma.sql`
    SELECT
      tsvector_to_array(to_tsvector(${configName}::regconfig, ${normalizedQuestion})) AS "questionLexemes",
      tsvector_to_array(to_tsvector(${configName}::regconfig, ${normalizedGenericWords})) AS "genericLexemes",
      tsvector_to_array(to_tsvector(${configName}::regconfig, ${normalizedAliasText})) AS "emirateLexemes"
  `);
  const genericSet = new Set(lexemes.genericLexemes);
  const emirateSet = new Set(lexemes.emirateLexemes);
  let contentLexemes = lexemes.questionLexemes
    .filter(token => !genericSet.has(token) && !emirateSet.has(token));
  if (!contentLexemes.length) contentLexemes = lexemes.emirateLexemes;

  let rows: TourismSearchRow[] = [];
  if (contentLexemes.length) {
    const queryTerms = contentLexemes.map(term =>
      language === 'ar' && /^[\u0621-\u064A]{3,}$/u.test(term) ? `${term}:*` : term,
    );
    const queryText = queryTerms.join(' | ');
    const minCoverage = contentLexemes.length <= 2
      ? contentLexemes.length
      : Math.ceil(contentLexemes.length / 2);
    const terms = Prisma.join(queryTerms.map(term => Prisma.sql`${term}`));
    const siteFilter = emirates.length
      ? Prisma.sql`AND passage.site IN (${Prisma.join(filteredSiteKeys.map(site => Prisma.sql`${site}`))})`
      : Prisma.empty;
    const emirateFilter = emirates.length
      ? Prisma.sql`AND passage.emirate IN (${Prisma.join(emirates.map(emirate => Prisma.sql`${emirate}`))})`
      : Prisma.empty;
    const mentionsAlAin =
      /\bal\s+ain\b/i.test(question) || question.includes('العين');
    const preferVisitAbuDhabi =
      emirates.includes('Abu Dhabi') && !mentionsAlAin;

    rows = await prisma.$queryRaw<TourismSearchRow[]>(Prisma.sql`
      WITH query_input AS (
        SELECT
          to_tsquery(${configName}::regconfig, ${queryText}) AS query,
          ARRAY[${terms}]::text[] AS terms
      ),
      matched AS (
        SELECT
          passage.site,
          passage.emirate,
          passage.url,
          passage.page_title AS "pageTitle",
          passage.heading,
          passage.text,
          passage.fetched_at AS "fetchedAt",
          CASE
            WHEN ${preferVisitAbuDhabi} AND passage.site = 'visit-abu-dhabi' THEN 1
            WHEN ${mentionsAlAin} AND passage.site = 'visit-al-ain' THEN 1
            ELSE 0
          END AS "preferredSite",
          (
            SELECT count(*)::int
            FROM unnest(query_input.terms) AS term
            WHERE passage.search @@ to_tsquery(${configName}::regconfig, term)
          ) AS coverage,
          ts_rank_cd(passage.search, query_input.query, 32) AS rank
        FROM tourism_passages AS passage
        CROSS JOIN query_input
        WHERE passage.language = ${language}
          ${emirateFilter}
          ${siteFilter}
          AND passage.search @@ query_input.query
      ),
      ranked AS (
        SELECT
          matched.*,
          row_number() OVER (
            PARTITION BY matched.url
            ORDER BY matched.coverage DESC, matched."preferredSite" DESC, matched.rank DESC
          ) AS url_rank
        FROM matched
        WHERE matched.coverage >= ${minCoverage}
      )
      SELECT site, emirate, url, "pageTitle", heading, text, "fetchedAt", coverage, "preferredSite", rank
      FROM ranked
      WHERE url_rank <= 2
      ORDER BY coverage DESC, "preferredSite" DESC, rank DESC
      LIMIT ${options.limit ?? 5}
    `);
  }

  const grouped = filteredSiteKeys.length
    ? await prisma.tourismPassage.groupBy({
      by: ['site'],
      where: { language, site: { in: filteredSiteKeys } },
      _count: { _all: true },
    })
    : [];
  const sitesWithPassages = new Set(grouped.filter(row => row._count._all > 0).map(row => row.site));

  return {
    language,
    emirates,
    passages: rows.map(row => ({
      site: row.site,
      siteName: tourismSites.find(site => site.key === row.site)?.name || row.site,
      emirate: row.emirate,
      url: row.url,
      pageTitle: row.pageTitle,
      ...(row.heading ? { heading: row.heading } : {}),
      text: row.text,
      fetchedAt: row.fetchedAt,
    })),
    missingSites: filteredSites.filter(site => !sitesWithPassages.has(site.key)),
  };
}
