// src/routes/go.routes.ts
//
//   GET /go/:eventId  →  302 redirect to the supplier
//
// One endpoint replaces both mobile call sites. It logs the click as a
// UserSignal, increments Event.clickCount — a column that existed
// and that nothing wrote to — resolves the supplier, wraps the URL exactly
// once, and redirects.

import { Router, Response } from 'express';
import prisma from '../config/database';
import { optionalAuthenticate, AuthRequest } from '../middlewares/auth.middleware';
import {
  buildClickOut,
  newClickToken,
  hashIp,
} from '../services/affiliate.service';
import logger from '../utils/logger';
import { recordSignal } from '../services/recommendation.service';

const router = Router();

router.get('/:eventId', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;
  const placement = typeof req.query.from === 'string' ? req.query.from.slice(0, 60) : null;
  const requestedPlatform = typeof req.query.platform === 'string' ? req.query.platform : null;
  const platform = ['app', 'website', 'mobile_web'].includes(requestedPlatform || '')
    ? requestedPlatform
    : null;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        externalUrl: true,
        ticketUrl: true,
        website: true,
        externalSource: true,
        source: true,
      },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const token = newClickToken();
    const resolved = buildClickOut(event, token);

    if (!resolved) {
      logger.warn('go: no outbound URL for event', { eventId });
      return res.status(404).json({
        success: false,
        error: 'No booking link available for this event',
      });
    }

    const userId = req.userId ?? null;

    // Write-behind: never make the user wait on analytics.
    void Promise.allSettled([
      prisma.affiliateClick.create({
        data: {
          token,
          userId,
          eventId: event.id,
          supplier: resolved.supplier,
          platform,
          targetUrl: resolved.targetUrl,
          placement,
          ipHash: hashIp(req.ip),
          userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
        },
      }),
      prisma.event.update({
        where: { id: event.id },
        data: { clickCount: { increment: 1 } },
      }),
      userId
        ? recordSignal(userId, 'click_out', {
            eventId: event.id,
            context: { supplier: resolved.supplier, placement, token },
          })
        : Promise.resolve(null),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) logger.error('go: click logging partially failed', { eventId, failed });
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, resolved.targetUrl);
  } catch (error) {
    logger.error('go: redirect failed', { eventId, error });
    return res.status(500).json({ success: false, error: 'Unable to open booking page' });
  }
});

export default router;
