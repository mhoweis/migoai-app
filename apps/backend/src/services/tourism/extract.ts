import * as cheerio from 'cheerio';
import { normalizeTourismUrl, TourismSite } from './sources';

export interface ExtractedPassage {
  heading?: string;
  text: string;
  position: number;
}

export interface ExtractedPage {
  title: string;
  canonicalUrl: string;
  passages: ExtractedPassage[];
}

const removedElements = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'header',
  'footer',
  'nav',
  'form',
  'aside',
  '[role="navigation"]',
  '[aria-hidden="true"]',
  '[id^="onetrust" i]',
  '[class*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="consent" i]',
  '[id*="consent" i]',
  '[class*="breadcrumb" i]',
  '[id*="breadcrumb" i]',
  '[aria-label*="breadcrumb" i]',
].join(', ');

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

function titleForPage($: cheerio.CheerioAPI, site: TourismSite): string {
  let title = collapseWhitespace(
    $('meta[property="og:title"]').first().attr('content')
      || $('h1').first().text()
      || $('title').first().text()
      || '',
  );
  const suffixes = [
    site.name.toLowerCase(),
    site.name.replace(/^visit\s+/i, '').toLowerCase(),
    site.host.replace(/^www\./i, '').toLowerCase(),
  ];
  title = title.replace(/\s+(?:\||-)\s+([^|]+)$/u, (suffix, text: string) =>
    suffixes.some(value => text.toLowerCase().includes(value)) ? '' : suffix,
  );
  return collapseWhitespace(title);
}

function splitLongBlock(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const sentences = text.match(/[^.!?؟]+(?:[.!?؟]+|$)/gu)?.map(collapseWhitespace).filter(Boolean) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      let remaining = sentence;
      while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf(' ', maxLength);
        if (splitAt < Math.floor(maxLength / 2)) splitAt = maxLength;
        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
      }
      current = remaining;
      continue;
    }
    if (current && current.length + sentence.length + 1 > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function extractPage(html: string, url: string, site: TourismSite): ExtractedPage {
  const $ = cheerio.load(html || '');
  $(removedElements).remove();

  const root = $('main').first().length
    ? $('main').first()
    : $('[role="main"]').first().length
      ? $('[role="main"]').first()
      : $('article').first().length
        ? $('article').first()
        : $('body');

  const title = titleForPage($, site);
  const fetchedUrl = normalizeTourismUrl(site, url)?.url || url.split(/[?#]/, 1)[0];
  const canonical = $('link[rel="canonical"]').first().attr('href');
  const canonicalUrl = canonical
    ? normalizeTourismUrl(site, canonical)?.url || fetchedUrl
    : fetchedUrl;
  const sections: Array<{ heading?: string; blocks: string[] }> = [];
  let current: { heading?: string; blocks: string[] } = { blocks: [] };

  root.find('h1, h2, h3, h4, p, li, dt, dd, blockquote, td').each((_index, element) => {
    const node = $(element);
    const text = collapseWhitespace(node.text());
    if (!text) return;
    const tag = (element as any).tagName?.toLowerCase();
    if (/^h[1-4]$/.test(tag)) {
      if (current.blocks.length) sections.push(current);
      current = { heading: text, blocks: [] };
    } else if (text.length >= (tag === 'li' ? 20 : 40)) {
      current.blocks.push(text);
    }
  });
  if (current.blocks.length) sections.push(current);

  const passages: ExtractedPassage[] = [];
  for (const section of sections) {
    let buffer = '';
    const emit = (): void => {
      const text = collapseWhitespace(buffer);
      if (text.length >= 120) passages.push({
        ...(section.heading ? { heading: section.heading } : {}),
        text,
        position: passages.length,
      });
      buffer = '';
    };

    for (const block of section.blocks) {
      for (const piece of splitLongBlock(block, 1200)) {
        if (buffer && buffer.length + piece.length + 1 > 1200) emit();
        buffer = buffer ? `${buffer} ${piece}` : piece;
        if (buffer.length >= 300) emit();
      }
    }
    if (buffer) emit();
  }

  return { title, canonicalUrl, passages };
}
