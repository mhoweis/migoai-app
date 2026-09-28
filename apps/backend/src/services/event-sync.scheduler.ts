import config from '../config/env';
import logger from '../utils/logger';
import eventSyncService, { SyncSummary } from './event-sync.service';
import { whatsappService } from './messaging/whatsapp.service';

let intervalHandle: NodeJS.Timeout | undefined;
let bootHandle: NodeJS.Timeout | undefined;
let lastRunAt: Date | undefined;
let lastSummary: SyncSummary | undefined;
let nextRunAt: Date | undefined;
let reminderTimeout: NodeJS.Timeout | undefined;
let reminderInterval: NodeJS.Timeout | undefined;

const runSync = async (): Promise<SyncSummary> => {
  lastRunAt = new Date();
  try {
    lastSummary = await eventSyncService.syncAll();
    logger.info('Event sync completed', lastSummary);
  } catch (error: any) {
    logger.error('Event sync failed', { error: error.message });
    lastSummary = { perProvider: {}, durationMs: 0 };
  }
  if (config.EVENT_SYNC_INTERVAL_MINUTES > 0) {
    nextRunAt = new Date(Date.now() + config.EVENT_SYNC_INTERVAL_MINUTES * 60 * 1000);
  }
  return lastSummary;
};

export const runNow = async (): Promise<SyncSummary> => runSync();

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
  if (whatsappService.isConfigured()) {
    const match = config.WHATSAPP_REMINDERS_CRON.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
    if (match) {
      const minute = Number(match[1]);
      const hour = Number(match[2]);
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(hour, minute, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      reminderTimeout = setTimeout(() => {
        void whatsappService.sendEventReminders().catch(error => logger.error('[whatsapp] reminders failed', { error }));
        reminderInterval = setInterval(() => {
          void whatsappService.sendEventReminders().catch(error => logger.error('[whatsapp] reminders failed', { error }));
        }, 24 * 60 * 60 * 1000);
      }, next.getTime() - now.getTime());
    }
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
  if (reminderTimeout) {
    clearTimeout(reminderTimeout);
    reminderTimeout = undefined;
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = undefined;
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
