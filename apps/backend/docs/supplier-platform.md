# Supplier platform analytics

Run `npx ts-node scripts/seed-supplier-analytics.ts` to create demo click, view, search, and campaign data. Re-run safely to replace the previous demo set. Use `npx ts-node scripts/seed-supplier-analytics.ts --remove` to remove it. Seeded affiliate clicks use the `seed-supplier-analytics-` token prefix; seeded `user_signals` include `{ "seed": true, "seedSource": "supplier-analytics" }`; seeded campaigns carry a `[seed:supplier-analytics]` notes marker.

Metrics use the requested `from`/`to` range (defaulting to the last 30 days through now):

- **Events listed / upcoming:** non-deleted events by `external_source`; upcoming starts at or after now.
- **Impressions:** rows in `event_views`; **views:** `user_signals` rows with type `view`.
- **Clicks:** affiliate clicks joined to events by `event_id` and grouped by source. Null platforms are classified from the user agent.
- **Unique clickers:** distinct user IDs, falling back to IP hashes when no user ID is recorded.
- **Saves:** wishlist rows created in range.
- **Bookings / tickets / revenue:** `CONFIRMED` and `CHECKED_IN` bookings created in range; revenue sums `total_amount`.
- **CTR:** clicks divided by `event_views` impressions, or zero when there are no impressions.
- **Active campaigns:** campaigns in `ACTIVE` status whose end time has not passed. Active campaign revenue sums their `price_aed`.
- **Interest categories:** event views, saves, click-outs, and bookings added with equal weight.
