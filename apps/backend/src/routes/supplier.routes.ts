import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authenticate, requireSupplier } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import prisma from '../config/database';
import config from '../config/env';
import eventSyncService from '../services/event-sync.service';
import { eventService, notEndedWhere } from '../services/events.service';
import {
  createSupplierCampaign,
  getSupplierDetail,
  parseSupplierDateRange,
  supplierEventWhere,
  supplierPackages,
  supplierReportCsv,
  updateSupplier,
} from '../services/supplier-analytics.service';
import { updateSupplierSourceCache } from '../services/providers/source-registry';
import { validateSupplierFeedUrl } from '../services/providers/supplier-feed.provider';

const router = Router();
router.use(authenticate, requireSupplier);

const missingSupplier = () => Object.assign(new Error('Supplier profile not found'), {
  statusCode: 404,
  status: 'fail',
  code: 'NO_SUPPLIER',
  isOperational: true,
});

async function resolveSupplier(req: AuthRequest) {
  const isAdmin = req.user?.role === 'ADMIN';
  const requestedId = isAdmin && typeof req.query.supplierId === 'string'
    ? req.query.supplierId
    : undefined;
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { supplierId: true },
  });
  const supplierId = requestedId || user?.supplierId;
  if (!supplierId) throw missingSupplier();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { members: { select: { id: true } } },
  });
  if (!supplier) throw missingSupplier();
  return supplier;
}

function reportRange(days: number) {
  const now = new Date();
  const from = new Date(now.getTime() - (days - 1) * 86_400_000);
  return parseSupplierDateRange({ from: from.toISOString(), to: now.toISOString() }, now);
}

router.get('/me', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  res.json({
    success: true,
    data: {
      id: supplier.id,
      sourceKey: supplier.sourceKey,
      slug: supplier.slug,
      name: supplier.name,
      description: supplier.description,
      logo: supplier.logo,
      banner: supplier.banner,
      website: supplier.website,
      contactName: supplier.contactName,
      contactEmail: supplier.contactEmail,
      contactPhone: supplier.contactPhone,
      feedUrl: supplier.feedUrl,
      feedLastSyncAt: supplier.feedLastSyncAt,
      feedLastStatus: supplier.feedLastStatus,
      status: supplier.status,
    },
  });
}));

router.put('/me', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const input = z.object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z.string().max(20_000).nullable().optional(),
    logo: z.string().max(5_000).nullable().optional(),
    banner: z.string().max(5_000).nullable().optional(),
    website: z.string().url().nullable().optional(),
    contactName: z.string().max(255).nullable().optional(),
    contactEmail: z.string().email().nullable().optional(),
    contactPhone: z.string().max(30).nullable().optional(),
  }).strict().parse(req.body || {});
  const updated = await updateSupplier(supplier.id, input);
  updateSupplierSourceCache(updated);
  res.json({ success: true, data: updated });
}));

router.put('/me/feed', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const input = z.object({ feedUrl: z.string().trim().nullable() }).strict().parse(req.body || {});
  let feedUrl: string | null = null;
  if (input.feedUrl) {
    validateSupplierFeedUrl(input.feedUrl);
    feedUrl = input.feedUrl;
  }
  const updated = await prisma.supplier.update({
    where: { id: supplier.id },
    data: { feedUrl, feedLastStatus: feedUrl ? 'Configured; not yet synced' : 'Feed disabled' },
  });
  res.json({ success: true, data: updated });
}));

router.get('/me/feed/format', (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      contentType: 'application/json',
      root: 'An array of event objects or an object containing an events array.',
      maxEvents: 500,
      maxBytes: 5 * 1024 * 1024,
      timeoutSeconds: 15,
      example: {
        events: [{
          id: 'event-123',
          title: 'Community Night',
          startDate: '2026-12-12T18:00:00+04:00',
          endDate: '2026-12-12T22:00:00+04:00',
          description: 'An evening event.',
          venueName: 'Dubai Marina',
          address: 'Dubai, UAE',
          city: 'Dubai',
          latitude: 25.08,
          longitude: 55.14,
          coverImage: 'https://example.com/event.jpg',
          priceFrom: 0,
          priceTo: 0,
          currency: 'AED',
          isFree: true,
          category: 'Community',
          url: 'https://example.com/events/event-123',
          tags: ['community', 'music'],
        }],
      },
      fields: {
        required: ['id', 'title', 'startDate'],
        optional: [
          'endDate', 'description', 'venueName', 'address', 'city', 'latitude',
          'longitude', 'coverImage', 'priceFrom', 'priceTo', 'currency', 'isFree',
          'category', 'url', 'tags',
        ],
        defaultCity: 'Dubai',
        defaultCurrency: 'AED',
      },
      security: {
        httpsRequired: !config.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS,
        privateHostsAllowedInDevelopment: config.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS,
      },
    },
  });
});

router.post('/me/feed/sync', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const result = await eventSyncService.syncSupplierFeed(supplier.id);
  res.json({
    success: true,
    data: {
      fetched: result.fetched,
      upserted: result.upserted,
      errors: result.errors,
    },
  });
}));

router.get('/me/events', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const where = {
    ...supplierEventWhere(supplier, supplier.members.map(member => member.id)),
    AND: [notEndedWhere()],
  };
  const events = await prisma.event.findMany({
    where,
    orderBy: [{ supplierRank: 'asc' }, { startDate: 'asc' }],
    select: eventService.getEventSelectFields(undefined, true),
  });
  res.json({
    success: true,
    data: {
      events: events.map(event => ({
        ...eventService.formatEventResponse(event),
        id: event.id,
        supplierRank: event.supplierRank,
        bannedAt: event.bannedAt,
        bannedReason: event.bannedReason,
      })),
    },
  });
}));

router.put('/me/events/order', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const { eventIds } = z.object({
    eventIds: z.array(z.string().min(1)).max(500),
  }).strict().parse(req.body || {});
  const uniqueIds = [...new Set(eventIds)];
  if (uniqueIds.length !== eventIds.length) {
    res.status(400).json({ success: false, error: 'Event IDs must be unique' });
    return;
  }
  const supplierEvents = supplierEventWhere(supplier, supplier.members.map(member => member.id));
  const owned = await prisma.event.findMany({
    where: { id: { in: uniqueIds }, ...supplierEvents },
    select: { id: true },
  });
  if (owned.length !== uniqueIds.length) {
    res.status(400).json({ success: false, error: 'All event IDs must belong to this supplier' });
    return;
  }
  await prisma.$transaction([
    prisma.event.updateMany({
      where: { ...supplierEvents, id: { notIn: uniqueIds } },
      data: { supplierRank: null },
    }),
    ...uniqueIds.map((eventId, supplierRank) => prisma.event.updateMany({
      where: { id: eventId, ...supplierEvents },
      data: { supplierRank },
    })),
  ]);
  res.json({ success: true, data: { eventIds: uniqueIds } });
}));

router.get('/me/report.csv', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const days = z.coerce.number().int().refine(value => [7, 30, 90].includes(value))
    .default(30).parse(req.query.days);
  const detail = await getSupplierDetail(supplier.id, reportRange(days));
  if (!detail) throw missingSupplier();
  res.type('text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="supplier-report-${supplier.slug || supplier.id}.csv"`);
  res.send(supplierReportCsv(detail));
}));

router.get('/me/report', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const days = z.coerce.number().int().refine(value => [7, 30, 90].includes(value))
    .default(30).parse(req.query.days);
  const detail = await getSupplierDetail(supplier.id, reportRange(days));
  if (!detail) throw missingSupplier();
  res.json({ success: true, data: detail });
}));

router.get('/me/packages', (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: supplierPackages });
});

router.post('/me/campaigns', asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await resolveSupplier(req);
  const input = z.object({
    packageKey: z.string().min(1).max(100),
    eventId: z.string().min(1).optional(),
    startsAt: z.string().datetime({ offset: true }),
  }).strict().parse(req.body || {});
  const supplierPackage = supplierPackages.find(item => item.key === input.packageKey);
  if (!supplierPackage) {
    res.status(400).json({ success: false, error: 'Unknown campaign package' });
    return;
  }
  const durationDays = supplierPackage.unit === 'year'
    ? 365
    : supplierPackage.unit === 'month'
      ? 30
      : supplierPackage.unit === 'week'
        ? 7
        : 7;
  const startsAt = new Date(input.startsAt);
  const campaign = await createSupplierCampaign({
    supplierId: supplier.id,
    packageKey: input.packageKey,
    eventId: input.eventId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationDays * 86_400_000),
  });
  res.status(201).json({ success: true, data: campaign });
}));

export { router as supplierRouter };
