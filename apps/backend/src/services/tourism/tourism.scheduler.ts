import config from '../../config/env';
import prisma from '../../database/prisma';
import logger from '../../utils/logger';
import { crawlAll } from './crawler';

let bootHandle: NodeJS.Timeout | undefined;
let intervalHandle: NodeJS.Timeout | undefined;

const runCrawl = async (): Promise<void> => {
  try {
    const results = await crawlAll();
    logger.info('[tourism] scheduled crawl completed', { results });
  } catch (error) {
    logger.error('[tourism] scheduled crawl failed', { error });
  }
};

export const start = (): void => {
  stop();
  if (config.NODE_ENV === 'test' || !config.TOURISM_CRAWL_ENABLED) return;

  bootHandle = setTimeout(() => {
    void (async () => {
      try {
        const passageCount = await prisma.tourismPassage.count();
        if (passageCount === 0) await runCrawl();
      } catch (error) {
        logger.error('[tourism] initial crawl check failed', { error });
      } finally {
        intervalHandle = setInterval(
          () => void runCrawl(),
          config.TOURISM_CRAWL_INTERVAL_HOURS * 60 * 60 * 1000,
        );
      }
    })();
  }, 60_000);
};

export const stop = (): void => {
  if (bootHandle) {
    clearTimeout(bootHandle);
    bootHandle = undefined;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
};
