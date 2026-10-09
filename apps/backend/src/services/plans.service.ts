import { PlanKey, SubscriptionStatus, UserRole } from '@prisma/client';
import crypto from 'crypto';
import config from '../config/env';
import prisma from '../database/prisma';
import { getPaymentProvider } from './payments';
import { updateSupplierSourceCache } from './providers/source-registry';

export const PLANS = {
  HOST: {
    priceAed: config.HOST_PLAN_PRICE_AED,
    periodDays: 30,
    role: UserRole.ORGANIZER,
  },
  SUPPLIER: {
    priceAed: config.SUPPLIER_PLAN_PRICE_AED,
    periodDays: 30,
    role: UserRole.SUPPLIER,
  },
} satisfies Record<PlanKey, { priceAed: number; periodDays: number; role: UserRole }>;

const serviceError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    status: string;
    code: string;
    isOperational: boolean;
  };
  error.statusCode = statusCode;
  error.status = 'fail';
  error.code = code;
  error.isOperational = true;
  return error;
};

export const withCheckoutResult = (returnUrl: string | null | undefined, result: 'success' | 'cancel'): string => {
  if (!returnUrl) return '/';
  try {
    const destination = new URL(returnUrl);
    destination.searchParams.set('checkout', result);
    return destination.toString();
  } catch {
    return '/';
  }
};

export async function getAccountPlans(userId: string) {
  const now = new Date();
  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        supplier: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED] },
        OR: [
          { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
          { currentPeriodEnd: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        plan: true,
        status: true,
        amountAed: true,
        currentPeriodEnd: true,
        cancelledAt: true,
      },
    }),
  ]);

  if (!user) throw serviceError('User not found', 404, 'USER_NOT_FOUND');

  return {
    plans: (Object.entries(PLANS) as Array<[PlanKey, typeof PLANS[PlanKey]]>).map(([key, plan]) => ({
      key,
      priceAed: plan.priceAed,
      currency: 'AED',
      periodDays: plan.periodDays,
    })),
    state: {
      role: user.role,
      status: user.status,
      supplier: user.supplier,
      subscription: subscription
        ? { ...subscription, amountAed: Number(subscription.amountAed) }
        : null,
    },
  };
}

export async function createSubscriptionCheckout(
  userId: string,
  role: UserRole,
  input: {
    plan: PlanKey;
    returnUrl: string;
    businessName?: string;
    website?: string;
  },
) {
  const plan = PLANS[input.plan];
  if (input.plan === PlanKey.SUPPLIER && !input.businessName) {
    throw serviceError('Business name is required for Supplier plans', 400, 'BUSINESS_NAME_REQUIRED');
  }

  if (role !== UserRole.ADMIN) {
    const active = await prisma.subscription.findFirst({
      where: {
        userId,
        plan: input.plan,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED] },
        currentPeriodEnd: { gt: new Date() },
      },
      select: { id: true },
    });
    if (active) throw serviceError('This plan is already active', 409, 'PLAN_ALREADY_ACTIVE');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw serviceError('User not found', 404, 'USER_NOT_FOUND');

  const provider = getPaymentProvider();
  if (!provider.isConfigured()) {
    throw serviceError('Payments are not available yet', 503, 'PAYMENTS_UNAVAILABLE');
  }

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      plan: input.plan,
      amountAed: plan.priceAed,
      returnUrl: input.returnUrl,
      businessName: input.businessName,
      website: input.website,
    },
  });

  try {
    const checkout = await provider.createCheckout({
      kind: 'subscription',
      subscriptionId: subscription.id,
      userId,
      title: `Migo ${input.plan === PlanKey.HOST ? 'Host' : 'Supplier'} plan`,
      amountMinor: Math.round(plan.priceAed * 100),
      currency: 'AED',
      quantity: 1,
      customerEmail: user.email || undefined,
      successUrl: withCheckoutResult(input.returnUrl, 'success'),
      cancelUrl: withCheckoutResult(input.returnUrl, 'cancel'),
    });
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { provider: checkout.provider, reference: checkout.reference },
    });
    return { subscription: updated, checkoutUrl: checkout.url };
  } catch (error) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    });
    throw error;
  }
}

export async function activateSubscription(subscriptionId: string) {
  const result = await prisma.$transaction(async transaction => {
    const subscription = await transaction.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!subscription) return null;
    if (subscription.status === SubscriptionStatus.ACTIVE) return subscription;
    if (subscription.status !== SubscriptionStatus.PENDING) return subscription;

    const now = new Date();
    const existing = await transaction.subscription.findFirst({
      where: {
        userId: subscription.userId,
        plan: subscription.plan,
        id: { not: subscription.id },
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED] },
        currentPeriodEnd: { gt: now },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { currentPeriodEnd: true },
    });
    const periodStart = existing?.currentPeriodEnd && existing.currentPeriodEnd > now
      ? existing.currentPeriodEnd
      : now;
    const currentPeriodEnd = new Date(periodStart.getTime() + PLANS[subscription.plan].periodDays * 86_400_000);
    const claimed = await transaction.subscription.updateMany({
      where: { id: subscription.id, status: SubscriptionStatus.PENDING },
      data: { status: SubscriptionStatus.ACTIVE, currentPeriodEnd },
    });
    if (!claimed.count) {
      return transaction.subscription.findUnique({ where: { id: subscription.id } });
    }

    let supplierId = subscription.user.supplierId;
    if (subscription.plan === PlanKey.SUPPLIER && !supplierId) {
      const baseSlug = (subscription.businessName || subscription.user.name || 'supplier')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'supplier';
      const suffix = crypto.randomBytes(3).toString('hex');
      const slug = `${baseSlug}-${suffix}`;
      const supplier = await transaction.supplier.create({
        data: {
          sourceKey: `supplier-${slug}`,
          slug,
          name: subscription.businessName || subscription.user.name || 'Supplier',
          website: subscription.website,
          status: 'ACTIVE',
          contactName: subscription.user.name,
          contactEmail: subscription.user.email,
        },
      });
      supplierId = supplier.id;
    }

    if (subscription.user.role !== UserRole.ADMIN) {
      await transaction.user.update({
        where: { id: subscription.userId },
        data: {
          role: PLANS[subscription.plan].role,
          isOrganizer: true,
          ...(supplierId ? { supplierId } : {}),
        },
      });
    } else if (supplierId && !subscription.user.supplierId) {
      await transaction.user.update({
        where: { id: subscription.userId },
        data: { supplierId },
      });
    }

    return transaction.subscription.findUnique({ where: { id: subscription.id } });
  });

  if (result?.plan === PlanKey.SUPPLIER) {
    const supplier = await prisma.supplier.findFirst({
      where: { members: { some: { id: result.userId } } },
      select: { sourceKey: true, name: true, website: true, slug: true },
    });
    if (supplier) updateSupplierSourceCache(supplier);
  }
  return result;
}

export async function cancelActiveSubscription(userId: string) {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      OR: [
        { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
        { currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!subscription) return null;
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: SubscriptionStatus.CANCELLED, cancelledAt: now },
  });
}

export async function expireSubscriptions() {
  const now = new Date();
  const expired = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED] },
      currentPeriodEnd: { lte: now },
    },
    select: { id: true, userId: true },
  });
  if (!expired.length) return { expired: 0, downgraded: 0 };

  await prisma.subscription.updateMany({
    where: { id: { in: expired.map(subscription => subscription.id) } },
    data: { status: SubscriptionStatus.EXPIRED },
  });

  const userIds = [...new Set(expired.map(subscription => subscription.userId))];
  let downgraded = 0;
  for (const userId of userIds) {
    const remaining = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED] },
        OR: [
          { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
          { currentPeriodEnd: { gt: now } },
        ],
      },
      select: { id: true },
    });
    if (!remaining) {
      const result = await prisma.user.updateMany({
        where: { id: userId, role: { not: UserRole.ADMIN } },
        data: { role: UserRole.USER, isOrganizer: false },
      });
      downgraded += result.count;
    }
  }

  return { expired: expired.length, downgraded };
}
