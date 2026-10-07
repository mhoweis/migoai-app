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
import { myDubaiCommunitiesProvider } from './providers/my-dubai-communities.provider';
import { difcProvider } from './providers/difc.provider';
import { mercedesBenzBrandCenterProvider } from './providers/mercedes-benz-brand-center.provider';
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
import { SupplierFeedProvider } from './providers/supplier-feed.provider';
import { geocodeVenue } from './places/geocode.service';
import {
  providerSuppliers,
  refreshSupplierSourceCache,
  updateSupplierSourceCache,
} from './providers/source-registry';

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
  geocoded?: number;
  unresolved?: number;
}

let running = false;
const supplierFeedLocks = new Set<string>();

export class EventSyncService {
  readonly providers: EventProvider[] = [
    ticketmasterProvider,
    eventbriteProvider,
    expoCityProvider,
    dwtcProvider,
    dubaiExhibitionCentreProvider,
    myDubaiCommunitiesProvider,
    difcProvider,
    mercedesBenzBrandCenterProvider,
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
      await refreshSupplierSourceCache();
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

        const supplierSpec = providerSuppliers[provider.name];
        if (supplierSpec) {
          try {
            const existing = await prisma.supplier.findUnique({ where: { sourceKey: provider.name } });
            const supplier = !existing
              ? await prisma.supplier.create({
                data: { sourceKey: provider.name, ...supplierSpec, status: 'ACTIVE' },
              })
              : existing.status === 'PROSPECT'
                ? await prisma.supplier.update({
                  where: { id: existing.id },
                  data: { ...supplierSpec, status: 'ACTIVE' },
                })
                : existing;
            updateSupplierSourceCache(supplier);
          } catch (error: any) {
            summary.errors += 1;
            logger.error('Provider supplier setup failed', {
              provider: provider.name,
              error: error.message,
            });
            continue;
          }
        }

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

      const suppliers = await prisma.supplier.findMany({
        where: { status: 'ACTIVE', feedUrl: { not: null } },
        select: { id: true, sourceKey: true, feedUrl: true },
      });
      for (const supplier of suppliers) {
        const result = await this.syncSupplierFeed(supplier.id);
        const summary = perProvider[supplier.sourceKey] || {
          fetched: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
        };
        summary.fetched += result.fetched;
        summary.created += result.created;
        summary.updated += result.updated;
        summary.skipped += result.skipped;
        summary.errors += result.errors;
        perProvider[supplier.sourceKey] = summary;
        syncedSources.add(supplier.sourceKey);
      }

      const coordinates = await this.backfillCoordinates(120);
      await this.markExpiredEvents(syncedSources);
      return {
        perProvider,
        durationMs: Date.now() - startedAt,
        geocoded: coordinates.geocoded,
        unresolved: coordinates.unresolved,
      };
    } finally {
      running = false;
    }
  }

  async backfillCoordinates(limit = 120): Promise<{ geocoded: number; unresolved: number }> {
    const events = await prisma.event.findMany({
      where: {
        latitude: null,
        status: 'ACTIVE',
        startDate: { gte: new Date() },
        OR: [{ venueName: { not: null } }, { address: { not: null } }],
      },
      take: limit,
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        venueName: true,
        address: true,
        city: true,
      },
    });
    let geocoded = 0;
    let unresolved = 0;

    for (const event of events) {
      const coordinates = await geocodeVenue(event.venueName, event.address, event.city);
      if (!coordinates) {
        unresolved += 1;
        continue;
      }
      await prisma.event.update({
        where: { id: event.id },
        data: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      });
      geocoded += 1;
    }

    logger.info('Event coordinate backfill complete', {
      requested: events.length,
      geocoded,
      unresolved,
    });
    return { geocoded, unresolved };
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
            data: this.eventUpdateData(normalized, now, existing.status === 'BANNED'),
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

  async syncSupplierFeed(supplierId: string): Promise<ProviderSyncSummary & { fetched: number; upserted: number }> {
    const empty = { fetched: 0, created: 0, updated: 0, skipped: 0, errors: 0, upserted: 0 };
    if (supplierFeedLocks.has(supplierId)) return empty;
    supplierFeedLocks.add(supplierId);
    try {
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, sourceKey: true, feedUrl: true, status: true },
      });
      if (!supplier || supplier.status !== 'ACTIVE' || !supplier.feedUrl) {
        const feedLastStatus = !supplier ? 'ERROR: Supplier not found' : 'ERROR: No active feed URL configured';
        if (supplier) {
          await prisma.supplier.update({
            where: { id: supplier.id },
            data: { feedLastSyncAt: new Date(), feedLastStatus },
          });
        }
        return { ...empty, errors: 1 };
      }

      const provider = new SupplierFeedProvider(supplier);
      const summary: ProviderSyncSummary = {
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      };
      try {
        const events = await provider.fetchEvents({ city: 'Dubai' });
        summary.fetched = provider.lastFetchedCount;
        summary.errors = provider.lastValidationErrors;
        await this.upsertEvents(events, summary);
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            feedLastSyncAt: new Date(),
            feedLastStatus: `OK: fetched ${provider.lastFetchedCount}, upserted ${summary.created + summary.updated}, errors ${summary.errors}`,
          },
        });
      } catch (error: any) {
        summary.errors += 1;
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            feedLastSyncAt: new Date(),
            feedLastStatus: `ERROR: ${String(error.message || error).slice(0, 500)}`,
          },
        });
        logger.error('Supplier feed sync failed', {
          supplierId: supplier.id,
          sourceKey: supplier.sourceKey,
          error: error.message,
        });
      }

      const fetched = provider.lastFetchedCount;
      return {
        ...summary,
        fetched,
        upserted: summary.created + summary.updated,
      };
    } finally {
      supplierFeedLocks.delete(supplierId);
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

  private eventUpdateData(
    normalized: NormalizedEvent,
    now: Date,
    preserveModeration = false,
  ): Prisma.EventUpdateInput {
    const isFree = normalized.isFree === true;
    const data: Prisma.EventUpdateInput = {
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
      visibility: 'PUBLIC',
      lastSyncedAt: now,
    };
    if (!preserveModeration) data.status = 'ACTIVE';
    return data;
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
