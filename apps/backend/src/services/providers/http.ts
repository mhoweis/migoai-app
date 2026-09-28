import axios from 'axios';
import * as cheerio from 'cheerio';
import config from '../../config/env';

export const http = axios.create({
  timeout: 20_000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  },
});

export const stripHtml = (html: string): string =>
  cheerio.load(html || '').text().replace(/\s+/g, ' ').trim();

export const absoluteUrl = (base: string, maybeRelative?: string): string | undefined => {
  if (!maybeRelative) return undefined;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
};

export const isDiscoveryProviderDisabled = (name: string): boolean =>
  config.DISCOVERY_PROVIDERS_DISABLED.includes(name);

export const cleanTitle = (value: unknown): string | undefined => {
  const title = typeof value === 'string' ? value.trim() : '';
  return title && title !== '$name' ? title : undefined;
};

export const cleanDescription = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const description = stripHtml(value).slice(0, 2000);
  return description || undefined;
};

export const validDateRange = (start: Date, end?: Date): boolean => {
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return (end || start).getTime() >= today.getTime();
};

export const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

export const parseDubaiDate = (dateText: string, timeText?: string): Date => {
  const normalizedTime = (timeText || '09:00 AM').trim();
  return new Date(`${dateText.trim()} ${normalizedTime} GMT+0400`);
};
