// src/routes/admin.routes.ts
import { Router, Response } from 'express';
import { CampaignStatus, SupplierStatus } from '@prisma/client';
import { authenticate, requireAdmin, AuthRequest } from '../middlewares/auth.middleware';
import {
  getSpendStatus,
  activateKillSwitch,
  deactivateKillSwitch,
} from '../services/llm-budget.service';
import prisma from '../database/prisma';
import { z } from 'zod';
import { runReminders } from '../services/reminders.service';
import { asyncHandler } from '../middlewares/error.middleware';
import {
  createSupplierCampaign,
  getSearchInsights,
  getSupplierCampaigns,
  getSupplierDetail,
  getSupplierList,
  getSupplierOverview,
  parseSupplierDateRange,
  searchInsightsCsv,
  supplierPackages,
  supplierReportCsv,
  updateSupplier,
} from '../services/supplier-analytics.service';
import { setSupplierCampaignStatus } from '../services/supplier-campaigns.service';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', (_req, res) => {
  res.json({ success: true, data: { message: 'Admin endpoint' } });
});

router.post('/reminders/run', async (_req: AuthRequest, res: Response) => {
  const summary = await runReminders();
  res.json({ success: true, data: summary });
});

const dateRangeFromQuery = (req: AuthRequest) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return parseSupplierDateRange({ from, to });
};

router.get('/overview', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getSupplierOverview(dateRangeFromQuery(req)) });
}));

router.get('/suppliers', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getSupplierList(dateRangeFromQuery(req)) });
}));

router.get('/suppliers/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const detail = await getSupplierDetail(req.params.id, dateRangeFromQuery(req));
  if (!detail) {
    res.status(404).json({ success: false, error: 'Supplier not found' });
    return;
  }
  res.json({ success: true, data: detail });
}));

router.get('/suppliers/:id/report.csv', asyncHandler(async (req: AuthRequest, res: Response) => {
  const range = dateRangeFromQuery(req);
  const detail = await getSupplierDetail(req.params.id, range);
  if (!detail) {
    res.status(404).json({ success: false, error: 'Supplier not found' });
    return;
  }
  const from = range.from.toISOString().slice(0, 10);
  const to = range.to.toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="migo-${detail.sourceKey}-${from}-${to}.csv"`);
  res.send(supplierReportCsv(detail));
}));

router.get('/suppliers/:id/campaigns', asyncHandler(async (req: AuthRequest, res: Response) => {
  const campaigns = await getSupplierCampaigns(req.params.id);
  if (!campaigns) {
    res.status(404).json({ success: false, error: 'Supplier not found' });
    return;
  }
  res.json({ success: true, data: campaigns });
}));

const supplierUpdateSchema = z.object({
  contactName: z.string().trim().max(255).nullable().optional(),
  contactEmail: z.string().trim().email().max(255).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  website: z.string().trim().url().max(2048).nullable().optional(),
  status: z.nativeEnum(SupplierStatus).optional(),
  notes: z.string().max(10000).nullable().optional(),
}).strict();

router.put('/suppliers/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = supplierUpdateSchema.parse(req.body);
  try {
    const supplier = await updateSupplier(req.params.id, input);
    res.json({ success: true, data: supplier });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ success: false, error: 'Supplier not found' });
      return;
    }
    throw error;
  }
}));

router.get('/packages', (_req, res) => {
  res.json({ success: true, data: supplierPackages });
});

const supplierCampaignSchema = z.object({
  packageKey: z.string().trim().min(1).max(50),
  eventId: z.string().trim().min(1).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  priceAed: z.number().positive().max(10000000).optional(),
  notes: z.string().max(10000).nullable().optional(),
}).strict();

router.post('/suppliers/:id/campaigns', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = supplierCampaignSchema.parse(req.body);
  try {
    const campaign = await createSupplierCampaign({
      supplierId: req.params.id,
      ...input,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    if (error instanceof Error && error.message === 'Supplier not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
}));

router.patch('/campaigns/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({ status: z.nativeEnum(CampaignStatus) }).strict().parse(req.body);
  try {
    const campaign = await setSupplierCampaignStatus(req.params.id, input.status);
    res.json({ success: true, data: campaign });
  } catch (error) {
    if (error instanceof Error && error.message === 'Campaign not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
}));

router.get('/insights/searches.csv', asyncHandler(async (req: AuthRequest, res: Response) => {
  const insights = await getSearchInsights(dateRangeFromQuery(req));
  const range = insights.range;
  const from = range.from.slice(0, 10);
  const to = range.to.slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="migo-search-insights-${from}-${to}.csv"`);
  res.send(searchInsightsCsv(insights));
}));

router.get('/insights/searches', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getSearchInsights(dateRangeFromQuery(req)) });
}));

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
