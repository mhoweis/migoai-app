// src/middlewares/client-ip.middleware.ts
//
// Work out the visitor's real IP address so rate limits are per person.
//
// On Render, requests pass through Cloudflare and then Render's own load
// balancers before reaching Express, so `trust proxy = 1` makes `req.ip` the
// address of one of those proxies. Every visitor then shares one rate-limit
// counter: a handful of wrong passwords from anyone can lock everyone out.
//
// Cloudflare puts the visitor's address in `CF-Connecting-IP` and overwrites
// any value a client sends, so it is safe to use when traffic is known to come
// through Cloudflare (always the case on Render). Elsewhere a client could set
// the header themselves, so it is only used when TRUST_CF_CONNECTING_IP=true
// or the app is running on Render (Render sets RENDER=true).
import { NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';

export function trustCloudflareHeader(): boolean {
  if (process.env.TRUST_CF_CONNECTING_IP === 'false') return false;
  return process.env.TRUST_CF_CONNECTING_IP === 'true' || process.env.RENDER === 'true';
}

function cloudflareIp(req: Request): string | null {
  const raw = req.headers['cf-connecting-ip'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value && isIP(value) ? value : null;
}

export function clientIpMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (trustCloudflareHeader()) {
    const ip = cloudflareIp(req);
    if (ip) {
      // `req.ip` is a getter on Express's request prototype; shadow it on this
      // request so every limiter, logger and analytics hash sees the real IP.
      Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
    }
  }
  next();
}

/** What the server sees for the caller's own request (GET /api/whoami-ip). */
export function describeClientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  return {
    ip: req.ip,
    source: trustCloudflareHeader() && cloudflareIp(req) ? 'cf-connecting-ip' : 'trust-proxy',
    cfConnectingIp: cloudflareIp(req),
    xForwardedForHops: typeof forwarded === 'string' ? forwarded.split(',').length : 0,
    trustCloudflareHeader: trustCloudflareHeader(),
  };
}
