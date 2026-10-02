import { CampaignStatus, Prisma } from '@prisma/client';
import prisma from '../database/prisma';
import { getSupplierPackage, SupplierPackageEffect, supplierPackages } from './supplier-packages';

const effectPackageKeys = (effect: Exclude<SupplierPackageEffect, null>) => supplierPackages
  .filter(supplierPackage => supplierPackage.effect === effect)
  .map(supplierPackage => supplierPackage.key);

async function syncEventCampaignEffect(
  tx: Prisma.TransactionClient,
  eventId: string,
  effect: Exclude<SupplierPackageEffect, null>,
  now: Date,
): Promise<void> {
  const activeCampaigns = await tx.supplierCampaign.findMany({
    where: {
      eventId,
      packageKey: { in: effectPackageKeys(effect) },
      status: CampaignStatus.ACTIVE,
      endsAt: { gt: now },
    },
    select: { endsAt: true },
  });

  if (effect === 'featured') {
    const featuredUntil = activeCampaigns.reduce<Date | null>(
      (latest, campaign) => !latest || campaign.endsAt > latest ? campaign.endsAt : latest,
      null,
    );
    await tx.event.updateMany({
      where: { id: eventId },
      data: {
        isFeatured: featuredUntil !== null,
        featuredUntil,
      },
    });
  } else {
    await tx.event.updateMany({
      where: { id: eventId },
      data: { isSponsored: activeCampaigns.length > 0 },
    });
  }
}

export async function setSupplierCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<unknown> {
  return prisma.$transaction(async tx => {
    const campaign = await tx.supplierCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === status) return campaign;

    const allowedTransitions: Record<CampaignStatus, CampaignStatus[]> = {
      PROPOSED: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
      ACTIVE: [CampaignStatus.ENDED, CampaignStatus.CANCELLED],
      ENDED: [],
      CANCELLED: [],
    };
    if (!allowedTransitions[campaign.status].includes(status)) {
      throw new Error(`Invalid campaign transition: ${campaign.status} to ${status}`);
    }

    const supplierPackage = getSupplierPackage(campaign.packageKey);
    if (status === CampaignStatus.ACTIVE) {
      if (!supplierPackage) throw new Error('Unknown campaign package');
      if (supplierPackage.effect && !campaign.eventId) {
        throw new Error('This package requires an event');
      }
      if (campaign.endsAt <= new Date()) {
        throw new Error('Cannot activate an expired campaign');
      }
    }

    const updated = await tx.supplierCampaign.update({
      where: { id: campaignId },
      data: { status },
    });
    if (supplierPackage?.effect && campaign.eventId) {
      await syncEventCampaignEffect(tx, campaign.eventId, supplierPackage.effect, new Date());
    }
    return updated;
  });
}

export async function expireSupplierCampaigns(now = new Date()): Promise<{ considered: number; expired: number }> {
  const expiredCampaigns = await prisma.supplierCampaign.findMany({
    where: { status: CampaignStatus.ACTIVE, endsAt: { lte: now } },
    select: { id: true, eventId: true, packageKey: true },
  });

  let expired = 0;
  for (const campaign of expiredCampaigns) {
    await prisma.$transaction(async tx => {
      const result = await tx.supplierCampaign.updateMany({
        where: { id: campaign.id, status: CampaignStatus.ACTIVE, endsAt: { lte: now } },
        data: { status: CampaignStatus.ENDED },
      });
      if (!result.count) return;

      const effect = getSupplierPackage(campaign.packageKey)?.effect;
      if (effect && campaign.eventId) {
        await syncEventCampaignEffect(tx, campaign.eventId, effect, now);
      }
      expired += result.count;
    });
  }
  return { considered: expiredCampaigns.length, expired };
}
