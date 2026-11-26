// src/services/storage.service.ts
// Saves uploaded images to Supabase Storage (a public bucket), so they survive
// deploys and load from a fixed address on web and in the apps.
import config from '../config/env';
import logger from '../utils/logger';

export const storageConfigured = (): boolean =>
  Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);

/** Uploads the file and returns its public URL. Throws if the upload fails. */
export async function uploadPublicImage(filename: string, data: Buffer, contentType: string): Promise<string> {
  const bucket = encodeURIComponent(config.SUPABASE_STORAGE_BUCKET);
  const objectPath = encodeURIComponent(filename);
  const response = await fetch(`${config.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': contentType,
      'Cache-Control': 'max-age=31536000, immutable',
      'x-upsert': 'false',
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    logger.error(`[storage] Upload to Supabase failed: ${response.status} ${detail}`);
    throw new Error('Image storage upload failed');
  }
  return `${config.SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}
