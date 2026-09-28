# Places — Google Maps venue discovery

A new user-facing feature in the Migo app, backed by the
[google-maps-scraper](https://github.com/gosom/google-maps-scraper) kit.

Users get a **Places** tab: search for coffee, padel courts, galleries or
rooftops near them, see ratings, distance and contact details, and tap through
to any Migo events at that venue. The AI agent can use the same directory, so
"where can I get good coffee near Marina?" now has an answer.

---

## One thing had to change from the original request

**The scraper cannot run inside the React Native app.** It is a Docker
container driving a real headless Chromium browser against Google Maps — it
needs a filesystem, a browser binary and about 2 GB of RAM. Phones cannot run
it, and shipping it in the bundle is not possible in any form.

So it runs on **your infrastructure**, and the app talks to it over your
existing API. From the user's point of view the result is identical: they open
Places, search, and get results. Everything you asked for is here — a feature
in the app, usable by people, callable by the agent.

```
┌──────────────┐   HTTPS    ┌──────────────┐   localhost   ┌──────────────┐
│  Migo app    │──────────▶ │ Migo backend │ ────────────▶ │   scraper    │
│ Places tab   │ ◀────────  │  + worker    │ ◀──────────── │  container   │
└──────────────┘  cached    └──────┬───────┘     CSV       └──────────────┘
                            ┌──────▼───────┐
                            │  Postgres    │  places, place_searches
                            └──────────────┘
```

---

## The design constraint that shapes everything

A scrape job takes **30 seconds to 10 minutes**, and Google rate-limits by IP.
A user tapping "search" cannot wait that long, and a hundred users triggering a
hundred jobs would get the server's IP blocked within the hour.

So the read path and the scrape path are separated:

| | Behaviour |
|---|---|
| **User searches** | Reads the `places` cache. Returns in milliseconds. |
| **Cache miss** | Enqueues **one** job, returns `status: "pending"`, client polls. |
| **Worker** | Drains the queue **one job at a time**, with cooldowns and backoff. |

The cache key is the normalized query, **not** the user — so a hundred people
asking for "brunch in Dubai Marina" produce exactly **one** scrape job, and
everyone after the first gets an instant answer.

### Blocking protection

- One job at a time, process-wide. Never concurrent.
- 20-second cooldown between jobs.
- Exponential backoff (1 → 2 → 4 … capped at 30 min) after consecutive
  failures. Empty results count as failures, because that is what a soft block
  looks like.
- Depth capped at 10 on the user path (default 5).
- 20 searches per user per hour.
- Jobs give up after 3 attempts rather than hammering.
- Optional proxy rotation via `SCRAPER_PROXIES`.

---

## Setup

### 1. Start the scraper

```bash
cd apps/backend
docker compose -f docker-compose.scraper.yml up -d
curl http://localhost:8080/api/v1/jobs      # expect []
```

> **Security:** the scraper image has **no authentication**. The `127.0.0.1`
> binding is the security boundary. Anyone who can reach port 8080 can queue
> jobs that run from your IP — never publish it on a public interface without
> an authenticating proxy in front.

### 2. Migrate

```bash
npx prisma migrate deploy     # or `migrate dev` locally
npx prisma generate
```

### 3. Configure

```bash
SCRAPER_BASE_URL=http://localhost:8080
SCRAPER_API_KEY=
SCRAPER_PROXIES=                      # comma-separated; add for heavy use

PLACES_WORKER_ENABLED=true            # false on instances that must not scrape
PLACES_CACHE_TTL_HOURS=336            # 14 days
PLACES_SEARCH_MAX_PER_HOUR=20
PLACES_JOB_COOLDOWN_MS=20000
PLACES_MAX_ATTEMPTS=3
GEOCODE_COUNTRY_CODES=ae
```

### 4. Seed the directory

Queue the UAE venue searches from the upgrade plan, so the feature is not empty
on first open:

```bash
node scripts/seed-uae-venues.js --dry-run   # see the plan
node scripts/seed-uae-venues.js             # queue it
```

Roughly 45–60 minutes to drain, by design. Watch it:

```sql
SELECT status, count(*) FROM place_searches GROUP BY status;
```

---

## What was added

### Backend

| File | Purpose |
|---|---|
| `services/places/gmaps-client.ts` | Typed client for the scraper API, CSV parser, field normalization |
| `services/places/places.service.ts` | Cache-first search, dedupe, upsert, distance |
| `services/places/place-worker.ts` | Serial queue drainer with cooldown and backoff |
| `services/places/geocode.service.ts` | UAE city table + Nominatim fallback |
| `services/places/agent-places-tool.ts` | `searchPlaces` tool for the agent |
| `routes/places.routes.ts` | User-facing API |
| `docker-compose.scraper.yml` | The scraper container |
| `scripts/seed-uae-venues.js` | Bulk venue seeding |

**API**

```
POST /api/places/search      { keyword, latitude?, longitude?, city?, radiusKm? }
GET  /api/places/search/:id  poll a pending search
GET  /api/places/nearby      ?lat&lng&q&radiusKm   cache-only, instant
GET  /api/places/:id         one place + Migo events at that venue
```

**Database:** `places`, `place_searches`, `place_search_hits`
(migration `20260919100000_places_discovery`).

### Mobile

| File | Purpose |
|---|---|
| `screens/PlacesScreen.tsx` | The Places tab — search, quick chips, results |
| `screens/PlaceDetailScreen.tsx` | Venue detail, directions, events at that venue |
| `services/places.service.ts` | API client with polling helper |
| `hooks/useUserLocation.ts` | Permission flow with fallback chain |

A **Places** tab was added between Events and AI Chat, using an Ionicon
(compass) rather than a new PNG asset. That makes six tabs — if it feels
crowded, the alternative is folding Places into the Events stack as a segmented
control; say the word and I'll move it.

### Location, finally wired

`expo-location` was in `package.json` with zero usage anywhere in the codebase.
It is now wired, following the plan's requirements:

- A **pre-permission explainer screen** before the OS prompt, since iOS denial
  rates are high.
- Fallback chain: precise GPS → last known position → **manual city picker**.
- Coordinates held in memory for the session. Only a chosen *city name* is
  persisted — never a location trail.
- `NSLocationWhenInUseUsageDescription` and Android permissions added to
  `app.json`. **Without these the iOS build would have been rejected.**

### Agent integration

The agent gained a `searchPlaces` capability:

- `searchPlacesToolDefinition` — a JSON-schema tool definition, ready to
  register when the week-7 tool-calling rewrite lands.
- Until then, `resolvePlacesForMessage` detects place intent with regex (no
  model call, zero cost) and injects grounded venue rows into the prompt as
  `P1, P2…`, mirroring the existing `E1, E2…` event convention.
- The agent **only ever sees database rows**. It cannot search Google itself,
  so it cannot invent a venue — the same groundedness property the plan
  requires for events.
- The agent never blocks on a scrape: it answers from cache and queues a
  background lookup when the cache is thin.
- Chat responses now carry a `places[]` array so the app can render venue cards
  in the conversation.

---

## Two decisions you should know about

**1. Email extraction is off.** The kit enables it by default — it is the
headline feature for lead-gen use. Migo is not a lead-gen product, and scraped
business emails are personal data under the UAE PDPL and GDPR. Collecting them
for venue metadata has no lawful basis and would turn a consumer app into a
data-protection liability. Only public business info is stored: name, address,
coordinates, phone, website, rating.

If you ever do want emails for a B2B outreach flow, that is a separate system
with its own consent and retention story — not this one.

**2. Google Maps scraping is against Google's Terms of Service.** The kit says
so plainly and so should I. The defensible reading — and what this build does —
is using public listings to build an internal venue reference that you link
back to and drive traffic toward. That matches the posture in your plan:
respect robots.txt, rate-limit hard, link back, never republish wholesale.

Practical consequences:
- Do not resell or redistribute the raw data.
- Treat entries as references to verify, not an authoritative dataset.
- Expect occasional temporary IP blocks. The backoff handles it; nothing breaks
  permanently.
- If Places becomes commercially central, the Google Places API is the
  licensed route. It costs money but removes this risk entirely.

The place detail screen carries an attribution line noting the data comes from
public listings and may be out of date.

---

## Verifying

```bash
# 1. Scraper is up
curl http://localhost:8080/api/v1/jobs

# 2. Search requires auth
curl -i -X POST $API/api/places/search -H 'content-type: application/json' \
  -d '{"keyword":"coffee","city":"Dubai"}'
# expect 401

# 3. First search queues a job
curl -X POST $API/api/places/search -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"keyword":"specialty coffee","city":"Dubai Marina"}'
# expect {"status":"pending","searchId":"..."}

# 4. Poll it
curl "$API/api/places/search/<searchId>" -H "authorization: Bearer $TOKEN"
# expect "pending" then "ready" with places[]

# 5. Same query again is instant and does NOT queue a second job
```

Worker progress is in the logs under `places-worker:`.

---

## Credits

Wraps [google-maps-scraper](https://github.com/gosom/google-maps-scraper) by
**Georgios Komninos**, MIT licensed. The kit that packaged it
(`google-maps-scraper-kit`) is MIT too. Neither is vendored into this repo —
the container is pulled by tag, pinned to `v1.15.0`.

---

## Not done

- The `--socials` enrichment (Instagram handles from venue websites) has a
  column and a UI row but no populating job yet. That is the natural next step
  and feeds the plan's Instagram seed list.
- Places are not yet matched to events to backfill `Event.latitude` /
  `Event.longitude`. **Every event in your database still has null
  coordinates**, so "events near me" remains unavailable — Places now has the
  venue coordinates needed to fix that, but the matching pass is separate work.
- `isVenue` exists for curating real event venues; nothing sets it yet.
