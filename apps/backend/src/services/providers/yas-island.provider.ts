import { createHash } from 'crypto';
import config from '../../config/env';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  isDiscoveryProviderDisabled,
  http,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const searchUrl = 'https://apis.miralexperiences.com/v1/search/';
const siteUrl = 'https://www.yasisland.com';
const pageSize = 100;
const maxPages = 10;
const fieldsToInclude = [
  'fmorepackagecardtitle32545',
  'fdescription32545',
  'flocation32545',
  'fpackagetype32545',
  'fz95xlanguage32545',
  'fz95xtemplatename32545',
  'ftenantinfo32545',
  'fid32545',
  'fversion32545',
  'fmorepackagecardimages32545',
  'fmorepackagebooknowlink32545',
  'fmorepackagetype32545',
  'flistingiconsdata32545',
  'fdaterange32545',
  'fmorepackagetagtype32545',
];

class YasIslandProvider implements EventProvider {
  readonly name = 'yas_island';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'abu dhabi') return [];

    try {
      const results: any[] = [];
      let totalCount = 0;
      for (let page = 0; page < maxPages; page += 1) {
        const firstResult = page * pageSize;
        if (page > 0 && firstResult >= totalCount) break;
        const response = await http.post(searchUrl, {
          numberOfResults: pageSize,
          aq: '(@fz95xtemplatename32545==Event)(@ftenantinfo32545=YIB2C)(@fz95xlanguage32545==en)',
          fieldsToInclude,
          groupBy: [],
          sortField: 'fdaterange32545',
          sortCriteria: 'fieldascending',
          searchHub: '',
          firstResult,
        }, {
          headers: {
            'Content-Type': 'application/json',
            Origin: siteUrl,
            Referer: `${siteUrl}/en/events`,
            ...(config.YAS_ISLAND_COVEO_TOKEN
              ? { Authorization: `Bearer ${config.YAS_ISLAND_COVEO_TOKEN}` }
              : {}),
          },
        });
        const pageResults = Array.isArray(response.data?.results) ? response.data.results : [];
        totalCount = Number(response.data?.totalCount || 0);
        results.push(...pageResults);
        if (pageResults.length < pageSize || firstResult + pageResults.length >= totalCount) break;
      }

      const seen = new Set<string>();
      return results.flatMap(item => {
        const event = this.normalize(item?.raw || item);
        if (!event || seen.has(event.externalId)) return [];
        seen.add(event.externalId);
        return [event];
      });
    } catch (error: any) {
      logger.error('Yas Island provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(raw: any): NormalizedEvent | undefined {
    const title = cleanTitle(raw?.fmorepackagecardtitle32545);
    const timestamp = Number(raw?.fdaterange32545);
    const startDate = new Date(timestamp);
    if (!title || Number.isNaN(startDate.getTime())) return undefined;

    const endDate = this.parseEndDate(raw?.flocation32545, startDate);
    if (!validDateRange(startDate, endDate)) return undefined;

    const images = this.parseJson(raw?.fmorepackagecardimages32545);
    const bookingLink = this.parseJson(raw?.fmorepackagebooknowlink32545);
    const venue = cleanTitle(raw?.fmorepackagetagtype32545) || 'Yas Island';
    const externalId = cleanTitle(raw?.fid32545)
      || createHash('sha1').update(`${title}:${startDate.toISOString()}`).digest('hex');

    return {
      externalId,
      externalSource: this.name,
      title,
      description: cleanDescription(raw?.fdescription32545),
      startDate,
      endDate,
      venueName: venue,
      address: 'Yas Island, Abu Dhabi',
      city: 'Abu Dhabi',
      country: 'United Arab Emirates',
      coverImage: absoluteUrl(siteUrl, images?.desktopImage?.src),
      externalUrl: absoluteUrl(siteUrl, bookingLink?.Href) || `${siteUrl}/en/events`,
      category: cleanTitle(raw?.fmorepackagetype32545) || 'Entertainment',
      tags: ['Yas Island', venue],
    };
  }

  private parseJson(value: unknown): any {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private parseEndDate(value: unknown, startDate: Date): Date | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.replace(/\s+/g, ' ').trim();
    const endDateMatch = text.match(
      /(?:to|-)\s*(?:[A-Za-z]+,\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s*,?\s*(\d{4}))?/i,
    );
    const monthFirstMatch = text.match(
      /(?:to|-)\s*(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i,
    );
    const match = endDateMatch || monthFirstMatch;
    if (!match) return undefined;
    const day = Number(endDateMatch ? match[1] : match[2]);
    const month = endDateMatch ? match[2] : match[1];
    const explicitYear = match[3];
    let year = explicitYear ? Number(explicitYear) : startDate.getUTCFullYear();
    let endDate = new Date(`${month} ${day}, ${year} 11:59:59 PM GMT+0400`);
    if (Number.isNaN(endDate.getTime())) return undefined;
    const endCalendar = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const startCalendar = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    if (endCalendar < startCalendar && !explicitYear) {
      year += 1;
      endDate = new Date(`${month} ${day}, ${year} 11:59:59 PM GMT+0400`);
    }
    return Number.isNaN(endDate.getTime()) ? undefined : endDate;
  }
}

export const yasIslandProvider = new YasIslandProvider();
export default yasIslandProvider;
