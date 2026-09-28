// src/config/env.ts - UPDATED VERSION
import { z } from 'zod';

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
  UAE_GOV_MONTHS_AHEAD: z.coerce.number().int().min(1).default(6),
  YAS_ISLAND_COVEO_TOKEN: z.string().optional(),
  MOCK_EVENTS_PROVIDER: z.preprocess(
    value => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(false),
  ),
  SYNC_CITIES: z.string().default('Dubai,Abu Dhabi,Sharjah'),
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
  UAE_GOV_MONTHS_AHEAD: env.UAE_GOV_MONTHS_AHEAD,
  YAS_ISLAND_COVEO_TOKEN: env.YAS_ISLAND_COVEO_TOKEN || '',
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
  
  // Helpers
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
};