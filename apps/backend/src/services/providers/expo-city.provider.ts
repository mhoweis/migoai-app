import { EventProvider, NormalizedEvent, SyncWindow } from './types';
import config from '../../config/env';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  htmlHeaders,
  http,
  isDiscoveryProviderDisabled,
  numberValue,
  validDateRange,
} from './http';

const pageUrl = 'https://www.expocitydubai.com/en/things-to-do/events-and-workshops/';
const eventTypeId = 'WXCXO40WpQyhhroETpmM2';
let credentials: { env: string; space: string; token: string } | undefined;
let loggedPriceShape = false;

class ExpoCityProvider implements EventProvider {
  readonly name = 'expo-city';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];
    try {
      const auth = await this.getCredentials();
      const items: any[] = [];
      const includes: any = { Entry: [], Asset: [] };
      let skip = 0;
      const limit = 100;
      while (true) {
        const response = await http.get(
          `https://cdn.contentful.com/spaces/${auth.space}/environments/${auth.env}/entries`,
          {
            params: {
              access_token: auth.token,
              content_type: 'templatePoi',
              'fields.type.sys.id': eventTypeId,
              'fields.endDate[gte]': new Date().toISOString().slice(0, 10),
              limit,
              skip,
              include: 3,
              locale: 'en',
            },
          },
        );
        items.push(...(response.data?.items || []));
        for (const type of ['Entry', 'Asset']) includes[type].push(...(response.data?.includes?.[type] || []));
        if ((response.data?.items || []).length < limit) break;
        skip += limit;
      }
      const entries = new Map<string, any>(includes.Entry.map((entry: any) => [entry.sys.id, entry]));
      const assets = new Map<string, any>(includes.Asset.map((asset: any) => [asset.sys.id, asset]));
      return items.flatMap(item => {
        try {
          return this.normalize(item, entries, assets);
        } catch (error: any) {
          logger.warn('Expo City event skipped', { error: error.message });
          return [];
        }
      });
    } catch (error: any) {
      logger.error('Expo City provider failed', { error: error.message });
      if (config.EXPO_CITY_CONTENTFUL_TOKEN) credentials = undefined;
      return [];
    }
  }

  private async getCredentials(): Promise<{ env: string; space: string; token: string }> {
    if (credentials) return credentials;
    if (config.EXPO_CITY_CONTENTFUL_TOKEN) {
      credentials = { env: 'master-v2', space: 'r2cfrvo3y08m', token: config.EXPO_CITY_CONTENTFUL_TOKEN };
      return credentials;
    }
    const page = await http.get(pageUrl, { headers: htmlHeaders });
    const html = page.data as string;
    const find = (key: string) => html.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`))?.[1];
    const env = find('CF_ENV');
    const space = find('CF_SPACE_ID');
    const token = find('CF_ACCESS_TOKEN');
    if (!env || !space || !token) throw new Error('Contentful credentials not found');
    credentials = { env, space, token };
    return credentials;
  }

  private normalize(item: any, entries: Map<string, any>, assets: Map<string, any>): NormalizedEvent[] {
    const fields = item.fields || {};
    const title = cleanTitle(fields.title);
    if (!title) return [];
    const dates = Array.isArray(fields.eventTimingJson?.dates)
      ? fields.eventTimingJson.dates
      : [fields.eventTimingJson?.dates].filter(Boolean);
    const candidates: Array<{ start: Date; end?: Date }> = dates.map((value: string) => {
      const [startValue, endValue] = value.split(' - ').map(part => part.trim());
      return { start: new Date(startValue), end: endValue ? new Date(endValue) : undefined };
    }).filter((candidate: { start: Date; end?: Date }) => validDateRange(candidate.start, candidate.end));
    if (!candidates.length) return [];
    const selected = candidates.sort(
      (a: { start: Date }, b: { start: Date }) => a.start.getTime() - b.start.getTime(),
    )[0];
    const location = this.resolveLink(fields.location, entries);
    const action = this.resolveLink(fields.primaryAction, entries);
    const price = this.resolveLink(fields.price, entries);
    const priceFields = price?.fields || {};
    if (price && !loggedPriceShape) {
      loggedPriceShape = true;
      logger.debug('Expo City price entry shape', { priceFields });
    }
    const priceFrom = Object.values(priceFields)
      .map(numberValue)
      .find(value => value !== undefined);
    const freeText = Object.values(priceFields).some(value => typeof value === 'string' && value.toLowerCase().includes('free'));
    const coverImage = this.findImage(fields.media?.[0], entries, assets);
    const externalUrl = action?.fields?.buttonUrl || absoluteUrl(
      pageUrl,
      `${fields.slug ? `${fields.slug}/` : ''}`,
    );
    const event: NormalizedEvent = {
      externalId: item.sys.id,
      externalSource: this.name,
      title,
      description: cleanDescription(fields.textDescription || fields.titleDescription || title),
      startDate: selected.start,
      endDate: selected.end || (fields.endDate ? new Date(fields.endDate) : undefined),
      venueName: location?.fields?.displayName,
      address: 'Expo City Dubai',
      city: 'Dubai',
      country: 'United Arab Emirates',
      latitude: location?.fields?.locationOnMap?.lat,
      longitude: location?.fields?.locationOnMap?.lon,
      coverImage,
      priceFrom,
      currency: priceFrom !== undefined ? 'AED' : undefined,
      isFree: freeText || undefined,
      category: this.resolveLink(fields.subtype?.[0], entries)?.fields?.title
        || this.resolveLink(fields.subtype?.[0], entries)?.fields?.displayName
        || 'Entertainment',
      externalUrl,
    };
    return validDateRange(event.startDate, event.endDate) ? [event] : [];
  }

  private resolveLink(link: any, entries: Map<string, any>): any {
    const id = link?.sys?.id;
    return id ? entries.get(id) : undefined;
  }

  private findImage(mediaLink: any, entries: Map<string, any>, assets: Map<string, any>): string | undefined {
    const media = this.resolveLink(mediaLink, entries);
    const firstItem = this.resolveLink(media?.fields?.items?.[0], entries);
    const fields = firstItem?.fields || {};
    for (const key of ['image', 'asset', 'media', 'file']) {
      const asset = assets.get(fields[key]?.sys?.id);
      if (asset?.fields?.file?.url) return asset.fields.file.url.startsWith('//')
        ? `https:${asset.fields.file.url}` : asset.fields.file.url;
    }
    for (const value of Object.values(fields)) {
      const asset = assets.get((value as any)?.sys?.id);
      if (asset?.fields?.file?.url) return asset.fields.file.url.startsWith('//')
        ? `https:${asset.fields.file.url}` : asset.fields.file.url;
    }
    return undefined;
  }
}

export const expoCityProvider = new ExpoCityProvider();
export default expoCityProvider;
