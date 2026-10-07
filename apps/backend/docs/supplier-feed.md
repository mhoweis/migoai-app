# Supplier event feed

Supplier feeds let active suppliers import and maintain events from a JSON endpoint. Configure a feed URL in the Supplier Portal, then use **Sync now** or the scheduled event synchronization.

## Format

The response must be JSON and may be either an array of event objects or an object with an `events` array:

```json
{
  "events": [
    {
      "id": "event-123",
      "title": "Community Night",
      "startDate": "2026-12-12T18:00:00+04:00",
      "endDate": "2026-12-12T22:00:00+04:00",
      "description": "An evening event.",
      "venueName": "Dubai Marina",
      "address": "Dubai, UAE",
      "city": "Dubai",
      "latitude": 25.08,
      "longitude": 55.14,
      "coverImage": "https://example.com/event.jpg",
      "priceFrom": 0,
      "priceTo": 0,
      "currency": "AED",
      "isFree": true,
      "category": "Community",
      "url": "https://example.com/events/event-123",
      "tags": ["community", "music"]
    }
  ]
}
```

`id`, `title`, and an ISO `startDate` are required. `city` defaults to Dubai and `currency` defaults to AED. Invalid rows are skipped and counted as errors; valid rows continue to sync. A feed may contain at most 500 events, the response body may be at most 5 MB, and the request times out after 15 seconds.

Feed event IDs are stable identifiers: keep an event's `id` unchanged when updating it. Imported events use the supplier's source key and external ID. A feed sync does not restore events banned by an administrator or alter their supplier ordering.

## Security

Production feed URLs must use HTTPS. The server resolves the host and rejects loopback, private, link-local, and cloud metadata addresses. Redirect destinations are validated as well, preventing redirects to private hosts. These checks are repeated during a fetch to reduce DNS-rebinding risk.

For local development only, set `SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS=true` to allow HTTP and local/private fixture servers. The backend refuses this setting in production. Keep it disabled for deployed environments.
