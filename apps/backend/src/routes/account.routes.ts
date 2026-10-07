import { PlanKey, UserRole } from '@prisma/client';
import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import {
  cancelActiveSubscription,
  createSubscriptionCheckout,
  getAccountPlans,
} from '../services/plans.service';

const router = Router();
router.use(authenticate);

router.get('/plans', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getAccountPlans(req.userId!) });
}));

router.post('/subscribe', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({
    plan: z.nativeEnum(PlanKey),
    returnUrl: z.string().url().refine(value => {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:' || protocol === 'migo:';
    }, 'Return URL must use http, https, or migo'),
    businessName: z.string().trim().min(2).max(120).optional(),
    website: z.string().url().optional(),
  }).parse(req.body || {});
  if (input.plan === PlanKey.SUPPLIER && !input.businessName) {
    const error = Object.assign(new Error('Business name is required for Supplier plans'), {
      statusCode: 400,
      status: 'fail',
      code: 'BUSINESS_NAME_REQUIRED',
      isOperational: true,
    });
    throw error;
  }
  const result = await createSubscriptionCheckout(req.userId!, req.user!.role as UserRole, input);
  res.status(201).json({ success: true, data: result });
}));

router.post('/cancel', asyncHandler(async (req: AuthRequest, res: Response) => {
  const subscription = await cancelActiveSubscription(req.userId!);
  res.json({ success: true, data: { subscription } });
}));

export { router as accountRouter };
