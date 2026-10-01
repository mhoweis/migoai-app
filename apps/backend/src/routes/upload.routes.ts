import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
const uploadsDir = path.resolve(__dirname, '../../uploads');
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
  const extension = `.${req.file.mimetype.split('/')[1].replace('jpeg', 'jpg')}`;
  const filename = `${crypto.randomUUID()}${extension}`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), req.file.buffer);
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host'));
  const uploadPath = `/api/uploads/${filename}`;
  res.json({ success: true, data: { url: `${protocol}://${host}${uploadPath}`, path: uploadPath } });
});

export { router as uploadRouter };