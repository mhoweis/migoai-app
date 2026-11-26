import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { storageConfigured, uploadPublicImage } from '../services/storage.service';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import config from '../config/env';

const router = Router();
const uploadsDir = config.UPLOADS_DIR;
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/.test(file.mimetype)) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.post('/image', authenticate, upload.single('image'), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Image file is required' });
    return;
  }
  // Re-encode every upload. This (1) proves the file really is an image, whatever
  // type the browser claimed, and (2) drops all metadata (EXIF), including the GPS
  // position phones embed in photos, so a profile picture can't reveal where
  // someone lives. Orientation is applied first so photos stay the right way up.
  let output: { data: Buffer; extension: string };
  try {
    const animated = req.file.mimetype === 'image/gif';
    const image = sharp(req.file.buffer, { animated, limitInputPixels: 40_000_000 }).rotate();
    const format = (await image.metadata()).format;
    if (format === 'png') {
      output = { data: await image.png().toBuffer(), extension: '.png' };
    } else if (format === 'gif') {
      output = { data: await image.gif().toBuffer(), extension: '.gif' };
    } else if (format === 'webp') {
      output = { data: await image.webp({ quality: 85 }).toBuffer(), extension: '.webp' };
    } else if (format === 'jpeg') {
      output = { data: await image.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), extension: '.jpg' };
    } else {
      throw new Error(`unsupported format ${format}`);
    }
  } catch {
    res.status(400).json({ success: false, error: 'That file is not a supported image' });
    return;
  }
  const filename = `${crypto.randomUUID()}${output.extension}`;

  if (storageConfigured()) {
    const contentType = { '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[output.extension]!;
    try {
      const url = await uploadPublicImage(filename, output.data, contentType);
      res.json({ success: true, data: { url } });
      return;
    } catch {
      // Already logged with the reason (and shown in /api/health). Keep the
      // upload working by saving to disk below rather than failing the user.
    }
  }

  // Fallback without (working) Supabase Storage: the server's own disk, lost on redeploy.
  await fs.promises.writeFile(path.join(uploadsDir, filename), output.data);
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host'));
  const uploadPath = `/api/uploads/${filename}`;
  res.json({ success: true, data: { url: `${protocol}://${host}${uploadPath}`, path: uploadPath } });
});

export { router as uploadRouter };