# Account types

Migo accounts use the existing `UserRole` field:

| Account type | Role | Access |
| --- | --- | --- |
| Free | `USER` | Discover, book or RSVP, use the wallet and AI assistant |
| Host | `ORGANIZER` | Free features plus event creation and management, check-in, and the host dashboard |
| Supplier | `SUPPLIER` | Host features plus the supplier portal, event feed, reports, promotion requests, and public supplier page |
| Admin | `ADMIN` | All product features plus user and event moderation |

Subscriptions are billed in AED for 30-day periods: Host is AED 99 and Supplier is AED 499. The mock payment provider can be used in development. Cancelling a plan preserves access until the current period ends; the scheduled expiry job downgrades users without another active plan to Free.

## Development fixtures

Run `npx ts-node scripts/seed-account-types.ts` from `apps/backend` to create or refresh these idempotent fixtures:

| Email | Role | Status | Notes |
| --- | --- | --- | --- |
| `migo.free@example.com` | `USER` | Active | Free account |
| `migo.host@example.com` | `ORGANIZER` | Active | Active Host subscription |
| `migo.supplier@example.com` | `SUPPLIER` | Active | Active Supplier subscription, linked to `visit-dubai` |
| `migo.paused@example.com` | `USER` | Paused | Pause reason is `Test pause` |

All fixture accounts use the development-only password `MigoRoles2026!`. Do not reuse it outside local development.

Use `npx ts-node scripts/seed-account-types.ts --remove` to remove the four fixture accounts and their seeded subscriptions. The existing `visit-dubai` Supplier record is retained.

## Supplier feeds

The Supplier portal accepts HTTPS JSON feeds using the format documented in [supplier-feed.md](./supplier-feed.md). For local development only, `SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS=true` permits HTTP and private hosts so a localhost fixture can be used.
