// src/services/llm-budget.service.ts
//
// Layer 6 of the guardrail stack: cost governance enforced in code, not by
// trust. Two independent limits:
//
//   1. Per-user daily quota   — messages and tokens, by tier
//   2. Global daily spend cap — with a kill switch that degrades the agent
//                               to plain search for everyone
//
// Without the global cap, one bug or one attacker ends the month.

import prisma from '../config/database';
import logger from '../utils/logger';

export type UserTier = 'ANONYMOUS' | 'FREE' | 'PLUS' | 'ADMIN';

export interface TierLimits {
  dailyMessages: number;
  dailyTokens: number;
}

/** Free tier is deliberately tight — heavy AI use is what costs money. */
export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  ANONYMOUS: { dailyMessages: 0, dailyTokens: 0 },
  FREE: {
    dailyMessages: Number(process.env.AI_FREE_DAILY_MESSAGES ?? 20),
    dailyTokens: Number(process.env.AI_FREE_DAILY_TOKENS ?? 60_000),
  },
  PLUS: {
    dailyMessages: Number(process.env.AI_PLUS_DAILY_MESSAGES ?? 300),
    dailyTokens: Number(process.env.AI_PLUS_DAILY_TOKENS ?? 1_000_000),
  },
  ADMIN: { dailyMessages: 100_000, dailyTokens: 100_000_000 },
};

/** USD per 1M tokens. Defaults track Gemini Flash pricing. */
const INPUT_COST_PER_MTOK = Number(process.env.AI_INPUT_COST_PER_MTOK ?? 0.3);
const OUTPUT_COST_PER_MTOK = Number(process.env.AI_OUTPUT_COST_PER_MTOK ?? 2.5);

/** Global daily ceiling. Above this the agent turns off. */
const GLOBAL_DAILY_CAP_USD = Number(process.env.AI_GLOBAL_DAILY_CAP_USD ?? 30);
/** Warn once per day when we cross this share of the cap. */
const WARN_AT = Number(process.env.AI_GLOBAL_WARN_RATIO ?? 0.8);

export interface BudgetDecision {
  allowed: boolean;
  reason?: 'KILL_SWITCH' | 'GLOBAL_CAP' | 'DAILY_MESSAGES' | 'DAILY_TOKENS' | 'NO_AGENT_ACCESS';
  message?: string;
  remainingMessages?: number;
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function tierForRole(role?: string | null): UserTier {
  switch ((role || '').toUpperCase()) {
    case 'ADMIN':
      return 'ADMIN';
    case 'PREMIUM':
    case 'PLUS':
      return 'PLUS';
    case 'USER':
    case 'ORGANIZER':
    case 'SUPPLIER':
      return 'FREE';
    default:
      return 'ANONYMOUS';
  }
}

/** Rough token estimate. Good enough for budgeting; real counts overwrite it. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK
  );
}

let warnedForDay: string | null = null;

/**
 * Checked before any token is spent. Cheapest checks first: the global kill
 * switch is a single indexed primary-key lookup.
 */
export async function checkBudget(userId: string, tier: UserTier): Promise<BudgetDecision> {
  if (tier === 'ANONYMOUS') {
    return {
      allowed: false,
      reason: 'NO_AGENT_ACCESS',
      message: 'Sign in to chat with Migo. Browsing and search stay open to everyone.',
    };
  }

  const day = today();

  const spend = await prisma.aiSpendDaily.findUnique({ where: { day } }).catch(() => null);

  if (spend?.killed && tier !== 'ADMIN') {
    return {
      allowed: false,
      reason: 'KILL_SWITCH',
      message: 'Migo’s assistant is paused right now. Search still works — try the Events tab.',
    };
  }

  if (spend && Number(spend.costUsd) >= GLOBAL_DAILY_CAP_USD && tier !== 'ADMIN') {
    await activateKillSwitch(`daily cap of $${GLOBAL_DAILY_CAP_USD} reached`);
    return {
      allowed: false,
      reason: 'GLOBAL_CAP',
      message: 'Migo’s assistant is paused right now. Search still works — try the Events tab.',
    };
  }

  const limits = TIER_LIMITS[tier];
  const usage = await prisma.aiUsageDaily
    .findUnique({ where: { userId_day: { userId, day } } })
    .catch(() => null);

  const messages = usage?.messages ?? 0;
  const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  if (messages >= limits.dailyMessages) {
    return {
      allowed: false,
      reason: 'DAILY_MESSAGES',
      message: `You've used your ${limits.dailyMessages} assistant messages for today. They reset at midnight UTC.`,
      remainingMessages: 0,
    };
  }

  if (tokens >= limits.dailyTokens) {
    return {
      allowed: false,
      reason: 'DAILY_TOKENS',
      message: "You've hit today's assistant limit. It resets at midnight UTC.",
      remainingMessages: 0,
    };
  }

  return { allowed: true, remainingMessages: limits.dailyMessages - messages };
}

/** Called after every model turn, whether it succeeded or not. */
export async function recordUsage(params: {
  userId: string;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): Promise<void> {
  const { userId, inputTokens, outputTokens } = params;
  const day = today();
  const costUsd = estimateCostUsd(inputTokens, outputTokens);

  try {
    await prisma.$transaction([
      prisma.aiUsageDaily.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, messages: 1, inputTokens, outputTokens, costUsd },
        update: {
          messages: { increment: 1 },
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          costUsd: { increment: costUsd },
        },
      }),
      prisma.aiSpendDaily.upsert({
        where: { day },
        create: { day, costUsd, calls: 1 },
        update: { costUsd: { increment: costUsd }, calls: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    // Never fail a user request because accounting failed — but make it loud.
    logger.error('llm-budget: failed to record usage', { userId, error });
    return;
  }

  const spend = await prisma.aiSpendDaily.findUnique({ where: { day } }).catch(() => null);
  if (!spend) return;

  const total = Number(spend.costUsd);
  const dayKey = day.toISOString().slice(0, 10);

  if (total >= GLOBAL_DAILY_CAP_USD && !spend.killed) {
    await activateKillSwitch(`daily cap of $${GLOBAL_DAILY_CAP_USD} reached`);
  } else if (total >= GLOBAL_DAILY_CAP_USD * WARN_AT && warnedForDay !== dayKey) {
    warnedForDay = dayKey;
    logger.warn('llm-budget: approaching daily spend cap', {
      spentUsd: total.toFixed(4),
      capUsd: GLOBAL_DAILY_CAP_USD,
    });
  }
}

export async function activateKillSwitch(reason: string): Promise<void> {
  const day = today();
  try {
    await prisma.aiSpendDaily.upsert({
      where: { day },
      create: { day, killed: true, killedAt: new Date() },
      update: { killed: true, killedAt: new Date() },
    });
    logger.error('llm-budget: KILL SWITCH ACTIVE — agent degraded to plain search', { reason });
  } catch (error) {
    logger.error('llm-budget: failed to activate kill switch', { reason, error });
  }
}

export async function deactivateKillSwitch(): Promise<void> {
  const day = today();
  await prisma.aiSpendDaily.upsert({
    where: { day },
    create: { day, killed: false },
    update: { killed: false, killedAt: null },
  });
  logger.warn('llm-budget: kill switch cleared manually');
}

export async function getSpendStatus() {
  const day = today();
  const spend = await prisma.aiSpendDaily.findUnique({ where: { day } }).catch(() => null);
  const spentUsd = spend ? Number(spend.costUsd) : 0;
  return {
    day: day.toISOString().slice(0, 10),
    spentUsd,
    capUsd: GLOBAL_DAILY_CAP_USD,
    calls: spend?.calls ?? 0,
    killed: spend?.killed ?? false,
    remainingUsd: Math.max(0, GLOBAL_DAILY_CAP_USD - spentUsd),
  };
}
