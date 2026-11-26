// src/services/storage.service.ts
// Saves uploaded images to Supabase Storage (a public bucket), so they survive
// deploys and load from a fixed address on web and in the apps.
import config from '../config/env';
import logger from '../utils/logger';

/**
 * Accepts the project URL in the forms people tend to paste:
 *   https://<ref>.supabase.co                       (correct)
 *   https://<ref>.supabase.co/rest/v1/  or /storage  (extra path)
 *   https://supabase.com/dashboard/project/<ref>     (dashboard link)
 * and returns https://<ref>.supabase.co, or '' if it can't be understood.
 */
export function normaliseSupabaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const dashboard = url.hostname === 'supabase.com' && url.pathname.match(/\/project\/([a-z0-9]{20})/);
    if (dashboard) return `https://${dashboard[1]}.supabase.co`;
    if (url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

const projectUrl = normaliseSupabaseUrl(config.SUPABASE_URL);
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY.trim();
let lastError: string | null = null;

if (config.SUPABASE_URL && !projectUrl) {
  logger.error(`[storage] SUPABASE_URL "${config.SUPABASE_URL}" is not a Supabase project URL; uploads use the server disk`);
} else if (projectUrl && !serviceKey) {
  logger.warn('[storage] SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is not; uploads use the server disk');
}

export const storageConfigured = (): boolean => Boolean(projectUrl && serviceKey);

/** For /api/health: where uploads go, and why the last Supabase upload failed. */
export const storageStatus = (): string => {
  if (!storageConfigured()) return 'disk (Supabase Storage not configured)';
  return lastError ? `supabase (last upload failed: ${lastError})` : 'supabase';
};

function authHeaders(): Record<string, string> {
  // New-style secret keys (sb_secret_...) are not JWTs: Supabase wants them in
  // the apikey header only. Legacy service_role keys are JWTs and go in both.
  return serviceKey.startsWith('sb_')
    ? { apikey: serviceKey }
    : { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

/** Uploads the file and returns its public URL. Throws if the upload fails. */
export async function uploadPublicImage(filename: string, data: Buffer, contentType: string): Promise<string> {
  const bucket = encodeURIComponent(config.SUPABASE_STORAGE_BUCKET);
  const objectPath = encodeURIComponent(filename);
  let response: Response;
  try {
    response = await fetch(`${projectUrl}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error: any) {
    lastError = `could not reach ${projectUrl} (${error?.name || 'network error'})`;
    logger.error(`[storage] Upload to Supabase failed: ${lastError}`);
    throw new Error('Image storage upload failed');
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    lastError = `HTTP ${response.status}`;
    logger.error(`[storage] Upload to Supabase failed: ${response.status} ${detail}`);
    throw new Error('Image storage upload failed');
  }
  lastError = null;
  return `${projectUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}
