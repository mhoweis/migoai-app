import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import config from '../../config/env';
import logger from '../../utils/logger';
import { htmlHeaders, http } from '../providers/http';
import { visitDubaiProvider } from '../providers/visit-dubai.provider';
import { extractPage } from './extract';
import {
  getTourismSite,
  normalizeTourismUrl,
  TourismSite,
  tourismSites,
} from './sources';
import {
  TourismCrawlRunInput,
  TourismPassageInput,
  TourismStore,
  tourismStore,
} from './store';

const REQUEST_TIMEOUT_MS = 20_000;
const SITE_CONCURRENCY = 3;
const MAX_SITEMAPS = 100;

interface AlgoliaHit {
  url?: string;
  englishTitle?: string;
  arabicTitle?: string;
  title?: string;
  introText?: string;
}

interface CrawlPage {
  url: string;
  language: 'en' | 'ar';
  fallback?: AlgoliaHit;
}

export interface TourismCrawlDependencies {
  fetchText(url: string): Promise<string>;
  store: TourismStore;
  sleep?(milliseconds: number): Promise<void>;
}

export interface TourismCrawlResult {
  site: string;
  status: 'ok' | 'partial' | 'failed';
  pagesFetched: number;
  pagesFailed: number;
  passages: number;
  error?: string;
}

const defaultFetchText = async (url: string): Promise<string> => {
  if (new URL(url).hostname.endsWith('visitdubai.com')) {
    return visitDubaiProvider.fetchHtml(url);
  }
  const response = await http.get(url, { headers: htmlHeaders, timeout: REQUEST_TIMEOUT_MS });
  return typeof response.data === 'string' ? response.data : String(response.data ?? '');
};

const defaultDependencies: TourismCrawlDependencies = {
  fetchText: defaultFetchText,
  store: tourismStore,
};

async function mapLimit<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, url: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after 20000ms: ${url}`)), REQUEST_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function responseStatus(error: unknown): number | undefined {
  const response = (error as any)?.response;
  const status = response?.status ?? response?.statusCode;
  const numericStatus = Number(status);
  return Number.isFinite(numericStatus) ? numericStatus : undefined;
}

function retryAfterMilliseconds(error: unknown): number | undefined {
  if (responseStatus(error) !== 429) return undefined;
  const headers = (error as any)?.response?.headers;
  const value = typeof headers?.get === 'function'
    ? headers.get('retry-after')
    : headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (value === undefined || value === null || value === '') return undefined;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return Math.min(30_000, Math.max(0, numericValue * 1000));
  }

  const dateValue = Date.parse(String(value));
  if (!Number.isFinite(dateValue)) return undefined;
  return Math.min(30_000, Math.max(0, dateValue - Date.now()));
}

async function fetchTextWithRetry(
  fetchText: (url: string) => Promise<string>,
  url: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withTimeout(fetchText(url), url);
    } catch (error) {
      if (responseStatus(error) !== 429 || attempt >= 3) throw error;
      await sleep(retryAfterMilliseconds(error) ?? (2 ** attempt) * 2_000);
    }
  }
}

function isWafResponse(html: string): boolean {
  return /Request Rejected/i.test(html);
}

function isSitemapPath(url: string): boolean {
  return /sitemap(?:[_-]|xml)?/i.test(new URL(url).pathname);
}

function addPage(
  site: TourismSite,
  value: string,
  pages: CrawlPage[],
  seen: Set<string>,
  counts: Record<'en' | 'ar', number>,
  base = site.homepage,
  fallback?: AlgoliaHit,
): CrawlPage | null {
  const normalized = normalizeTourismUrl(site, value, base);
  if (!normalized || isSitemapPath(normalized.url) || seen.has(normalized.url)) return null;
  const maxPages = normalized.language === 'ar'
    ? config.TOURISM_MAX_AR_PAGES_PER_SITE
    : config.TOURISM_MAX_PAGES_PER_SITE;
  if (counts[normalized.language] >= maxPages) return null;
  seen.add(normalized.url);
  counts[normalized.language] += 1;
  const page = { ...normalized, ...(fallback ? { fallback } : {}) };
  pages.push(page);
  return page;
}

function urlDepth(value: string): number {
  return new URL(value).pathname.split('/').filter(Boolean).length;
}

async function getAlgoliaHits(index: string, credentials: { appId: string; apiKey: string }): Promise<AlgoliaHit[]> {
  const hits: AlgoliaHit[] = [];
  let page = 0;
  let pages = 1;
  while (page < pages) {
    const response = await withTimeout(http.post(
      `https://${credentials.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`,
      {
        query: '',
        hitsPerPage: 200,
        page,
        facetFilters: [['type:Article', 'type:POI', 'type:Venue']],
        filters: 'archived:false AND hideinsearchpage:false',
        attributesToRetrieve: ['url', 'englishTitle', 'arabicTitle', 'title', 'introText'],
        attributesToHighlight: [],
      },
      {
        headers: {
          'X-Algolia-Application-Id': credentials.appId,
          'X-Algolia-API-Key': credentials.apiKey,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    ), `Algolia ${index} page ${page}`) as any;
    hits.push(...(response.data?.hits || []));
    pages = Number(response.data?.nbPages || page + 1);
    page += 1;
  }
  return hits;
}

async function discoverAlgolia(site: TourismSite): Promise<{ en: AlgoliaHit[]; ar: AlgoliaHit[] }> {
  const credentials = await visitDubaiProvider.getCredentials();
  const englishIndex = config.VISIT_DUBAI_ALGOLIA_INDEX || 'prod104_vd_en';
  const englishHits = await getAlgoliaHits(englishIndex, credentials);
  let arabicHits: AlgoliaHit[] = [];
  try {
    arabicHits = await getAlgoliaHits('prod104_vd_ar', credentials);
  } catch (error) {
    logger.warn('[tourism] Visit Dubai Arabic Algolia index unavailable', { error: messageFor(error) });
  }
  return { en: englishHits, ar: arabicHits };
}

async function discoverSitemapUrls(
  site: TourismSite,
  getText: (url: string) => Promise<string>,
  recordError: (error: unknown, target?: string) => void,
  concurrency: number,
): Promise<string[]> {
  const queue = [...(site.sitemaps || [`${new URL(site.homepage).origin}/sitemap.xml`])];
  const seenSitemaps = new Set<string>();
  const pageUrls: string[] = [];

  while (queue.length && seenSitemaps.size < MAX_SITEMAPS) {
    const batch = queue.splice(0, concurrency).filter(url => !seenSitemaps.has(url));
    if (!batch.length) continue;
    batch.forEach(url => seenSitemaps.add(url));
    const results = await mapLimit(batch, concurrency, async sitemapUrl => {
      if (!normalizeTourismUrl(site, sitemapUrl)) return { childSitemaps: [], pages: [] };
      try {
        const xml = await getText(sitemapUrl);
        if (isWafResponse(xml)) throw new Error(`WAF response for ${sitemapUrl}`);
        const $ = cheerio.load(xml, { xmlMode: true });
        return {
          childSitemaps: $('sitemap > loc').map((_index, element) => $(element).text().trim()).get(),
          pages: $('url > loc').map((_index, element) => $(element).text().trim()).get(),
        };
      } catch (error) {
        recordError(error, sitemapUrl);
        return { childSitemaps: [], pages: [] };
      }
    });
    for (const result of results) {
      for (const child of result.childSitemaps) {
        const childUrl = normalizeTourismUrl(site, child);
        if (childUrl && !seenSitemaps.has(childUrl.url)) queue.push(childUrl.url);
      }
      pageUrls.push(...result.pages);
    }
  }
  return pageUrls;
}

function linksFromHtml(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  return $('a[href]').map((_index, element) => $(element).attr('href') || '').get()
    .filter(Boolean)
    .map(href => {
      try {
        return new URL(href, pageUrl).toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

async function discoverPages(
  site: TourismSite,
  getText: (url: string) => Promise<string>,
  recordError: (error: unknown, target?: string) => void,
  concurrency: number,
): Promise<{ pages: CrawlPage[]; fallbackByUrl: Map<string, AlgoliaHit> }> {
  const pages: CrawlPage[] = [];
  const seen = new Set<string>();
  const counts: Record<'en' | 'ar', number> = { en: 0, ar: 0 };
  const fallbackByUrl = new Map<string, AlgoliaHit>();
  const add = (value: string, base = site.homepage, fallback?: AlgoliaHit): CrawlPage | null =>
    addPage(site, value, pages, seen, counts, base, fallback);

  site.seeds.forEach(seed => add(seed));

  if (site.discovery === 'sitemap') {
    const sitemapUrls = await discoverSitemapUrls(site, getText, recordError, concurrency);
    const additional = sitemapUrls
      .map(url => {
        const normalized = normalizeTourismUrl(site, url);
        return normalized ? normalized.url : null;
      })
      .filter((url): url is string => url !== null)
      .filter(url => !seen.has(url))
      .sort((a, b) => urlDepth(a) - urlDepth(b) || a.localeCompare(b));
    additional.forEach(url => add(url));
  } else if (site.discovery === 'links') {
    let frontier = pages.slice();
    for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
      const next: CrawlPage[] = [];
      const pageLinks = await mapLimit(frontier, concurrency, async page => {
        try {
          const html = await getText(page.url);
          if (isWafResponse(html)) throw new Error(`WAF response for ${page.url}`);
          return linksFromHtml(html, page.url);
        } catch (error) {
          recordError(error, page.url);
          return [];
        }
      });
      for (let i = 0; i < pageLinks.length; i += 1) {
        for (const link of pageLinks[i]) {
          const page = add(link, frontier[i].url);
          if (page) next.push(page);
        }
      }
      frontier = next;
    }
  } else {
    const discovered = await discoverAlgolia(site);
    const algoliaPages: CrawlPage[] = [];
    for (const [language, hits] of [['en', discovered.en], ['ar', discovered.ar]] as const) {
      for (const hit of hits) {
        if (!hit.url) continue;
        const normalized = normalizeTourismUrl(site, hit.url);
        if (!normalized || normalized.language !== language) continue;
        const page = add(normalized.url, site.homepage, hit);
        if (page) {
          algoliaPages.push(page);
          fallbackByUrl.set(page.url, hit);
        }
      }
    }
    const seedPages = pages.slice(0, site.seeds.length);
    const sorted = algoliaPages.sort((a, b) => urlDepth(a.url) - urlDepth(b.url) || a.url.localeCompare(b.url));
    pages.splice(0, pages.length, ...seedPages, ...sorted);
  }

  if (site.discovery === 'sitemap') {
    const seeds = pages.filter(page => site.seeds.some(seed => normalizeTourismUrl(site, seed)?.url === page.url));
    const rest = pages.filter(page => !seeds.includes(page))
      .sort((a, b) => urlDepth(a.url) - urlDepth(b.url) || a.url.localeCompare(b.url));
    pages.splice(0, pages.length, ...seeds, ...rest);
  }

  return { pages, fallbackByUrl };
}

function contentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

function buildFallbackPassage(site: TourismSite, page: CrawlPage, now: Date): TourismPassageInput | null {
  const title = page.fallback?.[page.language === 'ar' ? 'arabicTitle' : 'englishTitle']
    || page.fallback?.title
    || '';
  const intro = page.fallback?.introText || '';
  const text = `${title} ${intro}`.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return {
    site: site.key,
    emirate: site.emirate,
    ...(site.region ? { region: site.region } : {}),
    language: page.language,
    url: page.url,
    pageTitle: title || site.name,
    text,
    contentHash: contentHash(text),
    position: 0,
    fetchedAt: now,
  };
}

export async function crawlSite(
  site: TourismSite,
  dependencies: TourismCrawlDependencies = defaultDependencies,
): Promise<TourismCrawlResult> {
  const concurrency = site.concurrency ?? SITE_CONCURRENCY;
  const sleep = dependencies.sleep || defaultSleep;
  const startedAt = new Date();
  let pagesFetched = 0;
  let pagesFailed = 0;
  let firstError: string | undefined;
  const failedTargets = new Set<string>();
  const recordError = (error: unknown, target?: string): void => {
    if (target && failedTargets.has(target)) return;
    if (target) failedTargets.add(target);
    pagesFailed += 1;
    const message = messageFor(error);
    firstError ||= message;
    logger.warn('[tourism] page fetch failed', { site: site.key, error: message });
  };
  const textCache = new Map<string, Promise<string>>();
  const getText = (url: string): Promise<string> => {
    let pending = textCache.get(url);
    if (!pending) {
      pending = fetchTextWithRetry(dependencies.fetchText, url, sleep);
      textCache.set(url, pending);
    }
    return pending;
  };

  let passages: TourismPassageInput[] = [];
  try {
    const { pages, fallbackByUrl } = await discoverPages(site, getText, recordError, concurrency);
    await mapLimit(pages, concurrency, async page => {
      try {
        const html = await getText(page.url);
        if (isWafResponse(html)) throw new Error(`WAF response for ${page.url}`);
        pagesFetched += 1;
        const extracted = extractPage(html, page.url, site);
        const canonical = normalizeTourismUrl(site, extracted.canonicalUrl, page.url);
        const pageUrl = canonical?.url || page.url;
        const pageLanguage = canonical?.language || page.language;
        const fetchedAt = new Date();
        passages.push(...extracted.passages.map(passage => ({
          site: site.key,
          emirate: site.emirate,
          ...(site.region ? { region: site.region } : {}),
          language: pageLanguage,
          url: pageUrl,
          pageTitle: extracted.title || site.name,
          ...(passage.heading ? { heading: passage.heading } : {}),
          text: passage.text,
          contentHash: contentHash(passage.text),
          position: passage.position,
          fetchedAt,
        })));
      } catch (error) {
        recordError(error, page.url);
        const fallback = fallbackByUrl.get(page.url) || page.fallback;
        if (fallback) {
          const passage = buildFallbackPassage(site, { ...page, fallback }, new Date());
          if (passage) passages.push(passage);
        }
      }
    });

    const pagesByHash = new Map<string, Set<string>>();
    for (const passage of passages) {
      const hash = contentHash(passage.text);
      const urls = pagesByHash.get(hash) || new Set<string>();
      urls.add(passage.url);
      pagesByHash.set(hash, urls);
    }
    const hashesOnManyPages = new Set(
      [...pagesByHash.entries()].filter(([, urls]) => urls.size >= 4).map(([hash]) => hash),
    );
    const unique = new Set<string>();
    passages = passages.filter(passage => {
      const hash = contentHash(passage.text);
      if (hashesOnManyPages.has(hash) || unique.has(hash)) return false;
      unique.add(hash);
      return true;
    });

    if (passages.length) await dependencies.store.replaceSitePassages(site.key, passages);
  } catch (error) {
    recordError(error);
  }

  const status: TourismCrawlResult['status'] = passages.length === 0
    ? 'failed'
    : pagesFailed > 0
      ? 'partial'
      : 'ok';
  const run: TourismCrawlRunInput = {
    site: site.key,
    status,
    pagesFetched,
    pagesFailed,
    passages: passages.length,
    ...(firstError ? { error: firstError } : {}),
    startedAt,
    finishedAt: new Date(),
  };

  try {
    await dependencies.store.createCrawlRun(run);
  } catch (error) {
    logger.error('[tourism] crawl run could not be stored', { site: site.key, error: messageFor(error) });
    firstError ||= messageFor(error);
  }

  return { ...run, ...(firstError ? { error: firstError } : {}) };
}

export async function crawlAll(
  siteKey?: string,
  dependencies: TourismCrawlDependencies = defaultDependencies,
): Promise<TourismCrawlResult[]> {
  const sites = siteKey
    ? [getTourismSite(siteKey)].filter((site): site is TourismSite => Boolean(site))
    : tourismSites;
  if (siteKey && sites.length === 0) throw new Error(`Unknown tourism site: ${siteKey}`);
  return Promise.all(sites.map(site => crawlSite(site, dependencies)));
}
