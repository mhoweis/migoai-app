import { Router, Response } from 'express';
import { AuthRequest, optionalAuthenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import prisma from '../config/database';
import { eventService, notEndedWhere } from '../services/events.service';
import { supplierEventWhere } from '../services/supplier-analytics.service';

const router = Router();

router.get('/:slug', optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await prisma.supplier.findFirst({
    where: { slug: req.params.slug, status: 'ACTIVE' },
    include: { members: { select: { id: true } } },
  });
  if (!supplier) {
    res.status(404).json({ success: false, error: 'Supplier not found' });
    return;
  }

  const events = await prisma.event.findMany({
    where: {
      ...supplierEventWhere(supplier, supplier.members.map(member => member.id)),
      status: 'ACTIVE',
      visibility: { in: ['PUBLIC', 'UNLISTED'] },
      AND: [notEndedWhere()],
    },
    orderBy: [{ supplierRank: 'asc' }, { startDate: 'asc' }],
    select: eventService.getEventSelectFields(undefined, true),
  });

  res.json({
    success: true,
    data: {
      supplier: {
        name: supplier.name,
        description: supplier.description,
        logo: supplier.logo,
        banner: supplier.banner,
        website: supplier.website,
        slug: supplier.slug,
        verified: supplier.status === 'ACTIVE',
      },
      events: events.map(event => ({
        ...eventService.formatEventResponse(event),
        id: event.id,
      })),
    },
  });
}));

export { router as suppliersRouter };
