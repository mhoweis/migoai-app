// src/middlewares/ai-guard.middleware.ts
//
// Layers 1 and 2 of the guardrail stack, run before a single token is spent.
//
//   aiBurstLimit  — per-user burst limit, active in EVERY environment.
//                   The old global limiter was IP-based and production-only,
//                   which throttled real users behind carrier NAT while
//                   letting anyone with rotating IPs straight through.
//   aiBudgetGuard — tier entitlement, daily quota, global kill switch.
//   aiInputGuard  — length cap and deterministic injection patterns.

import { Request, Response, NextFunction } from 'express';
import { checkBudget, tierForRole } from '../services/llm-budget.service';
import logger from '../utils/logger';

interface GuardedRequest extends Request {
  user?: { id: string; email?: string; name?: string; role?: string };
  aiTier?: ReturnType<typeof tierForRole>;
}

// ── Burst limiting ───────────────────────────────────────────────────────────

const BURST_WINDOW_MS = Number(process.env.AI_BURST_WINDOW_MS ?? 60_000);
const BURST_MAX = Number(process.env.AI_BURST_MAX ?? 5);

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Keep the map from growing without bound on a long-lived process.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, BURST_WINDOW_MS);
// Do not hold the process open in tests or short-lived workers.
if (typeof (sweeper as any)?.unref === 'function') (sweeper as any).unref();

/**
 * Keyed on user ID where we have one, falling back to IP for unauthenticated
 * traffic. Mount this AFTER authentication so the key is the user.
 */
export const aiBurstLimit = (req: GuardedRequest, res: Response, next: NextFunction) => {
  const key = req.user?.id || `ip:${req.ip}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + BURST_WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
  res.setHeader('X-RateLimit-Limit', String(BURST_MAX));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, BURST_MAX - bucket.count)));

  if (bucket.count > BURST_MAX) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: `Give me a second — try again in ${retryAfter}s.`,
    });
  }

  next();
};

// ── Entitlement, quota and kill switch ───────────────────────────────────────

export const aiBudgetGuard = async (req: GuardedRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const tier = tierForRole(req.user?.role);
  req.aiTier = tier;

  try {
    const decision = await checkBudget(userId, tier);

    if (!decision.allowed) {
      const status = decision.reason === 'NO_AGENT_ACCESS' ? 403 : 429;
      logger.info('ai-guard: request blocked', { userId, tier, reason: decision.reason });
      return res.status(status).json({
        success: false,
        error: decision.reason,
        message: decision.message,
        // The client falls back to plain search on this flag.
        degradeToSearch: decision.reason === 'KILL_SWITCH' || decision.reason === 'GLOBAL_CAP',
      });
    }

    if (typeof decision.remainingMessages === 'number') {
      res.setHeader('X-AI-Messages-Remaining', String(decision.remainingMessages));
    }

    next();
  } catch (error) {
    // Fail closed: if we cannot verify budget, we do not spend money.
    logger.error('ai-guard: budget check failed, denying request', { userId, error });
    return res.status(503).json({
      success: false,
      error: 'AI temporarily unavailable',
      message: 'Migo’s assistant is briefly unavailable. Search still works.',
    });
  }
};

// ── Input guard ──────────────────────────────────────────────────────────────

const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS ?? 1000);

/**
 * Deterministic patterns only. This is not a content classifier — it is a
 * cheap filter for the obvious cases, so the model never sees them.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+/i,
  /you\s+are\s+now\s+(a|an|no\s+longer)/i,
  /(reveal|show|print|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions|rules)/i,
  /repeat\s+everything\s+(above|before)/i,
  /\bDAN\b\s+mode/i,
  /pretend\s+(you\s+are|to\s+be)\s+(not|a\s+different)/i,
  /<\s*\/?\s*(system|assistant)\s*>/i,
  /\[\s*(system|INST)\s*\]/i,
];

/** Categories Migo never serves, regardless of phrasing. */
const BLOCKED_TOPICS: RegExp[] = [
  /\b(escort|hookup|sugar\s+(daddy|baby))\b/i,
  /\b(buy|sell|score|where.*get)\s+(weed|coke|cocaine|mdma|hash|drugs)\b/i,
  /\b(fake|forged)\s+(id|emirates\s*id|passport|visa)\b/i,
];

export const aiInputGuard = (req: Request, res: Response, next: NextFunction) => {
  const raw = (req.body?.message ?? req.body?.query ?? '') as unknown;

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Send a message to get started.',
    });
  }

  const text = raw.trim();

  if (text.length > MAX_INPUT_CHARS) {
    return res.status(400).json({
      success: false,
      error: 'Message too long',
      message: `Keep it under ${MAX_INPUT_CHARS} characters.`,
    });
  }

  const userId = (req as GuardedRequest).user?.id;

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) {
    logger.warn('ai-guard: injection pattern blocked', { userId, sample: text.slice(0, 120) });
    return res.status(200).json({
      success: true,
      data: {
        response:
          "I can only help with events, venues and planning a night out. What are you in the mood for?",
        recommendations: [],
        suggestions: ['What’s on this weekend?', 'Something outdoors tonight', 'Free events near me'],
        guard: 'INJECTION_BLOCKED',
      },
    });
  }

  if (BLOCKED_TOPICS.some((pattern) => pattern.test(text))) {
    logger.warn('ai-guard: blocked topic', { userId });
    return res.status(200).json({
      success: true,
      data: {
        response:
          "That’s outside what I can help with. I’m here for events and things to do around the UAE.",
        recommendations: [],
        suggestions: ['What’s on this weekend?', 'Live music in Dubai', 'Family-friendly this Saturday'],
        guard: 'TOPIC_BLOCKED',
      },
    });
  }

  // Normalize so downstream code works on the sanitized value.
  if (typeof req.body.message === 'string') req.body.message = text;
  if (typeof req.body.query === 'string') req.body.query = text;

  next();
};
