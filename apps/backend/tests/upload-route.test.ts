// Regression test for "Could not upload this image": phone-camera photos
// (8–9 MB, sent uncompressed by the web image picker) were rejected by a
// 5 MB limit and surfaced as a generic 500.
process.env.SUPABASE_DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET = 'test-secret-1';
process.env.JWT_REFRESH_SECRET = 'test-secret-2';
process.env.NODE_ENV = 'test';
process.env.UPLOADS_DIR = `${require('os').tmpdir()}/migo-upload-route-test`;
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

jest.mock('../src/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.userId = 'user-1'; next(); },
}));

import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { uploadRouter } from '../src/routes/upload.routes';

const app = express();
app.use('/api/upload', uploadRouter);
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const send = (data: Buffer, filename: string, contentType: string) =>
  request(app).post('/api/upload/image').attach('image', data, { filename, contentType });

describe('POST /api/upload/image', () => {
  it('accepts a full-size 12 MP phone photo and shrinks it', async () => {
    const phonePhoto = await sharp({
      create: { width: 4032, height: 3024, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } },
    }).jpeg({ quality: 92 }).toBuffer();
    expect(phonePhoto.length).toBeGreaterThan(5 * 1024 * 1024); // the old limit

    const res = await send(phonePhoto, 'IMG_0001.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.data.path).toMatch(/^\/api\/uploads\/[0-9a-f-]+\.jpg$/);
  }, 60_000);

  it('answers 413 with a readable message for files over the limit', async () => {
    const res = await send(Buffer.alloc(16 * 1024 * 1024, 1), 'huge.jpg', 'image/jpeg');
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  });

  it('answers 415, not 500, for files that are not images', async () => {
    const res = await send(Buffer.from('<html></html>'), 'page.jpg', 'image/jpeg');
    expect(res.status).toBe(415);
  });
});
