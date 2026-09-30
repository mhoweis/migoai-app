// src/routes/admin.routes.ts
import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middlewares/auth.middleware';
import {
  getSpendStatus,
  activateKillSwitch,
  deactivateKillSwitch,
} from '../services/llm-budget.service';
import prisma from '../database/prisma';
import { z } from 'zod';
import { runReminders } from '../services/reminders.service';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', (_req, res) => {
  res.json({ success: true, data: { message: 'Admin endpoint' } });
});

router.post('/reminders/run', async (_req: AuthRequest, res: Response) => {
  const summary = await runReminders();
  res.json({ success: true, data: summary });
});

router.get('/organizers', async (req: AuthRequest, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const organizers = await prisma.user.findMany({
    where: {
      isOrganizer: true,
      ...(query ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
    take: 100,
    select: {
      id: true,
      name: true,
      displayName: true,
      email: true,
      avatar: true,
      avatarUrl: true,
      isVerified: true,
      organizerProfile: { select: { isVerified: true, verifiedAt: true } },
      _count: { select: { organizedEvents: { where: { status: 'ACTIVE' } } } },
    },
  });
  res.json({
    success: true,
    data: organizers.map(organizer => ({
      id: organizer.id,
      name: organizer.displayName || organizer.name || organizer.email || 'Organizer',
      email: organizer.email,
      avatar: organizer.avatar || organizer.avatarUrl || null,
      isVerified: Boolean(organizer.organizerProfile?.isVerified || organizer.isVerified),
      eventsHosted: organizer._count.organizedEvents,
      verifiedAt: organizer.organizerProfile?.verifiedAt || null,
    })),
  });
});

router.put('/organizers/:userId/verify', async (req: AuthRequest, res: Response) => {
  const input = z.object({ verified: z.boolean() }).parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, name: true, displayName: true, email: true },
  });
  if (!user) {
    res.status(404).json({ success: false, error: 'Organizer not found' });
    return;
  }
  const profile = await prisma.organizerProfile.upsert({
    where: { userId: user.id },
    update: { isVerified: input.verified, verifiedAt: input.verified ? new Date() : null },
    create: {
      userId: user.id,
      businessName: user.displayName || user.name || 'Migo organizer',
      businessEmail: user.email || '',
      isVerified: input.verified,
      verifiedAt: input.verified ? new Date() : null,
    },
    select: { userId: true, isVerified: true, verifiedAt: true },
  });
  res.json({ success: true, data: profile });
});

/** Today's LLM spend against the cap, and whether the kill switch is on. */
router.get('/ai/spend', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getSpendStatus() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Manual kill switch — degrades the agent to plain search immediately. */
router.post('/ai/kill', async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual';
  await activateKillSwitch(`manual: ${reason} (by ${req.userId})`);
  res.json({ success: true, data: await getSpendStatus() });
});

/** Clears the kill switch for today. Spend continues from where it was. */
router.post('/ai/resume', async (_req: AuthRequest, res: Response) => {
  await deactivateKillSwitch();
  res.json({ success: true, data: await getSpendStatus() });
});

export { router as adminRouter };
export default router;
