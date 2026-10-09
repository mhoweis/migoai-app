export type TourismLanguage = 'en' | 'ar';
export type TourismDiscovery = 'sitemap' | 'links' | 'algolia';

export interface TourismSite {
  key: string;
  name: string;
  emirate: string;
  region?: string;
  homepage: string;
  host: string;
  seeds: string[];
  discovery: TourismDiscovery;
  concurrency?: number;
  sitemaps?: string[];
  language(pathname: string): TourismLanguage | null;
}

const languageFromPath = (
  pathname: string,
  defaultEnglish: boolean,
): TourismLanguage | null => {
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (firstSegment === 'ar') return 'ar';
  if (firstSegment === 'en') return 'en';
  if (defaultEnglish && firstSegment && /^[a-z]{2}(?:-[a-z]{2,4})?$/i.test(firstSegment)) return null;
  return defaultEnglish ? 'en' : null;
};

export const tourismSites: TourismSite[] = [
  {
    key: 'visit-al-ain',
    name: 'Visit Al Ain',
    emirate: 'Abu Dhabi',
    region: 'Al Ain',
    homepage: 'https://visitalain.ae/en/arab-tourism-capital-2026',
    host: 'visitalain.ae',
    seeds: ['https://visitalain.ae/en/arab-tourism-capital-2026'],
    discovery: 'sitemap',
    sitemaps: ['https://visitalain.ae/sitemap.xml'],
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'visit-abu-dhabi',
    name: 'Visit Abu Dhabi',
    emirate: 'Abu Dhabi',
    homepage: 'https://visitabudhabi.ae/en',
    host: 'visitabudhabi.ae',
    seeds: ['https://visitabudhabi.ae/en'],
    discovery: 'sitemap',
    sitemaps: ['https://visitabudhabi.ae/sitemap.xml'],
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'visit-dubai',
    name: 'Visit Dubai',
    emirate: 'Dubai',
    homepage: 'https://www.visitdubai.com/en/',
    host: 'www.visitdubai.com',
    seeds: ['https://www.visitdubai.com/en/'],
    discovery: 'algolia',
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'visit-sharjah',
    name: 'Visit Sharjah',
    emirate: 'Sharjah',
    homepage: 'https://www.visitsharjah.com/',
    host: 'www.visitsharjah.com',
    seeds: ['https://www.visitsharjah.com/'],
    discovery: 'sitemap',
    sitemaps: [
      'https://www.visitsharjah.com/en/sitemapxml/',
      'https://www.visitsharjah.com/ar/sitemapxml/',
    ],
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'visit-rak',
    name: 'Visit Ras Al Khaimah',
    emirate: 'Ras Al Khaimah',
    homepage: 'https://visitrasalkhaimah.com/',
    host: 'visitrasalkhaimah.com',
    seeds: ['https://visitrasalkhaimah.com/'],
    discovery: 'sitemap',
    concurrency: 2,
    sitemaps: ['https://visitrasalkhaimah.com/sitemap_index.xml'],
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'fujairah-tourism',
    name: 'Fujairah Tourism',
    emirate: 'Fujairah',
    homepage: 'https://tourism.fujairah.ae/destinations',
    host: 'tourism.fujairah.ae',
    seeds: [
      'https://tourism.fujairah.ae/destinations',
      'https://tourism.fujairah.ae/home',
      'https://tourism.fujairah.ae/about',
      'https://tourism.fujairah.ae/antiquities',
      'https://tourism.fujairah.ae/hotels',
      'https://tourism.fujairah.ae/events',
    ],
    discovery: 'links',
    language: pathname => languageFromPath(pathname, true),
  },
  {
    key: 'visit-ajman',
    name: 'Visit Ajman',
    emirate: 'Ajman',
    homepage: 'https://visit-ajman.ae/en',
    host: 'visit-ajman.ae',
    seeds: ['https://visit-ajman.ae/en'],
    discovery: 'links',
    language: pathname => languageFromPath(pathname, false),
  },
  {
    key: 'visit-uaq',
    name: 'Visit Umm Al Quwain',
    emirate: 'Umm Al Quwain',
    homepage: 'https://visituaq.ae/',
    host: 'visituaq.ae',
    seeds: ['https://visituaq.ae/'],
    discovery: 'links',
    language: pathname => languageFromPath(pathname, true),
  },
];

export function getTourismSite(key: string): TourismSite | undefined {
  return tourismSites.find(site => site.key === key);
}

export interface TourismUrl {
  url: string;
  language: TourismLanguage;
}

export function normalizeTourismUrl(site: TourismSite, value: string, base = site.homepage): TourismUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch {
    return null;
  }

  const siteHost = site.host.toLowerCase().replace(/^www\./, '');
  const candidateHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (candidateHost !== siteHost || !['https:', 'http:'].includes(parsed.protocol)) return null;
  if (parsed.search || parsed.hash) return null;

  const pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  if (/\.(?:pdf|jpe?g|png|webp|svg|zip|mp4)$/i.test(pathname)) return null;
  if (
    /(?:^|\/)search(?:\/|$)/i.test(pathname)
    || /(?:^|\/)login(?:\/|$)/i.test(pathname)
    || /(?:^|\/)tag(?:\/|$)/i.test(pathname)
    || /(?:^|\/)page\/\d+(?:\/|$)/i.test(pathname)
    || /(?:^|\/)e-services(?:\/|$)/i.test(pathname)
    || /(?:^|\/)public(?:\/|$)/i.test(pathname)
  ) return null;

  const language = site.language(pathname);
  if (!language) return null;
  parsed.protocol = 'https:';
  parsed.hostname = site.host;
  parsed.pathname = pathname;
  parsed.search = '';
  parsed.hash = '';
  return { url: parsed.toString(), language };
}
