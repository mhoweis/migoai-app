import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { storageConfigured, uploadPublicImage } from '../services/storage.service';
import { processUploadedImage, UnsupportedImageError } from '../services/image-processing.service';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import config from '../config/env';

const router = Router();
const uploadsDir = config.UPLOADS_DIR;
fs.mkdirSync(uploadsDir, { recursive: true });

// Phone cameras produce 3–12 MB photos and the web image picker sends them
// uncompressed, so accept up to 15 MB; every image is shrunk before it's stored.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Turn multer's errors into answers people can act on (they used to surface as a
// generic 500 "Internal server error").
const receiveImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: 'That photo is too large. Please choose one under 15 MB.' });
      return;
    }
    res.status(400).json({ success: false, error: 'Could not read the uploaded file.' });
  });
};

router.post('/image', authenticate, receiveImage, async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Image file is required' });
    return;
  }

  let image;
  try {
    image = await processUploadedImage(req.file.buffer);
  } catch (error) {
    const heif = error instanceof UnsupportedImageError && error.message === 'heif';
    res.status(415).json({
      success: false,
      error: heif
        ? 'HEIC photos are not supported yet. Please choose a JPEG or PNG, or set your camera to "Most Compatible".'
        : 'That file is not a supported image. Please use JPEG, PNG, WebP or GIF.',
    });
    return;
  }
  const filename = `${crypto.randomUUID()}${image.extension}`;

  if (storageConfigured()) {
    try {
      const url = await uploadPublicImage(filename, image.data, image.contentType);
      res.json({ success: true, data: { url } });
      return;
    } catch {
      // Already logged with the reason and shown in /api/health (imageStorage).
      // Keep the upload working by saving to disk below rather than failing.
    }
  }

  // Without (working) Supabase Storage: the server's own disk, lost on redeploy.
  await fs.promises.writeFile(path.join(uploadsDir, filename), image.data);
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host'));
  const uploadPath = `/api/uploads/${filename}`;
  res.json({ success: true, data: { url: `${protocol}://${host}${uploadPath}`, path: uploadPath } });
});

export { router as uploadRouter };
