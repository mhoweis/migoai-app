# Phase 0 — security, cost and affiliate plumbing

Implements the "This week, before any feature work" section of the upgrade plan.
Nothing here is a new feature; it closes the three holes that make everything
downstream unsafe to build on.

---

## 1. `devAuthMiddleware` no longer opens AI routes to the world

**Before:** the middleware fell back to a hardcoded `test_user_123` whenever a
JWT was missing *or invalid*, with no `NODE_ENV` check. Every AI route was
unauthenticated in production, running on your Gemini key.

**After:** the fallback requires **both** `NODE_ENV=development` **and**
`ALLOW_DEV_AUTH=true`. Anywhere else it returns 401, exactly like `authenticate`.

`apps/backend/src/middlewares/dev-auth.middleware.ts`

Also exports `developmentOnly`, a guard that 404s a route outside local dev.

> **Action required:** set `ALLOW_DEV_AUTH=true` in your local `.env` if you rely
> on unauthenticated AI testing. Do not set it anywhere else.

## 2. `/api/ai/dev/setup` is no longer public

It was defined at line 88, above `router.use(devAuthMiddleware)` at line 140, so
it was fully public in every environment. It now sits behind `developmentOnly`
and returns 404 outside local development.

## 3. Per-user rate limiting, in every environment

**Before:** one IP-based limiter, 100 requests / 15 minutes, production-only, not
specific to AI routes. That throttled real users sharing a carrier NAT address
while letting anyone with rotating IPs straight through, and staging had no
limit at all.

**After, two layers:**

| Layer | Scope | Default |
|---|---|---|
| Coarse IP limiter (`app.ts`) | all `/api/*`, every environment | 600 / 15 min |
| Per-user burst (`aiBurstLimit`) | AI routes, keyed on user ID | 5 / minute |

Health and debug endpoints are exempt from the IP limiter.

`apps/backend/src/middlewares/ai-guard.middleware.ts`

## 4. Global daily LLM spend cap with a kill switch

`apps/backend/src/services/llm-budget.service.ts`

- Every model turn records estimated input/output tokens and cost.
- **Per-user daily quota by tier** — free tier defaults to 20 messages and
  60k tokens. Anonymous users get no agent access at all; browsing and search
  stay open.
- **Global daily cap** (default `$30`). On breach the kill switch flips and the
  agent degrades to plain search for everyone, with a warning logged at 80%.
- Budget checks **fail closed**: if the check itself errors, the request is
  denied rather than spending money.

Admin control (requires `ADMIN` role):

```
GET  /api/admin/ai/spend    → today's spend, cap, call count, kill state
POST /api/admin/ai/kill     → manual kill switch
POST /api/admin/ai/resume   → clear it
```

## 5. Input guard

Length cap (1,000 chars), deterministic prompt-injection patterns, and a
blocklist for categories Migo never serves — all checked **before** a token is
spent. Blocked injection attempts get a normal-looking redirect response rather
than an error, and are logged for weekly review.

## 6. Affiliate double-wrap fixed, attribution added

**The bug:** `import-platinumlist.js:251` stored an already-wrapped affiliate URL
in `externalUrl`. `EventsDetailScreen.tsx:86` and `AIEventsScreen.tsx:136` then
wrapped it *again*, producing a nested tracking URL — the classic way to silently
lose commission. Separately, `isPlatinumlistUrl()` matched any URL *containing*
`platinumlist.net`, which was true of every wrapped URL regardless of source.

**The fix** — link building moved off the client entirely:

```
GET /go/:eventId?from=<placement>   →   302   →   supplier
```

The handler resolves the supplier from `event.source`, wraps exactly once, logs
a `UserSignal` (`click_out`, weight 8), writes an `AffiliateClick` row with an
opaque sub-ID token, and increments `Event.clickCount` — a column that existed
and that nothing wrote to.

This means the `ref` is no longer compiled into the app bundle, so affiliate
parameters change without an app store release; and payouts become attributable
to a user, an event and a feed placement.

`isPlatinumlistUrl` now parses the hostname instead of substring-matching.

> **Action required:** run the backfill against any already-imported events:
> ```
> node scripts/unwrap-affiliate-urls.js --dry-run   # inspect
> node scripts/unwrap-affiliate-urls.js             # apply
> ```
> Then **verify one real click in the affiliate dashboard** before anything else.

> **Pending:** set `PLATINUMLIST_SUBID_PARAM` to `subid`, `sub_id` or `p1` once
> Platinumlist confirms which they support. Until then no sub-ID is sent, rather
> than an ignored parameter.

## 7. System prompt rewritten

The old prompt fought the product: "Stay Formal — no slang or emojis" is the
wrong register for a consumer nightlife app; "No Recommendations: for paid
events, always redirect to official sources" contradicts the affiliate model you
just fixed; "do not engage in personal conversations" contradicts the taste
model. The replacement is short, warm, and every line maps to something
checkable downstream, with the UAE content policy included.

Note this is prompt-level only. The groundedness check that makes
"only mention events from tool results" *enforceable* is Layer 5, and lands with
the agent rewrite.

## 8. Model upgrade

`gemini-1.5-pro` → `gemini-2.0-flash` (override with `GEMINI_MODEL`). It was
outdated and priced as a pro model on a path where Flash is sufficient.

---

## Database

New tables in `prisma/migrations/20260918120000_phase0_ai_governance/`:

| Table | Purpose |
|---|---|
| `ai_usage_daily` | per-user quota and token budget |
| `ai_spend_daily` | global spend + kill switch, one row per UTC day |
| `user_signals` | append-only signal capture (the taste model reads this from week 6) |
| `affiliate_clicks` | click-out attribution with sub-ID token |

```bash
cd apps/backend
npx prisma migrate deploy      # or `migrate dev` locally
npx prisma generate
```

## New environment variables

```bash
# Dev auth escape hatch — local only, never set this in staging or production
ALLOW_DEV_AUTH=false

# Model
GEMINI_MODEL=gemini-2.0-flash

# Cost governance
AI_GLOBAL_DAILY_CAP_USD=30
AI_GLOBAL_WARN_RATIO=0.8
AI_FREE_DAILY_MESSAGES=20
AI_FREE_DAILY_TOKENS=60000
AI_PLUS_DAILY_MESSAGES=300
AI_PLUS_DAILY_TOKENS=1000000
AI_INPUT_COST_PER_MTOK=0.3
AI_OUTPUT_COST_PER_MTOK=2.5
AI_BURST_MAX=5
AI_BURST_WINDOW_MS=60000
AI_MAX_INPUT_CHARS=1000

# Affiliates
PLATINUMLIST_AFF_REF=nmu2yjg
PLATINUMLIST_SUBID_PARAM=
IP_HASH_SALT=<random string>
```

## Verifying the fixes

```bash
# 1. AI routes reject unauthenticated calls
curl -i -X POST $API/api/ai/chat -H 'content-type: application/json' \
  -d '{"message":"what is on tonight"}'
# expect 401

# 2. dev/setup is invisible
curl -i -X POST $API/api/ai/dev/setup      # expect 404

# 3. Burst limit fires on the 6th call in a minute
for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $API/api/ai/chat -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"message":"hi"}'; done
# expect 200 ×5 then 429

# 4. Click-out redirects once, with no nesting
curl -sI "$API/go/<eventId>?from=detail" | grep -i location
```

---

## Not in this change

Deliberately left for week 1 onward, per the plan's ordering: the Postgres
migration cleanup and MySQL removal, Bull → pg-boss, deleting the duplicate
service and route layers, the source registry and ingestion pipeline, location
capture, the taste model, and the tool-calling agent rewrite.

The three items in the Phase 0 checklist that are not code — Meta App Review,
the Eventbrite distribution partner application, and the DET and Platinumlist
emails — have long lead times and should go out today.
