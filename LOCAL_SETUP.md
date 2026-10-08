# Running Migo locally

Everything on one machine: the API, the Expo app, and the Google Maps scraper.

Your Supabase database is shared with the deployed API on Render, so **anything
you scrape locally shows up in the live app immediately**. That is the whole
reason this works — the scraper needs Docker, Render has none, but they both
talk to the same Postgres.

---

## 0. What you need

| | |
|---|---|
| **Node** | 20 or newer — `node -v` |
| **Docker Desktop** | Running. Only needed for the Places scraper. |
| **Supabase connection strings** | Both of them (see below) |
| **Expo Go** | On your phone, if you want to test on a real device |

Apple Silicon (M1/M2/M3): Docker Desktop must have **Rosetta / amd64 emulation**
enabled — the scraper image is amd64 only. Docker Desktop → Settings → General →
"Use Rosetta for x86/amd64 emulation".

---

## 1. Get the code

```bash
git clone <your-repo-url> migo
cd migo
git checkout places-feature        # or main, once you've merged
npm install                        # installs all workspaces
```

This is an npm workspaces monorepo — run `npm install` from the **root**, not
from `apps/backend`.

---

## 2. Backend environment

```bash
cd apps/backend
cp .env.example .env
```

> Do **not** run `npm run setup:env`. That script is stale — it still writes a
> MySQL `DATABASE_URL` and omits `SUPABASE_DATABASE_URL`, so the app won't boot.

Now fill in `.env`. Three things actually matter:

### Supabase — you need BOTH URLs

In Supabase: **Project Settings → Database → Connection string → URI**.

```bash
# Pooled (port 6543) — for normal queries
SUPABASE_DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct (port 5432) — for migrations
DIRECT_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

Two separate strings, differing by port. **Prisma migrations fail against the
pooler** — that's why both exist. Don't forget `?pgbouncer=true&connection_limit=1`
on the pooled one, or you'll get prepared-statement errors under load.

> You'll need to add `DIRECT_URL` to the **Render environment variables** too. Prisma resolves
> it at generate time, so the app won't start without it even though only
> migrations use it.

### Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it three times, one each for `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`COOKIE_SECRET`. Set `IP_HASH_SALT` to any random string.

**Use different secrets locally than in production (Render).** If they match, a token minted
on your laptop works against production.

### Gemini

```bash
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash
AI_GLOBAL_DAILY_CAP_USD=5          # keep this low locally
```

No key? Set `AI_PROVIDER=ollama` and it falls back to a local model. Everything
except the chat still works.

---

## 3. Database

From `apps/backend`:

```bash
npx prisma generate
npx prisma migrate deploy
```

That applies both new migrations — the Phase 0 tables (`ai_usage_daily`,
`ai_spend_daily`, `user_signals`, `affiliate_clicks`) and the Places tables
(`places`, `place_searches`, `place_search_hits`).

**This writes to your real Supabase**, the same one the live app uses. The migrations
only add tables, so nothing existing is touched — but that's why you run it once,
from one place.

Check it worked:

```bash
npx prisma studio      # opens on :5555, you should see the new tables
```

---

## 4. Start the scraper

```bash
cd apps/backend
docker compose -f docker-compose.scraper.yml up -d
```

First run pulls ~1GB and takes a few minutes. Verify:

```bash
curl http://localhost:8080/api/v1/jobs
# expect: []
```

Empty array = working. Connection refused = still starting, wait 30s and retry.

**If it won't start on Apple Silicon:** uncomment the `platform: linux/amd64`
line in `docker-compose.scraper.yml` and `docker compose -f docker-compose.scraper.yml up -d`
again.

The container binds to `127.0.0.1` only. That's deliberate — it has no
authentication of its own, so anyone who could reach port 8080 could queue jobs
that run from your IP.

---

## 5. Run the API

From the repo root:

```bash
npm run dev:backend
```

You should see:

```
🚀 Server running in development mode
📡 Listening on port 5000
places-worker: started
```

That last line is the queue drainer. It's now watching for place searches.

Sanity check:

```bash
curl http://localhost:5000/api/health
```

---

## 6. Run the app

New terminal, from the repo root:

```bash
npm run dev:mobile
```

Expo prints a QR code. Then:

- **iOS simulator** — press `i`
- **Android emulator** — press `a`
- **Your phone** — scan with Expo Go
- **Browser** — press `w`

### If you're on a physical phone

`apps/mobile/src/config/index.ts` points at `192.168.12.33:5000` for physical
devices — almost certainly not your IP any more. Find yours:

```bash
ipconfig getifaddr en0          # macOS
hostname -I | awk '{print $1}'  # Linux
```

Update `PHYSICAL_DEVICE` in that file. Phone and laptop must be on the same
Wi-Fi.

---

## 7. Seed the Places directory

The Places tab is empty until you scrape something. With the API running (the
worker lives inside it):

```bash
cd apps/backend
node scripts/seed-uae-venues.js --dry-run   # see the plan first
node scripts/seed-uae-venues.js             # queue ~60 searches
```

This **queues** work — it doesn't scrape directly. The worker drains one job at
a time with cooldowns, which is what keeps Google from rate-limiting your IP.
Expect **45–60 minutes**. Leave the API running.

Watch it:

```bash
# in the API terminal you'll see:
#   places-worker: starting job   { keyword: 'art gallery' }
#   places-worker: job complete   { stored: 18 }
```

Or query directly:

```sql
SELECT status, count(*) FROM place_searches GROUP BY status;
SELECT count(*) FROM places;
```

Don't want to wait? Do one area:

```bash
node scripts/seed-uae-venues.js --only "dubai marina"
```

Or just open the Places tab and search — it queues on demand.

---

## 8. Run the affiliate backfill

Once, from anywhere. Fixes the double-wrapped URLs:

```bash
cd apps/backend
node scripts/unwrap-affiliate-urls.js --dry-run
node scripts/unwrap-affiliate-urls.js
```

Then **click a real booking link and confirm it registers in the Platinumlist
affiliate dashboard.** That's the one check worth doing by hand — the nested URLs
may have been silently dropping commission.

---

## Daily routine, once set up

Three terminals:

```bash
# 1
cd apps/backend && docker compose -f docker-compose.scraper.yml up -d

# 2
npm run dev:backend

# 3
npm run dev:mobile
```

Stopping:

```bash
docker compose -f docker-compose.scraper.yml down   # from apps/backend
# Ctrl-C the other two
```

Scraped data persists in Supabase, so you don't re-seed.

---

## When things break

**`Environment variable not found: DIRECT_URL`**
Add `DIRECT_URL` to `.env` (and Render's environment variables). Prisma needs it even when not
migrating.

**`prepared statement "s0" already exists`**
Missing `?pgbouncer=true&connection_limit=1` on `SUPABASE_DATABASE_URL`.

**Migrations hang or time out**
You're pointing at the pooler. Migrations need `DIRECT_URL` (port 5432).

**`Scraper not reachable at http://localhost:8080`**
Container isn't up. `docker ps` should list `migo-gmaps-scraper`.
Logs: `docker logs migo-gmaps-scraper`.

**Jobs keep failing, or return zero rows**
That's Google rate-limiting you. The worker backs off automatically (up to 30
min). Wait it out, or add proxies to `SCRAPER_PROXIES`. It clears in
minutes–hours and never touches your Google account.

**Places tab is empty**
Nothing scraped yet, or location isn't set. Check `SELECT count(*) FROM places;`.

**Phone can't reach the API**
Wrong `PHYSICAL_DEVICE` IP, or different Wi-Fi networks. Some routers block
device-to-device traffic — try a phone hotspot.

**`401` on every AI route**
Correct behaviour since Phase 0. For local testing without a token, set
`NODE_ENV=development` **and** `ALLOW_DEV_AUTH=true`. Never elsewhere.

**Port 5000 in use (macOS)**
AirPlay Receiver squats on it. System Settings → General → AirDrop & Handoff →
turn off AirPlay Receiver. Or set `PORT=5001` and update
`apps/mobile/src/config/index.ts` to match.

---

## Do I need the scraper running all the time?

No. It's only needed when you want **new** places. Venue data barely changes and
the cache holds 14 days.

Typical use: run it for the initial seed, then once a month to top up. The rest
of the time keep it stopped — it's a headless browser and it's not light.

If you later want Places to refresh without your laptop, that one container plus
`PLACES_WORKER_ENABLED=true` on a $5 VPS or Fly.io machine does it. Not urgent.
