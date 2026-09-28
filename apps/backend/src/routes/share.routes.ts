import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import config from '../config/env';
import { findInviteForEvent, formatShareDate } from '../services/social.service';

const router = Router();

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const requestOrigin = (req: Request): string => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.get('host') || '');
  return `${forwardedProto}://${forwardedHost}`;
};

export const getWebBase = (req: Request, fallback?: string): string => (
  (fallback || config.APP_PUBLIC_URL || requestOrigin(req)).replace(/\/+$/, '')
);

router.get('/:eventId', async (req: Request, res: Response) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.eventId,
      status: 'ACTIVE',
      visibility: { not: 'PRIVATE' },
    },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      venueName: true,
      city: true,
      coverImage: true,
      isFree: true,
      priceFrom: true,
      currency: true,
    },
  });
  if (!event) {
    res.status(404).send('Not found');
    return;
  }

  const code = typeof req.query.ref === 'string' ? req.query.ref : undefined;
  const invite = await findInviteForEvent(event.id, code);
  if (invite) {
    await prisma.eventInvite.update({
      where: { id: invite.id },
      data: { views: { increment: 1 } },
    });
  }
  const webBase = getWebBase(req);
  const selfUrl = `${webBase}/e/${encodeURIComponent(event.id)}${code ? `?ref=${encodeURIComponent(code)}` : ''}`;
  const appUrl = `${webBase}/?event=${encodeURIComponent(event.id)}${code ? `&ref=${encodeURIComponent(code)}` : ''}`;
  const dateLine = `${formatShareDate(event.startDate)} · ${event.venueName || event.city || 'TBA'} · ${event.isFree ? 'Free' : `from ${event.currency || 'AED'} ${Number(event.priceFrom || 0).toFixed(2)}`}`;
  const image = event.coverImage ? `<meta property="og:image" content="${escapeHtml(event.coverImage)}">` : '';
  const poster = event.coverImage ? `<img src="${escapeHtml(event.coverImage)}" alt="${escapeHtml(event.title)}">` : '';
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta property="og:title" content="${escapeHtml(event.title)}">
<meta property="og:description" content="${escapeHtml(dateLine)}">
${image}<meta property="og:url" content="${escapeHtml(selfUrl)}">
<meta name="twitter:card" content="summary_large_image"><title>${escapeHtml(event.title)}</title></head>
<body><main>${poster}<h1>${escapeHtml(event.title)}</h1><p>${escapeHtml(dateLine)}</p>
<a href="${escapeHtml(appUrl)}">Open in Migo</a>
<p><a href="migo://event/${encodeURIComponent(event.id)}${code ? `?ref=${encodeURIComponent(code)}` : ''}">Open in the app</a></p></main></body></html>`);
});

export default router;
