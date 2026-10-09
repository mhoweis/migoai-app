---
name: testing-migoai-backend
description: How to boot and exercise the migoai-app backend (apps/backend) locally for API/auth testing — Postgres via Docker, .env construction, prisma migrations, and the Ollama autostart pitfall.
---

# Testing the migoai-app backend locally

## Devin Secrets Needed
- None for local testing — placeholder JWT secrets work when `NODE_ENV=development`.

## Prerequisites
- Node is under nvm, NOT on the default PATH: `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH` (also v24.19.0 exists).
- Docker is available and usable without sudo.

## Boot steps (verified working)
1. Postgres: `docker run -d --name migo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=migo -p 5432:5432 postgres:16-alpine` (no local Postgres/Redis is installed; a plain Postgres container works — Supabase is not required).
2. Create `apps/backend/.env` — required vars (zod parse in `src/config/env.ts`): `SUPABASE_DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Point both DB URLs at `postgresql://postgres:postgres@localhost:5432/migo`.
3. **Pitfall**: `src/server.ts` auto-spawns `ollama serve` when `AI_PROVIDER=gemini` AND `GEMINI_API_KEY` is empty — the spawn ENOENT kills the server. Set `GEMINI_API_KEY=dummy-not-real` in `.env` to skip it. Also set `PLACES_WORKER_ENABLED=false` to silence the worker.
4. `cd apps/backend && npx prisma generate && npx prisma migrate deploy`.
5. `npx ts-node src/server.ts` → listens on :5000; check `GET /api/health`.

## API shape notes
- Auth endpoints are at `/api/auth/*` from `src/routes/auth.routes.ts` (register `{email,password,name}`, login `{identifier,password}`, refresh `{refreshToken}` at `/api/auth/refresh-token`, logout requires Bearer access token). Ignore the parallel `src/api/auth/routes.ts` — it is NOT mounted; mounted routers live in `src/routes/`.
- Refresh tokens in the `refresh_tokens` table are stored as sha256 hex hashes (64 chars) — verify with `docker exec migo-pg psql -U postgres -d migo -c 'SELECT ... FROM refresh_tokens'`. Table/columns are mixed-case (`"expiresAt"`, `"userId"`) except `created_at`/`updated_at`.
- Reuse semantics have a ~60s grace window (`REUSE_GRACE_MS` in `auth.service.ts`): immediate reuse of a just-rotated/revoked token returns 200 by design; reuse after the window → 401 + mass revocation. To test the 401 path, sleep >60s between revocation and reuse.
- Rate limits are per-IP (express-rate-limit, in-memory): login/register 20/15min — test with ~25 sequential bad logins; prior successful logins count toward the window.
- User endpoints `/api/users/*` require Bearer access token; `/api/users/me` and `/api/users/:id` use a safe select (no password). Admin checks re-query the DB role, so a JWT claiming `role=ADMIN` for a non-admin user still gets 403.
- Mobile app (`apps/mobile`) needs an emulator/device — not testable from this box.
