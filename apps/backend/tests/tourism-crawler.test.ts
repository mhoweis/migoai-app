import 'dotenv/config';
import config from '../src/config/env';
import { crawlSite } from '../src/services/tourism/crawler';
import { TourismSite } from '../src/services/tourism/sources';
import { TourismStore } from '../src/services/tourism/store';

const makeSite = (
  key: string,
  discovery: TourismSite['discovery'],
  seeds = ['https://example.com/'],
): TourismSite => ({
  key,
  name: key,
  emirate: 'Dubai',
  homepage: seeds[0],
  host: 'example.com',
  seeds,
  discovery,
  ...(discovery === 'sitemap' ? { sitemaps: ['https://example.com/sitemap.xml'] } : {}),
  language: pathname => pathname.startsWith('/ar/') ? 'ar' : 'en',
});

const makeStore = (): jest.Mocked<TourismStore> => ({
  replaceSitePassages: jest.fn().mockResolvedValue(undefined),
  createCrawlRun: jest.fn().mockResolvedValue(undefined),
});

const pageHtml = (url: string): string => `
  <main>
    <h1>Official destination guide</h1>
    <p>The official visitor information for ${url} includes places, landscapes, culture, heritage and practical details for exploring this destination. ${url}</p>
  </main>`;

describe('crawlSite', () => {
  it('records failed 403 and timeout pages without replacing old passages, while storing a healthy site', async () => {
    const failingStore = makeStore();
    const failingSite = makeSite('failure-site', 'links', [
      'https://example.com/',
      'https://example.com/slow',
    ]);
    const failingResult = await crawlSite(failingSite, {
      fetchText: async url => {
        if (url.endsWith('/slow')) throw new Error('Request timed out');
        throw Object.assign(new Error('HTTP 403'), { response: { status: 403 } });
      },
      store: failingStore,
    });

    expect(failingResult.status).toBe('failed');
    expect(failingResult.pagesFailed).toBe(2);
    expect(failingStore.replaceSitePassages).not.toHaveBeenCalled();
    expect(failingStore.createCrawlRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));

    const healthyStore = makeStore();
    const healthyResult = await crawlSite(makeSite('healthy-site', 'links'), {
      fetchText: async url => pageHtml(url),
      store: healthyStore,
    });
    expect(healthyResult.status).toBe('ok');
    expect(healthyStore.replaceSitePassages).toHaveBeenCalledTimes(1);
  });

  it('treats a Request Rejected body as a failed page', async () => {
    const store = makeStore();
    const result = await crawlSite(makeSite('waf-site', 'links'), {
      fetchText: async () => '<html><body>Request Rejected</body></html>',
      store,
    });

    expect(result.status).toBe('failed');
    expect(result.pagesFailed).toBe(1);
    expect(store.replaceSitePassages).not.toHaveBeenCalled();
  });

  it('retries a 429 page and indexes it after a successful retry', async () => {
    const store = makeStore();
    const sleep = jest.fn().mockResolvedValue(undefined);
    let attempts = 0;
    const result = await crawlSite(makeSite('retry-site', 'links'), {
      fetchText: async url => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('HTTP 429'), {
            response: { status: 429, headers: { 'retry-after': '1' } },
          });
        }
        return pageHtml(url);
      },
      sleep,
      store,
    });

    expect(result.status).toBe('ok');
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(store.replaceSitePassages).toHaveBeenCalledTimes(1);
  });

  it('never fetches off-host links', async () => {
    const store = makeStore();
    const fetched: string[] = [];
    const result = await crawlSite(makeSite('link-site', 'links'), {
      fetchText: async url => {
        fetched.push(url);
        return `${pageHtml(url)}<a href="https://outside.example/never-fetch">External</a>`;
      },
      store,
    });

    expect(result.status).toBe('ok');
    expect(fetched).toEqual(['https://example.com/']);
    expect(fetched.some(url => url.includes('outside.example'))).toBe(false);
  });

  it('respects the configured per-site page cap', async () => {
    const store = makeStore();
    const cap = config.TOURISM_MAX_PAGES_PER_SITE;
    const sitemap = `<urlset>${Array.from({ length: cap + 10 }, (_, index) =>
      `<url><loc>https://example.com/destinations/${index}</loc></url>`,
    ).join('')}</urlset>`;
    const result = await crawlSite(makeSite('capped-site', 'sitemap'), {
      fetchText: async url => url.endsWith('sitemap.xml') ? sitemap : pageHtml(url),
      store,
    });

    expect(result.pagesFetched).toBe(cap);
    expect(result.passages).toBe(cap);
    expect(store.replaceSitePassages).toHaveBeenCalledTimes(1);
  });
});
