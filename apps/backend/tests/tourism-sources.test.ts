import { getTourismSite, normalizeTourismUrl } from '../src/services/tourism/sources';

describe('tourism source URL filtering', () => {
  const rak = getTourismSite('visit-rak')!;
  const fujairah = getTourismSite('fujairah-tourism')!;
  const ajman = getTourismSite('visit-ajman')!;

  it('rejects off-host URLs, query strings, fragments, and non-page files', () => {
    expect(normalizeTourismUrl(rak, 'https://example.com/discover')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/discover?sort=recent')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/discover#top')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/brochure.pdf')).toBeNull();
  });

  it('classifies locale paths and rejects foreign-language pages on English-default sites', () => {
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/he/where-to-go')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/ru/x')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/zh-cn/x')).toBeNull();
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/en/x')?.language).toBe('en');
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/ar/attractions')?.language).toBe('ar');
    expect(normalizeTourismUrl(rak, 'https://visitrasalkhaimah.com/attractions/x')?.language).toBe('en');
  });

  it('rejects Fujairah service paths and accepts Ajman English pages', () => {
    expect(normalizeTourismUrl(fujairah, 'https://tourism.fujairah.ae/e-services/login')).toBeNull();
    expect(normalizeTourismUrl(ajman, 'https://visit-ajman.ae/en/places-to-visit')?.language).toBe('en');
  });
});
