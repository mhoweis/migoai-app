// Links people type in (ticket pages, websites, images) must be ordinary web
// addresses. `z.string().url()` alone also accepts `javascript:`, `data:` and
// `file:` URLs, which can run code or mislead when the app opens them.
import { z } from 'zod';

export const isHttpUrl = (value: string | null | undefined): boolean => {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const httpUrl = () =>
  z.string().trim().url().max(2048).refine(isHttpUrl, 'Link must start with http:// or https://');
