import { Prisma, UserRole } from '@prisma/client';
import config from '../config/env';
import prisma from '../database/prisma';
import logger from '../utils/logger';
import { eventbriteProvider } from './providers/eventbrite.provider';
import { mockProvider } from './providers/mock.provider';
import { ticketmasterProvider } from './providers/ticketmaster.provider';
import { expoCityProvider } from './providers/expo-city.provider';
import { dwtcProvider } from './providers/dwtc.provider';
import { dubaiExhibitionCentreProvider } from './providers/dubai-exhibition-centre.provider';
import { visitDubaiProvider } from './providers/visit-dubai.provider';
import { visitAbuDhabiProvider } from './providers/visit-abu-dhabi.provider';
import { lumaProvider } from './providers/luma.provider';
import { abuDhabiFestivalProvider } from './providers/abu-dhabi-festival.provider';
import { visitSharjahProvider } from './providers/visit-sharjah.provider';
import { expoCentreSharjahProvider } from './providers/expo-centre-sharjah.provider';
import { uaeGovProvider } from './providers/uae-gov.provider';
import { yasIslandProvider } from './providers/yas-island.provider';
import { alserkalProvider } from './providers/alserkal.provider';
import { EventProvider, NormalizedEvent } from './providers/types';

export interface ProviderSyncSummary {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface SyncSummary {
  perProvider: Record<string, ProviderSyncSummary>;
  durationMs: number;
  skipped?: boolean;
}

let running = false;

export class EventSyncService {
  readonly providers: EventProvider[] = [
    ticketmasterProvider,
    eventbriteProvider,
    expoCityProvider,
    dwtcProvider,
    dubaiExhibitionCentreProvider,
    visitDubaiProvider,
    visitAbuDhabiProvider,
    lumaProvider,
    abuDhabiFestivalProvider,
    visitSharjahProvider,
    expoCentreSharjahProvider,
    uaeGovProvider,
    yasIslandProvider,
    alserkalProvider,
    mockProvider,
  ];

  async syncAll(cities: string[] = config.SYNC_CITIES): Promise<SyncSummary> {
    if (running) {
      return { skipped: true, perProvider: {}, durationMs: 0 };
    }

    running = true;
    const startedAt = Date.now();
    const perProvider: Record<string, ProviderSyncSummary> = {};
    const syncedSources = new Set<string>();

    try {
      for (const provider of this.providers) {
        if (!provider.isConfigured()) {
          continue;
        }
        const summary: ProviderSyncSummary = {
          fetched: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
        };
        perProvider[provider.name] = summary;
        syncedSources.add(provider.name);

        for (const city of cities) {
          try {
            const latest = await prisma.event.findFirst({
              where: { externalSource: provider.name },
              orderBy: { lastSyncedAt: 'desc' },
              select: { lastSyncedAt: true },
            });
            const events = await provider.fetchEvents({
              city,
              updatedSince: latest?.lastSyncedAt || undefined,
            });
            summary.fetched += events.length;
            await this.upsertEvents(events, summary);
          } catch (error: any) {
            summary.errors += 1;
            logger.error('Event provider sync failed', {
              provider: provider.name,
              city,
              error: error.message,
            });
          }
        }
      }

      await this.markExpiredEvents(syncedSources);
      return { perProvider, durationMs: Date.now() - startedAt };
    } finally {
      running = false;
    }
  }

  private async upsertEvents(
    events: NormalizedEvent[],
    summary: ProviderSyncSummary,
  ): Promise<void> {
    const organizerId = await this.getSystemOrganizerId();
    const now = new Date();

    for (const normalized of events) {
      try {
        const existing = await prisma.event.findFirst({
          where: {
            externalId: normalized.externalId,
            externalSource: normalized.externalSource,
          },
        });

        if (existing) {
          await prisma.event.update({
            where: { id: existing.id },
            data: this.eventUpdateData(normalized, now),
          });
          summary.updated += 1;
          continue;
        }

        const duplicate = await prisma.event.findFirst({
          where: {
            title: { equals: normalized.title, mode: 'insensitive' },
            city: normalized.city,
            startDate: {
              gte: new Date(normalized.startDate.getTime() - 60 * 60 * 1000),
              lte: new Date(normalized.startDate.getTime() + 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });
        if (duplicate) {
          summary.skipped += 1;
          logger.info('dedupe', {
            provider: normalized.externalSource,
            externalId: normalized.externalId,
            duplicateEventId: duplicate.id,
          });
          continue;
        }

        await prisma.event.create({
          data: this.eventCreateData(normalized, now, organizerId),
        });
        summary.created += 1;
      } catch (error: any) {
        summary.errors += 1;
        logger.error('Event upsert failed', {
          provider: normalized.externalSource,
          externalId: normalized.externalId,
          error: error.message,
        });
      }
    }
  }

  private async getSystemOrganizerId(): Promise<string> {
    const systemUser = await prisma.user.findUnique({
      where: { email: 'system@migo.app' },
      select: { id: true },
    });
    if (systemUser) {
      return systemUser.id;
    }

    const created = await prisma.user.create({
      data: {
        email: 'system@migo.app',
        name: 'MIGO System',
        role: UserRole.ADMIN,
        isAdmin: true,
        isOrganizer: true,
      },
      select: { id: true },
    });
    return created.id;
  }

  private eventCreateData(
    normalized: NormalizedEvent,
    now: Date,
    organizerId: string,
  ): Prisma.EventUncheckedCreateInput {
    const isFree = normalized.isFree === true;
    return {
      title: normalized.title,
      description: normalized.description || normalized.title,
      category: normalized.category || 'Other',
      tags: normalized.tags || [],
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      venueName: normalized.venueName,
      address: normalized.address,
      city: normalized.city,
      country: normalized.country,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      priceFrom: normalized.priceFrom,
      priceTo: normalized.priceTo,
      currency: normalized.currency || 'AED',
      isFree,
      coverImage: normalized.coverImage,
      images: normalized.coverImage ? [normalized.coverImage] : [],
      externalId: normalized.externalId,
      externalSource: normalized.externalSource,
      externalUrl: normalized.externalUrl,
      source: normalized.externalSource,
      bookingType: isFree ? 'RSVP' : 'PAID',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      slug: this.slugify(normalized.title, normalized.externalId),
      lastSyncedAt: now,
      organizerId,
      capacity: 0,
      ticketsSold: 0,
      ticketsAvailable: null,
    };
  }

  private eventUpdateData(normalized: NormalizedEvent, now: Date): Prisma.EventUpdateInput {
    const isFree = normalized.isFree === true;
    return {
      title: normalized.title,
      description: normalized.description || normalized.title,
      category: normalized.category || 'Other',
      tags: normalized.tags || [],
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      venueName: normalized.venueName,
      address: normalized.address,
      city: normalized.city,
      country: normalized.country,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      priceFrom: normalized.priceFrom,
      priceTo: normalized.priceTo,
      currency: normalized.currency || 'AED',
      isFree,
      coverImage: normalized.coverImage,
      images: normalized.coverImage ? [normalized.coverImage] : [],
      externalUrl: normalized.externalUrl,
      source: normalized.externalSource,
      bookingType: isFree ? 'RSVP' : 'PAID',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      lastSyncedAt: now,
    };
  }

  private async markExpiredEvents(sources: Set<string>): Promise<void> {
    if (!sources.size) {
      return;
    }
    logger.debug('Expired provider events were not reclassified because EventStatus has no inactive value', {
      sources: [...sources],
    });
  }

  private slugify(title: string, externalId: string): string {
    const titlePart = title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'event';
    const idPart = externalId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase() || 'external';
    return `${titlePart}-${idPart}`.slice(0, 255);
  }
}

export const eventSyncService = new EventSyncService();
export default eventSyncService;
