import config from '../config/env';
import logger from '../utils/logger';
import eventSyncService, { SyncSummary } from './event-sync.service';

let intervalHandle: NodeJS.Timeout | undefined;
let bootHandle: NodeJS.Timeout | undefined;
let lastRunAt: Date | undefined;
let lastSummary: SyncSummary | undefined;
let nextRunAt: Date | undefined;

const runSync = async (): Promise<void> => {
  lastRunAt = new Date();
  try {
    lastSummary = await eventSyncService.syncAll();
    logger.info('Event sync completed', lastSummary);
  } catch (error: any) {
    logger.error('Event sync failed', { error: error.message });
  }
  if (config.EVENT_SYNC_INTERVAL_MINUTES > 0) {
    nextRunAt = new Date(Date.now() + config.EVENT_SYNC_INTERVAL_MINUTES * 60 * 1000);
  }
};

export const start = (): void => {
  stop();
  if (config.EVENT_SYNC_INTERVAL_MINUTES > 0) {
    intervalHandle = setInterval(() => {
      void runSync();
    }, config.EVENT_SYNC_INTERVAL_MINUTES * 60 * 1000);
    nextRunAt = new Date(Date.now() + config.EVENT_SYNC_INTERVAL_MINUTES * 60 * 1000);
  }
  if (config.EVENT_SYNC_ON_BOOT) {
    bootHandle = setTimeout(() => {
      void runSync();
    }, 15_000);
  }
};

export const stop = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
  if (bootHandle) {
    clearTimeout(bootHandle);
    bootHandle = undefined;
  }
  nextRunAt = undefined;
};

export const getStatus = () => ({
  lastRunAt,
  lastSummary,
  nextRunAt,
  providers: eventSyncService.providers
    .filter(provider => provider.isConfigured())
    .map(provider => provider.name),
});

export default { start, stop, getStatus };
