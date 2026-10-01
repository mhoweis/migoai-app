# Migo release runbook

Release builds should be created from a reviewed, tagged commit. This checklist assumes the API is deployed at the public `APP_PUBLIC_URL` and the Expo app is configured for that same API.

## Prerequisites

- Node.js 22, npm, Docker, and a clean checkout of the release commit.
- A registered production domain, HTTPS hosting for the API and website, and persistent storage for uploads.
- A production PostgreSQL database with network access from the backend; take a backup before the first production migration.
- An EAS account and project, Apple Developer/App Store Connect access, and Google Play Console access.
- Live Stripe keys and a Google Maps Android key restricted to the production app.
- Store signing credentials and final app icons, screenshots, age ratings, privacy declarations, and support contact information.
- Production secrets and provider credentials stored in the deployment secret manager, not in source control or build logs.
- A public privacy policy, terms page, and account-deletion instructions at `/privacy`, `/terms`, and `/delete-account`.
- Store builds (`EXPO_PUBLIC_APP_ENV=production` on iOS/Android) don't sell plans. Every upgrade/purchase entry point is hidden and only the current plan is shown. Host and Supplier plans are sold on the website through Stripe. Don't mention web purchase inside the app, in the store listing or in review notes. Event tickets are services used outside the app, so they keep Stripe checkout.

## Backend environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes (`production`) | Enables production validation and disables test-only payment routes. |
| `PORT` | No (default `5000`) | HTTP listener. |
| `SUPABASE_DATABASE_URL` | Yes | PostgreSQL connection used by the backend and Prisma migrations. |
| `DIRECT_URL` | Yes for migrations | Direct PostgreSQL connection for Prisma migration operations when the runtime URL uses a pooler. |
| `JWT_SECRET` | Yes | Random secret, at least 32 characters. |
| `JWT_REFRESH_SECRET` | Yes | Different random secret, at least 32 characters. |
| `COOKIE_SECRET` | Yes in production | Random secret, at least 32 characters; the development default is rejected. |
| `IP_HASH_SALT` | Yes in production | Random secret, at least 32 characters; the development default is rejected. |
| `STRIPE_SECRET_KEY` | Yes in production | Stripe server-side key (`sk_live_…` for live payments). |
| `STRIPE_PUBLISHABLE_KEY` | For client checkout | Stripe publishable key paired with the secret key. |
| `STRIPE_WEBHOOK_SECRET` | For Stripe webhooks | Signing secret configured for the deployed webhook endpoint. |
| `APP_PUBLIC_URL` | Yes in production | Public HTTPS URL used for links and checkout returns. |
| `CLIENT_URL` | Recommended | Public client origin allowed by CORS. |
| `SUPPORT_EMAIL` | No | Support contact; defaults to `support@migoapp.com`. |
| `WEB_DIST_DIR` | No | Directory containing the exported Expo web app; the Docker image uses `/app/web`. |
| `UPLOADS_DIR` | No | Persistent upload directory; defaults to the backend uploads directory. Docker uses `/data/uploads`. |
| `GEMINI_API_KEY` | For AI chat | Google Gemini API key. Set a non-empty value to prevent the development Ollama fallback from starting. |
| `GOOGLE_MAPS_API_KEY` | Optional | Places/geocoding integration. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Optional | Opted-in WhatsApp reminder delivery. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Optional | SMS delivery where configured. |
| `SENDGRID_API_KEY` or `SMTP_HOST` and SMTP credentials | Optional | Email delivery. |
| `TICKETMASTER_API_KEY`, `EVENTBRITE_API_KEY`, `VISIT_DUBAI_ALGOLIA_APP_ID`, `VISIT_DUBAI_ALGOLIA_API_KEY`, `DIFC_ALGOLIA_APP_ID`, `DIFC_ALGOLIA_API_KEY`, `EXPO_CITY_CONTENTFUL_TOKEN`, `YAS_ISLAND_COVEO_TOKEN` | Optional | Event discovery provider credentials. Configure only providers that are enabled for the deployment. |
| `PUPPETEER_EXECUTABLE_PATH` | Docker | Chromium executable; set to `/usr/bin/chromium` in the image. |
| `PLACES_WORKER_ENABLED`, `EVENT_SYNC_ON_BOOT` | Optional | Background place-worker and event-sync controls. |

Never put production values in `.env` files committed to Git. Keep `/data` on persistent storage and protect database backups and log access.

## EAS environment

Set these in the EAS environment used for production builds:

| Variable | Value / purpose |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `production`; hides preview-only authentication and connection-test UI. |
| `EXPO_PUBLIC_API_URL` | Public backend origin, for example `https://migoapp.com`. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Android Maps SDK key restricted to the production package and signing certificate. |
| `EAS_PROJECT_ID` | EAS project UUID; added to Expo config when present. |

Do not expose backend secrets as `EXPO_PUBLIC_*` variables.

## Build and submit

Install the EAS CLI and authenticate:

```sh
npm install --global eas-cli
eas whoami
```

From `apps/mobile`, after setting the EAS environment and confirming `eas.json` project configuration:

```sh
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

The production profile uses remote app-version management and automatic version increments. Inspect each generated build and its signing credentials before submitting; submission does not itself complete store review.

## Store submission checklist

- [ ] Confirm production API, CORS origin, HTTPS certificates, migrations, backups, monitoring, and support mailbox.
- [ ] Prepare an App Review demo account and its review instructions; do not use a real user's credentials.
- [ ] Give App Review a demo account that is already on the Host plan so reviewers can see host features.
- [ ] Verify `/privacy`, `/terms`, and `/delete-account` in English and Arabic on mobile web.
- [ ] Confirm the public support URL, privacy URL (`/privacy`), terms URL (`/terms`), and account-deletion URL (`/delete-account`) in both store consoles.
- [ ] Verify account deletion in-app, including password confirmation, upcoming-booking safeguards, and the retained accounting records described in the privacy notice.
- [ ] Complete Apple App Privacy details and Google Play Data safety disclosures to match actual SDKs, analytics, location, photos, AI chat, payments, and messaging.
- [ ] Review camera, photo-library, location, notification, and encryption declarations and ensure store permission prompts match app behavior.
- [ ] Confirm app names, package/bundle identifiers, build numbers, icons, screenshots, age ratings, contact information, and localized listings.
- [ ] Review Stripe, subscriptions, and paid-plan access against current App Store and Play billing policies; obtain product/legal approval before release.
- [ ] Test on current iOS and Android devices, including Arabic RTL, accessibility, offline behavior, account deletion, booking/refund messaging, and store purchase flows.
- [ ] Ensure event organizers and ticket providers are clearly identified, and verify their booking/refund terms are reachable before purchase.
- [ ] Submit builds for store review and monitor review feedback and production health after release.

## Draft store listings

The drafts below must be reviewed for trademark availability, store metadata limits, accuracy, and local consumer-law requirements.

### English

- **Name:** Migo
- **Subtitle:** Discover events around you
- **Promotional text:** Find your next UAE plan—explore local events, keep tickets in one place and share ideas with friends.
- **Keywords:** events,dubai,abu dhabi,concerts,things to do,weekend,festival,community,tickets
- **Category:** Lifestyle
- **Secondary category:** Entertainment
- **Description:** Discover things to do across the UAE with Migo. Explore events, save plans, book tickets where available, and keep your bookings together. Follow friends and organizers, find events by interest, and get useful reminders. Event details and ticket conditions may be provided by organizers and third-party ticket providers; check their terms before purchasing.

### العربية

- **الاسم:** Migo
- **العنوان الفرعي:** اكتشف الفعاليات من حولك
- **النص الترويجي:** اكتشف فعاليتك القادمة في الإمارات، واحتفظ بتذاكرك وشارك خططك مع الأصدقاء.
- **الكلمات المفتاحية:** فعاليات,دبي,أبوظبي,حفلات,أنشطة,عطلة نهاية الأسبوع,مهرجانات,مجتمع,تذاكر
- **الفئة:** أسلوب الحياة
- **الفئة الثانوية:** الترفيه
- **الوصف:** اكتشف ما يمكنك فعله في مختلف أنحاء الإمارات مع Migo. تصفح الفعاليات واحفظ خططك واحجز التذاكر عند توفرها واحتفظ بحجوزاتك في مكان واحد. تابع أصدقاءك والمنظمين واعثر على فعاليات تناسب اهتماماتك واستفد من التذكيرات. قد يقدم تفاصيل الفعاليات وشروط التذاكر المنظمون أو مزودو التذاكر من جهات خارجية؛ راجع شروطهم قبل الشراء.

## Legal review

The privacy notice and terms in this release are product drafts, not legal advice. **UAE-qualified counsel must review and approve the legal text, account-deletion disclosures, paid-plan terms, and store privacy disclosures before public release.**
