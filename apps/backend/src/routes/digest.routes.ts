import { Router, Request, Response } from 'express';
import { buildWeekendDigest, formatDigestTime } from '../services/digest.service';

const router = Router();

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const requestOrigin = (req: Request): string => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '');
  return `${proto}://${host}`;
};

const getDigestUrl = (req: Request, city?: string, lang = 'en') => {
  const query = new URLSearchParams();
  if (city) query.set('city', city);
  if (lang === 'ar') query.set('lang', lang);
  return `${requestOrigin(req)}/digest/weekend${query.toString() ? `?${query}` : ''}`;
};

router.get('/weekend', async (req: Request, res: Response) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const locale = req.query.lang === 'ar' ? 'ar' : 'en';
  const digest = await buildWeekendDigest(city, locale);
  res.json({ success: true, data: digest });
});

router.get('/weekend/whatsapp', async (req: Request, res: Response) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const digest = await buildWeekendDigest(city, 'en');
  const lines = digest.sections.flatMap(section => section.events.map(event => (
    `• ${formatDigestTime(event.startDate)} · ${event.title} — ${event.venueName || event.city || 'TBA'}${event.isFree ? ' (Free)' : ''}`
  ))).slice(0, 10);
  const heading = `${digest.title}\n`;
  const suffix = `\n${getDigestUrl(req, city)}`;
  let text = `${heading}\n${lines.join('\n')}${suffix}`;
  if (text.length > 1500) {
    text = `${heading}\n${lines.slice(0, 10).join('\n')}${suffix}`.slice(0, 1500);
  }
  res.json({
    success: true,
    data: {
      text,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    },
  });
});

export const digestHtmlRouter = Router();

digestHtmlRouter.get('/weekend', async (req: Request, res: Response) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const locale = req.query.lang === 'ar' ? 'ar' : 'en';
  const digest = await buildWeekendDigest(city, locale);
  const direction = locale === 'ar' ? ' dir="rtl"' : '';
  const cards = digest.sections.map(section => `
    <section><h2>${escapeHtml(section.heading)}</h2><div class="cards">
      ${section.events.map(event => `<a class="card" href="/e/${encodeURIComponent(event.id)}">
        ${event.coverImage ? `<img src="${escapeHtml(event.coverImage)}" alt="${escapeHtml(event.title)}">` : ''}
        <strong>${escapeHtml(event.title)}</strong>
        <span>${escapeHtml(formatDigestTime(event.startDate))} · ${escapeHtml(event.venueName || event.city || '')}</span>
        <small>${escapeHtml(event.source)}${event.isFree ? ' · Free' : ''}</small>
      </a>`).join('')}
    </div></section>`).join('');
  res.type('html').send(`<!doctype html><html lang="${locale}"${direction}><head><meta charset="utf-8">
<meta property="og:title" content="${escapeHtml(digest.title)} · Migo">
<meta name="description" content="${escapeHtml(digest.title)}"><title>${escapeHtml(digest.title)} · Migo</title>
<style>body{font-family:system-ui;margin:0;padding:24px;background:#f7f7f7;color:#111}main{max-width:960px;margin:auto}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{background:#fff;padding:12px;border-radius:12px;color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:8px}.card img{width:100%;height:140px;object-fit:cover;border-radius:8px}.card span,.card small{color:#666}</style></head>
<body><main><h1>${escapeHtml(digest.title)}</h1>${cards}<footer><a href="${escapeHtml(getDigestUrl(req, city, locale))}">Open Migo</a></footer></main></body></html>`);
});

export default router;
