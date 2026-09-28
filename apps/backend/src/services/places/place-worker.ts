// src/services/places/place-worker.ts
//
// Drains the `place_searches` queue, ONE JOB AT A TIME.
//
// Serial execution is not a simplification — it is the safety property. The
// upstream project's guidance is explicit: back-to-back jobs, high depth or
// many keywords without proxies get your IP temporarily rate-limited by
// Google. So this worker:
//
//   - runs a single job at a time, process-wide
//   - waits a cooldown between jobs
//   - backs off exponentially after consecutive failures (the block signal)
//   - gives up on a search after MAX_ATTEMPTS rather than hammering
//
// When the backend moves from Bull to pg-boss (week 1 of the plan), this
// becomes a pg-boss handler with `teamSize: 1`. The logic does not change.

import prisma from '../../config/database';
import logger from '../../utils/logger';
import {
  createJob,
  getJobStatus,
  downloadResults,
  deleteJob,
  isHealthy,
  ScraperUnavailableError,
} from './gmaps-client';
import { persistResults, completeSearch, failSearch } from './places.service';

const POLL_INTERVAL_MS = Number(process.env.PLACES_WORKER_POLL_MS ?? 5_000);
const COOLDOWN_MS = Number(process.env.PLACES_JOB_COOLDOWN_MS ?? 20_000);
const JOB_POLL_INTERVAL_MS = Number(process.env.PLACES_JOB_POLL_MS ?? 8_000);
const JOB_TIMEOUT_MS = Number(process.env.PLACES_JOB_TIMEOUT_MS ?? 12 * 60_000);
const MAX_ATTEMPTS = Number(process.env.PLACES_MAX_ATTEMPTS ?? 3);
const ENABLED = process.env.PLACES_WORKER_ENABLED !== 'false';

const PROXIES = (process.env.SCRAPER_PROXIES || '')
  .split(',')
  .map((p: string) => p.trim())
  .filter(Boolean);

let running = false;
let stopping = false;
let consecutiveFailures = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff after repeated failures — the block-signal response. */
function backoffMs(): number {
  if (consecutiveFailures === 0) return 0;
  const minutes = Math.min(2 ** (consecutiveFailures - 1), 30);
  return minutes * 60_000;
}

async function claimNextSearch() {
  // Single-worker deployment, so a simple claim is sufficient. With multiple
  // workers this needs SELECT ... FOR UPDATE SKIP LOCKED (or pg-boss).
  const next = await prisma.placeSearch.findFirst({
    where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
  });
  if (!next) return null;

  return prisma.placeSearch.update({
    where: { id: next.id },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });
}

async function runSearch(search: {
  id: string;
  keyword: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  depth: number;
  attempts: number;
}): Promise<void> {
  logger.info('places-worker: starting job', {
    searchId: search.id,
    keyword: search.keyword,
    attempt: search.attempts,
  });

  let jobId: string | null = null;

  try {
    jobId = await createJob({
      keywords: [search.keyword],
      lat: search.latitude,
      lon: search.longitude,
      depth: search.depth,
      radiusMeters: search.radiusMeters,
      // Email extraction stays off: scraped emails are personal data under
      // the UAE PDPL and GDPR, and venue metadata does not need them.
      email: false,
      proxies: PROXIES,
    });

    await prisma.placeSearch.update({ where: { id: search.id }, data: { jobId } });

    const deadline = Date.now() + JOB_TIMEOUT_MS;
    let status = await getJobStatus(jobId);

    while (status !== 'ok' && status !== 'failed') {
      if (Date.now() > deadline) {
        throw new Error('Scrape job timed out');
      }
      await sleep(JOB_POLL_INTERVAL_MS);
      status = await getJobStatus(jobId);
    }

    if (status === 'failed') {
      // Google rate-limiting surfaces here, as failed jobs or empty results.
      throw new Error('Scrape job failed — this usually means we are being rate-limited');
    }

    const scraped = await downloadResults(jobId);

    if (scraped.length === 0) {
      // An empty result on a plausible query is also a block signal.
      consecutiveFailures++;
      logger.warn('places-worker: job returned zero rows', { searchId: search.id, jobId });
    } else {
      consecutiveFailures = 0;
    }

    const stored = await persistResults(search.id, scraped);
    await completeSearch(search.id, stored);

    logger.info('places-worker: job complete', { searchId: search.id, stored });
  } catch (error: any) {
    consecutiveFailures++;

    const message =
      error instanceof ScraperUnavailableError
        ? 'The place lookup service is not running.'
        : error?.message ?? 'Unknown error';

    const willRetry = search.attempts < MAX_ATTEMPTS;

    if (willRetry) {
      await prisma.placeSearch.update({
        where: { id: search.id },
        data: { status: 'pending', error: message.slice(0, 1000) },
      });
      logger.warn('places-worker: job failed, will retry', {
        searchId: search.id,
        attempt: search.attempts,
        message,
      });
    } else {
      await failSearch(search.id, message);
      logger.error('places-worker: job failed permanently', { searchId: search.id, message });
    }
  } finally {
    if (jobId) await deleteJob(jobId);
  }
}

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const wait = backoffMs();
      if (wait > 0) {
        logger.warn('places-worker: backing off', {
          consecutiveFailures,
          waitMinutes: Math.round(wait / 60_000),
        });
        await sleep(wait);
        if (stopping) break;
      }

      const search = await claimNextSearch();

      if (!search) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (!(await isHealthy())) {
        await prisma.placeSearch.update({
          where: { id: search.id },
          data: { status: 'pending', error: 'Scraper container unreachable' },
        });
        logger.warn('places-worker: scraper unreachable, pausing');
        await sleep(60_000);
        continue;
      }

      await runSearch(search as any);
      await sleep(COOLDOWN_MS);
    } catch (error) {
      logger.error('places-worker: loop error', { error });
      await sleep(POLL_INTERVAL_MS);
    }
  }

  running = false;
  logger.info('places-worker: stopped');
}

export function startPlaceWorker(): void {
  if (!ENABLED) {
    logger.info('places-worker: disabled via PLACES_WORKER_ENABLED=false');
    return;
  }
  if (running) return;
  running = true;
  stopping = false;
  logger.info('places-worker: started');
  void loop();
}

export function stopPlaceWorker(): void {
  stopping = true;
}

export function workerStatus() {
  return { running, stopping, consecutiveFailures, backoffMs: backoffMs(), proxies: PROXIES.length };
}
