// src/routes/admin.routes.ts
import { Router, Response } from 'express';
import { CampaignStatus, EventStatus, SupplierStatus, UserRole, UserStatus, Prisma } from '@prisma/client';
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
import { updateSupplierSourceCache } from '../services/providers/source-registry';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', (_req, res) => {
  res.json({ success: true, data: { message: 'Admin endpoint' } });
});

router.get('/users', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({
    q: z.string().trim().optional(),
    role: z.nativeEnum(UserRole).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  const where: Prisma.UserWhereInput = {
    ...(input.role ? { role: input.role } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.q ? {
      OR: [
        { name: { contains: input.q, mode: 'insensitive' } },
        { displayName: { contains: input.q, mode: 'insensitive' } },
        { email: { contains: input.q, mode: 'insensitive' } },
      ],
    } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        pausedReason: true,
        pausedAt: true,
        createdAt: true,
        lastLoginAt: true,
        supplier: { select: { id: true, name: true } },
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { plan: true, status: true, currentPeriodEnd: true },
        },
        _count: { select: { organizedEvents: true } },
      },
    }),
  ]);
  res.json({
    success: true,
    data: {
      items: users.map(user => ({
        id: user.id,
        name: user.displayName || user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        pausedReason: user.pausedReason,
        pausedAt: user.pausedAt,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        eventCount: user._count.organizedEvents,
        supplier: user.supplier,
        subscription: user.subscriptions[0] || null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    },
  });
}));

router.patch('/users/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({
    status: z.nativeEnum(UserStatus).optional(),
    reason: z.string().trim().min(1).max(2_000).optional(),
    role: z.nativeEnum(UserRole).optional(),
    supplierId: z.string().min(1).nullable().optional(),
  }).strict().parse(req.body || {});
  if (!Object.keys(input).length) {
    res.status(400).json({ success: false, error: 'At least one user field must be provided' });
    return;
  }
  if (input.status === UserStatus.PAUSED && !input.reason) {
    res.status(400).json({ success: false, error: 'A reason is required to pause an account' });
    return;
  }
  if (input.reason && input.status !== UserStatus.PAUSED) {
    res.status(400).json({ success: false, error: 'A reason is only accepted when pausing an account' });
    return;
  }
  if (
    req.params.id === req.userId
    && (input.status === UserStatus.PAUSED || (input.role && input.role !== UserRole.ADMIN))
  ) {
    res.status(400).json({ success: false, error: 'You cannot pause or demote your own account' });
    return;
  }
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true, status: true, pausedAt: true, pausedReason: true, supplierId: true },
  });
  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true },
    });
    if (!supplier) {
      res.status(404).json({ success: false, error: 'Supplier not found' });
      return;
    }
  }

  const data: Prisma.UserUpdateInput = {};
  const actions: Array<{ action: string; reason?: string; metadata: Prisma.InputJsonObject }> = [];
  if (input.status === UserStatus.PAUSED) {
    data.status = UserStatus.PAUSED;
    data.pausedAt = target.status === UserStatus.PAUSED && target.pausedAt ? target.pausedAt : new Date();
    data.pausedReason = input.reason;
    if (target.status !== UserStatus.PAUSED) {
      actions.push({
        action: 'USER_PAUSED',
        reason: input.reason,
        metadata: { from: target.status, to: UserStatus.PAUSED },
      });
    } else if (input.reason !== target.pausedReason) {
      actions.push({
        action: 'USER_PAUSE_REASON_UPDATED',
        reason: input.reason,
        metadata: { from: target.pausedReason || '', to: input.reason },
      });
    }
  } else if (input.status === UserStatus.ACTIVE) {
    data.status = UserStatus.ACTIVE;
    data.pausedAt = null;
    data.pausedReason = null;
    if (target.status === UserStatus.PAUSED) {
      actions.push({
        action: 'USER_REACTIVATED',
        metadata: { from: UserStatus.PAUSED, to: UserStatus.ACTIVE },
      });
    }
  }

  if (input.role && input.role !== target.role) {
    data.role = input.role;
    data.isAdmin = input.role === UserRole.ADMIN;
    data.isOrganizer = input.role !== UserRole.USER;
    actions.push({
      action: 'USER_ROLE_CHANGED',
      metadata: { from: target.role, to: input.role },
    });
  }
  if (input.supplierId !== undefined && input.supplierId !== target.supplierId) {
    data.supplier = input.supplierId
      ? { connect: { id: input.supplierId } }
      : { disconnect: true };
    actions.push({
      action: input.supplierId ? 'USER_SUPPLIER_LINKED' : 'USER_SUPPLIER_UNLINKED',
      metadata: { from: target.supplierId || '', to: input.supplierId || '' },
    });
  }

  const user = await prisma.$transaction(async transaction => {
    if (Object.keys(data).length) {
      await transaction.user.update({ where: { id: target.id }, data });
    }
    if (input.status === UserStatus.PAUSED) {
      await transaction.refreshToken.updateMany({
        where: { userId: target.id, revoked: false },
        data: { revoked: true },
      });
    }
    if (actions.length) {
      await transaction.adminAction.createMany({
        data: actions.map(action => ({
          adminId: req.userId!,
          action: action.action,
          targetType: 'user',
          targetId: target.id,
          reason: action.reason,
          metadata: action.metadata,
        })),
      });
    }
    return transaction.user.findUnique({
      where: { id: target.id },
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        pausedAt: true,
        pausedReason: true,
        supplierId: true,
      },
    });
  });
  res.json({ success: true, data: user });
}));

router.get('/events', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({
    q: z.string().trim().optional(),
    status: z.nativeEnum(EventStatus).optional(),
    source: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  const where: Prisma.EventWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.source ? { externalSource: { contains: input.source, mode: 'insensitive' } } : {}),
    ...(input.q ? {
      OR: [
        { title: { contains: input.q, mode: 'insensitive' } },
        { externalSource: { contains: input.q, mode: 'insensitive' } },
        { organizer: { name: { contains: input.q, mode: 'insensitive' } } },
        { organizer: { email: { contains: input.q, mode: 'insensitive' } } },
      ],
    } : {}),
  };
  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: { startDate: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        title: true,
        startDate: true,
        status: true,
        source: true,
        externalSource: true,
        bannedAt: true,
        bannedReason: true,
        organizer: { select: { id: true, name: true, displayName: true } },
      },
    }),
  ]);
  res.json({
    success: true,
    data: {
      items: events.map(event => ({
        ...event,
        source: event.externalSource || event.source,
        organizer: {
          ...event.organizer,
          name: event.organizer.displayName || event.organizer.name,
        },
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    },
  });
}));

router.post('/events/:id/ban', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({ reason: z.string().trim().min(1).max(2_000) }).strict().parse(req.body || {});
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, status: true },
  });
  if (!event) {
    res.status(404).json({ success: false, error: 'Event not found' });
    return;
  }
  const updated = await prisma.$transaction(async transaction => {
    const banned = await transaction.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.BANNED,
        bannedAt: new Date(),
        bannedReason: input.reason,
        bannedById: req.userId,
      },
    });
    await transaction.adminAction.create({
      data: {
        adminId: req.userId!,
        action: 'EVENT_BANNED',
        targetType: 'event',
        targetId: event.id,
        reason: input.reason,
        metadata: { title: event.title, from: event.status, to: EventStatus.BANNED },
      },
    });
    return banned;
  });
  res.json({ success: true, data: updated });
}));

router.post('/events/:id/unban', asyncHandler(async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, status: true, bannedReason: true },
  });
  if (!event) {
    res.status(404).json({ success: false, error: 'Event not found' });
    return;
  }
  const updated = await prisma.$transaction(async transaction => {
    const unbanned = await transaction.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.ACTIVE,
        bannedAt: null,
        bannedReason: null,
        bannedById: null,
      },
    });
    await transaction.adminAction.create({
      data: {
        adminId: req.userId!,
        action: 'EVENT_UNBANNED',
        targetType: 'event',
        targetId: event.id,
        reason: event.bannedReason,
        metadata: { title: event.title, from: event.status, to: EventStatus.ACTIVE },
      },
    });
    return unbanned;
  });
  res.json({ success: true, data: updated });
}));

router.get('/actions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
  const actions = await prisma.adminAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ success: true, data: actions });
}));

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
    updateSupplierSourceCache(supplier);
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
