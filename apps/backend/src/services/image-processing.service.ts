// src/services/image-processing.service.ts
// Turns an uploaded file into a clean image that is safe to publish.
import sharp from 'sharp';

// Uploads come from strangers, so only the four image decoders we accept are
// left enabled. libvips has had several security bugs in decoders we never
// need (TIFF, VIPS, SVG, PDF, HEIF...); with these blocked, a crafted file in
// one of those formats is refused before any decoding happens.
sharp.block({
  operation: [
    'VipsForeignLoadTiff', 'VipsForeignLoadVips', 'VipsForeignLoadSvg', 'VipsForeignLoadPdf',
    'VipsForeignLoadHeif', 'VipsForeignLoadMagick', 'VipsForeignLoadJp2k', 'VipsForeignLoadJxl',
    'VipsForeignLoadFits', 'VipsForeignLoadOpenexr', 'VipsForeignLoadOpenslide', 'VipsForeignLoadMatrix',
    'VipsForeignLoadCsv', 'VipsForeignLoadPpm', 'VipsForeignLoadRad', 'VipsForeignLoadAnalyze',
    'VipsForeignLoadRaw',
  ],
});

// HEIC/HEIF (iPhone camera default) is recognised from its header so people get
// a specific message, without handing the file to the (blocked) HEIF decoder.
const isHeif = (input: Buffer): boolean =>
  input.length > 12 && input.toString('latin1', 4, 8) === 'ftyp'
  && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(input.toString('latin1', 8, 12));

/** Largest side kept, in pixels. Phone photos are often 4000+ px; profile and
 *  event pictures never display that large, and smaller files load faster. */
export const MAX_IMAGE_SIDE = 2048;

export class UnsupportedImageError extends Error {}

export type ProcessedImage = { data: Buffer; extension: '.jpg' | '.png' | '.gif' | '.webp'; contentType: string };

/**
 * Decodes and re-encodes the upload. This
 *  1. proves the file really is an image, whatever type the browser claimed;
 *  2. drops all metadata (EXIF), including the GPS position phones store in
 *     photos, after applying the orientation so pictures stay upright;
 *  3. shrinks very large photos to MAX_IMAGE_SIDE.
 */
export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  if (isHeif(input)) {
    throw new UnsupportedImageError('heif');
  }
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new UnsupportedImageError('not an image');
  }

  const image = sharp(input, { animated: format === 'gif', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });

  try {
    switch (format) {
      case 'jpeg':
        return { data: await image.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), extension: '.jpg', contentType: 'image/jpeg' };
      case 'png':
        return { data: await image.png().toBuffer(), extension: '.png', contentType: 'image/png' };
      case 'webp':
        return { data: await image.webp({ quality: 85 }).toBuffer(), extension: '.webp', contentType: 'image/webp' };
      case 'gif':
        return { data: await image.gif().toBuffer(), extension: '.gif', contentType: 'image/gif' };
      default:
        throw new UnsupportedImageError(String(format));
    }
  } catch (error) {
    if (error instanceof UnsupportedImageError) throw error;
    throw new UnsupportedImageError('could not decode');
  }
}
