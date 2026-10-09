// src/config/env.ts - UPDATED VERSION
import { z } from 'zod';
import path from 'path';

// Environment schema with sensible defaults
const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('5000'),
  SUPABASE_DATABASE_URL: z.string().min(1, 'SUPABASE_DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  TICKET_SIGNING_SECRET: z.string().optional(),
  
  // Optional with defaults
  COOKIE_SECRET: z.string().default('dev-cookie-secret'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  APP_PUBLIC_URL: z.string().default(''),
  WEB_DIST_DIR: z.string().default(''),
  UPLOADS_DIR: z.string().default(path.resolve(__dirname, '../../uploads')),
  SUPPORT_EMAIL: z.string().email().default('support@migoapp.com'),
  APP_STORE_URL: z.string().default(''),
  PLAY_STORE_URL: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(600),

  // Development auth escape hatch. The dev-user fallback on AI routes is only
  // available when NODE_ENV=development AND this is explicitly 'true'.
  ALLOW_DEV_AUTH: z.enum(['true', 'false']).default('false'),

  // AI cost governance (see services/llm-budget.service.ts)
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  AI_GLOBAL_DAILY_CAP_USD: z.coerce.number().default(30),
  AI_GLOBAL_WARN_RATIO: z.coerce.number().default(0.8),
  AI_FREE_DAILY_MESSAGES: z.coerce.number().default(20),
  AI_FREE_DAILY_TOKENS: z.coerce.number().default(60000),
  AI_PLUS_DAILY_MESSAGES: z.coerce.number().default(300),
  AI_PLUS_DAILY_TOKENS: z.coerce.number().default(1000000),
  AI_INPUT_COST_PER_MTOK: z.coerce.number().default(0.3),
  AI_OUTPUT_COST_PER_MTOK: z.coerce.number().default(2.5),
  AI_BURST_MAX: z.coerce.number().default(5),
  AI_BURST_WINDOW_MS: z.coerce.number().default(60000),
  AI_MAX_INPUT_CHARS: z.coerce.number().default(1000),

  // Places / Google Maps scraper
  SCRAPER_BASE_URL: z.string().default('http://localhost:8080'),
  SCRAPER_API_KEY: z.string().default(''),
  SCRAPER_PROXIES: z.string().default(''),
  PLACES_WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
  PLACES_CACHE_TTL_HOURS: z.coerce.number().default(336),
  PLACES_SEARCH_MAX_PER_HOUR: z.coerce.number().default(20),
  PLACES_JOB_COOLDOWN_MS: z.coerce.number().default(20000),
  PLACES_MAX_ATTEMPTS: z.coerce.number().default(3),
  GEOCODE_COUNTRY_CODES: z.string().default('ae'),

  // Affiliates
  PLATINUMLIST_AFF_REF: z.string().default('nmu2yjg'),
  PLATINUMLIST_SUBID_PARAM: z.string().default(''),
  IP_HASH_SALT: z.string().default('migo-dev-salt'),
  
  // Optional APIs
  GEMINI_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_REMINDERS_CRON: z.string().default('0 5 * * *'),
  WHATSAPP_REMINDER_TEMPLATE: z.string().optional(),
  REMINDERS_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(15),
  WEEKEND_DIGEST_CRON: z.string().default('0 6 * * 4'),
  HOST_PLAN_PRICE_AED: z.coerce.number().positive().default(99),
  SUPPLIER_PLAN_PRICE_AED: z.coerce.number().positive().default(499),
  SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS: z.enum(['true', 'false']).default('false'),

  // Event Data APIs
  TICKETMASTER_API_KEY: z.string().optional(),
  TICKETMASTER_MAX_PAGES: z.coerce.number().int().min(1).default(3),
  EVENTBRITE_API_KEY: z.string().optional(),
  EVENTBRITE_PRIVATE_TOKEN: z.string().optional(),
  EVENTBRITE_ORGANIZATION_IDS: z.string().default(''),
  DISCOVERY_PROVIDERS_DISABLED: z.string().default(''),
  EXPO_CITY_CONTENTFUL_TOKEN: z.string().optional(),
  VISIT_DUBAI_ALGOLIA_APP_ID: z.string().optional(),
  VISIT_DUBAI_ALGOLIA_API_KEY: z.string().optional(),
  VISIT_DUBAI_ALGOLIA_INDEX: z.string().default('prod104_vd_en'),
  TOURISM_CRAWL_ENABLED: z.preprocess(
    value => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(true),
  ),
  TOURISM_CRAWL_INTERVAL_HOURS: z.coerce.number().int().min(1).default(168),
  TOURISM_MAX_PAGES_PER_SITE: z.coerce.number().int().min(1).default(150),
  TOURISM_MAX_AR_PAGES_PER_SITE: z.coerce.number().int().min(1).default(60),
  DIFC_ALGOLIA_APP_ID: z.string().optional(),
  DIFC_ALGOLIA_API_KEY: z.string().optional(),
  UAE_GOV_MONTHS_AHEAD: z.coerce.number().int().min(1).default(6),
  YAS_ISLAND_COVEO_TOKEN: z.string().optional(),
  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_CERT_PEM: z.string().optional(),
  APPLE_PASS_KEY_PEM: z.string().optional(),
  APPLE_WWDR_PEM: z.string().optional(),
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_WALLET_PRIVATE_KEY: z.string().optional(),
  MOCK_EVENTS_PROVIDER: z.preprocess(
    value => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(false),
  ),
  SYNC_CITIES: z.string().default('Dubai,Abu Dhabi,Sharjah,Ras Al Khaimah'),
  EVENT_SYNC_INTERVAL_MINUTES: z.coerce.number().min(0).default(60),
  EVENT_SYNC_ON_BOOT: z.preprocess(
    value => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(true),
  ),
  PREDICTHQ_ACCESS_TOKEN: z.string().optional(),
  PLATINUMLIST_API_KEY: z.string().optional(),
  MEETUP_API_KEY: z.string().optional(),

  // Location APIs
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Optional services
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional(),
  EMAIL_SERVER_HOST: z.string().optional(),
  EMAIL_SERVER_PORT: z.string().optional(),
  EMAIL_SERVER_USER: z.string().optional(),
  EMAIL_SERVER_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Migo <no-reply@migo.ae>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
});

// Parse and export
const env = envSchema.parse(process.env);

const INSECURE_SECRET_VALUES = new Set([
  'replace_me',
  'replace_me_with_random_string',
  'dev-cookie-secret',
  'migo-dev-salt',
]);

if (env.NODE_ENV === 'production') {
  const secrets = {
    JWT_SECRET: env.JWT_SECRET,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
    COOKIE_SECRET: env.COOKIE_SECRET,
    IP_HASH_SALT: env.IP_HASH_SALT,
  };
  for (const [name, value] of Object.entries(secrets)) {
    if (value.length < 32 || INSECURE_SECRET_VALUES.has(value)) {
      throw new Error(`${name} must be set to a random value of at least 32 characters in production`);
    }
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (env.ALLOW_DEV_AUTH === 'true') {
    throw new Error('ALLOW_DEV_AUTH must not be enabled in production');
  }
  if (!env.STRIPE_SECRET_KEY?.trim()) {
    console.warn('⚠️  STRIPE_SECRET_KEY is not set — paid checkouts are disabled until it is');
  }
  let publicUrl: URL;
  try {
    publicUrl = new URL(env.APP_PUBLIC_URL);
  } catch {
    throw new Error('APP_PUBLIC_URL must be a valid public URL in production');
  }
  if (!['http:', 'https:'].includes(publicUrl.protocol)) {
    throw new Error('APP_PUBLIC_URL must use http or https in production');
  }
  if (env.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS === 'true') {
    throw new Error('SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS must not be enabled in production');
  }
}

// Helper function to get app URL
const getAppUrl = () => {
  const port = parseInt(env.PORT, 10);
  return `http://localhost:${port}`;
};

export default {
  // Application
  NODE_ENV: env.NODE_ENV,
  PORT: parseInt(env.PORT, 10),
  APP_URL: getAppUrl(),
  CLIENT_URL: env.CLIENT_URL,
  APP_PUBLIC_URL: env.APP_PUBLIC_URL,
  WEB_DIST_DIR: env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : '',
  UPLOADS_DIR: path.resolve(env.UPLOADS_DIR),
  SUPPORT_EMAIL: env.SUPPORT_EMAIL,
  APP_STORE_URL: env.APP_STORE_URL,
  PLAY_STORE_URL: env.PLAY_STORE_URL,
  
  // Database
  DATABASE_URL: env.SUPABASE_DATABASE_URL,
  
  // Authentication
  JWT_SECRET: env.JWT_SECRET,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
  TICKET_SIGNING_SECRET: env.TICKET_SIGNING_SECRET || env.JWT_SECRET,
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  COOKIE_SECRET: env.COOKIE_SECRET,
  
  // AI governance
  ALLOW_DEV_AUTH: env.ALLOW_DEV_AUTH === 'true',
  GEMINI_MODEL: env.GEMINI_MODEL,
  AI_GLOBAL_DAILY_CAP_USD: env.AI_GLOBAL_DAILY_CAP_USD,

  // Places
  SCRAPER_BASE_URL: env.SCRAPER_BASE_URL,
  PLACES_WORKER_ENABLED: env.PLACES_WORKER_ENABLED === 'true',

  // Affiliates
  PLATINUMLIST_AFF_REF: env.PLATINUMLIST_AFF_REF,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: env.RATE_LIMIT_MAX_REQUESTS,
  
  // Redis
  REDIS_URL: env.REDIS_URL,
  
  // APIs
  GEMINI_API_KEY: env.GEMINI_API_KEY || '',
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY || '',
  STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || '',
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET || '',
  WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_REMINDERS_CRON: env.WHATSAPP_REMINDERS_CRON,
  WHATSAPP_REMINDER_TEMPLATE: env.WHATSAPP_REMINDER_TEMPLATE || '',
  REMINDERS_INTERVAL_MINUTES: env.REMINDERS_INTERVAL_MINUTES,
  WEEKEND_DIGEST_CRON: env.WEEKEND_DIGEST_CRON,
  HOST_PLAN_PRICE_AED: env.HOST_PLAN_PRICE_AED,
  SUPPLIER_PLAN_PRICE_AED: env.SUPPLIER_PLAN_PRICE_AED,
  SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS: env.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS === 'true',

  // Event Data APIs
  TICKETMASTER_API_KEY: env.TICKETMASTER_API_KEY || '',
  TICKETMASTER_MAX_PAGES: env.TICKETMASTER_MAX_PAGES,
  EVENTBRITE_API_KEY: env.EVENTBRITE_API_KEY || '',
  EVENTBRITE_PRIVATE_TOKEN: env.EVENTBRITE_PRIVATE_TOKEN || '',
  EVENTBRITE_ORGANIZATION_IDS: env.EVENTBRITE_ORGANIZATION_IDS
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  DISCOVERY_PROVIDERS_DISABLED: env.DISCOVERY_PROVIDERS_DISABLED
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  EXPO_CITY_CONTENTFUL_TOKEN: env.EXPO_CITY_CONTENTFUL_TOKEN || '',
  VISIT_DUBAI_ALGOLIA_APP_ID: env.VISIT_DUBAI_ALGOLIA_APP_ID || '',
  VISIT_DUBAI_ALGOLIA_API_KEY: env.VISIT_DUBAI_ALGOLIA_API_KEY || '',
  VISIT_DUBAI_ALGOLIA_INDEX: env.VISIT_DUBAI_ALGOLIA_INDEX,
  TOURISM_CRAWL_ENABLED: env.TOURISM_CRAWL_ENABLED,
  TOURISM_CRAWL_INTERVAL_HOURS: env.TOURISM_CRAWL_INTERVAL_HOURS,
  TOURISM_MAX_PAGES_PER_SITE: env.TOURISM_MAX_PAGES_PER_SITE,
  TOURISM_MAX_AR_PAGES_PER_SITE: env.TOURISM_MAX_AR_PAGES_PER_SITE,
  DIFC_ALGOLIA_APP_ID: env.DIFC_ALGOLIA_APP_ID || '',
  DIFC_ALGOLIA_API_KEY: env.DIFC_ALGOLIA_API_KEY || '',
  UAE_GOV_MONTHS_AHEAD: env.UAE_GOV_MONTHS_AHEAD,
  YAS_ISLAND_COVEO_TOKEN: env.YAS_ISLAND_COVEO_TOKEN || '',
  APPLE_PASS_TYPE_ID: env.APPLE_PASS_TYPE_ID || '',
  APPLE_TEAM_ID: env.APPLE_TEAM_ID || '',
  APPLE_PASS_CERT_PEM: env.APPLE_PASS_CERT_PEM || '',
  APPLE_PASS_KEY_PEM: env.APPLE_PASS_KEY_PEM || '',
  APPLE_WWDR_PEM: env.APPLE_WWDR_PEM || '',
  GOOGLE_WALLET_ISSUER_ID: env.GOOGLE_WALLET_ISSUER_ID || '',
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_WALLET_PRIVATE_KEY: env.GOOGLE_WALLET_PRIVATE_KEY || '',
  MOCK_EVENTS_PROVIDER: env.MOCK_EVENTS_PROVIDER,
  SYNC_CITIES: env.SYNC_CITIES.split(',').map(value => value.trim()).filter(Boolean),
  EVENT_SYNC_INTERVAL_MINUTES: env.EVENT_SYNC_INTERVAL_MINUTES,
  EVENT_SYNC_ON_BOOT: env.EVENT_SYNC_ON_BOOT,
  PREDICTHQ_ACCESS_TOKEN: env.PREDICTHQ_ACCESS_TOKEN || '',
  PLATINUMLIST_API_KEY: env.PLATINUMLIST_API_KEY || '',
  MEETUP_API_KEY: env.MEETUP_API_KEY || '',

  // Location APIs
  GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY || '',
  MAPBOX_ACCESS_TOKEN: env.MAPBOX_ACCESS_TOKEN || '',
  
  // Optional services
  FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: env.FIREBASE_PRIVATE_KEY || '',
  TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: env.TWILIO_PHONE_NUMBER || '',
  SENDGRID_API_KEY: env.SENDGRID_API_KEY || '',
  FROM_EMAIL: env.FROM_EMAIL || 'noreply@migo-events.com',
  EMAIL_SERVER_HOST: env.EMAIL_SERVER_HOST || '',
  EMAIL_SERVER_PORT: env.EMAIL_SERVER_PORT || '',
  EMAIL_SERVER_USER: env.EMAIL_SERVER_USER || '',
  EMAIL_SERVER_PASSWORD: env.EMAIL_SERVER_PASSWORD || '',
  EMAIL_FROM: env.EMAIL_FROM,
  SMTP_HOST: env.SMTP_HOST || env.EMAIL_SERVER_HOST || '',
  SMTP_PORT: env.SMTP_PORT ?? Number(env.EMAIL_SERVER_PORT || 587),
  SMTP_USER: env.SMTP_USER || env.EMAIL_SERVER_USER || '',
  SMTP_PASS: env.SMTP_PASS || env.EMAIL_SERVER_PASSWORD || '',
  SMTP_SECURE: env.SMTP_SECURE === undefined ? undefined : env.SMTP_SECURE === 'true',
  
  // Helpers
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
};