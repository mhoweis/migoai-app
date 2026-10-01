// src/app.ts - UPDATED WITH FIXED AI ROUTES
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Import routes
import { authRouter } from './routes/auth.routes';
import { eventsRouter } from './routes/events.routes';
import shareRouter from './routes/share.routes';
import { usersRouter } from './routes/users.routes';
import { aiRouter } from './routes/ai.routes';
import { paymentsRouter, publicPaymentsRouter } from './routes/payments.routes';
import externalEventsRouter from './routes/external-events.routes';
import wishlistsRouter from './routes/wishlists.routes';
import goRouter from './routes/go.routes';
import { adminRouter } from './routes/admin.routes';
import placesRouter from './routes/places.routes';
import bookingsRouter from './routes/bookings.routes';
import digestRouter, { digestHtmlRouter } from './routes/digest.routes';
import { uploadRouter } from './routes/upload.routes';
import { accountRouter } from './routes/account.routes';
import { supplierRouter } from './routes/supplier.routes';
import { suppliersRouter } from './routes/suppliers.routes';
import { reviewsRouter } from './routes/reviews.routes';
import { legalRouter } from './routes/legal.routes';
import config from './config/env';

// Import middleware
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { authenticate } from './middlewares/auth.middleware';

// Import Prisma instance
import prisma from './config/database';

// Initialize express app
const app = express();
// Replit terminates HTTPS at one proxy before forwarding requests to Express.
// Trust only that first hop so rate limiting uses the real client IP.
app.set('trust proxy', 1);

// The web client is served from a separate Replit port, so API responses must
// be readable cross-origin after the CORS middleware approves the request.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration for React Native mobile apps
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) {
      callback(null, true);
      return;
    }

    // List of allowed origins for React Native development
    const allowedOrigins = [
      // iOS Simulator & Physical iOS
      'http://localhost:8081',
      'http://127.0.0.1:8081',
      // Android Emulator
      'http://10.0.2.2:8081',
      'http://localhost:19006',
      // Expo Web
      'http://localhost:19006',
      'http://localhost:19000',
      // Production/Staging clients (add your domains here)
      process.env.CLIENT_URL,
    ].filter(Boolean); // Remove undefined values

    // Check if the origin is in allowed list or if we're in development
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (allowedOrigins.indexOf(origin) !== -1 || isDevelopment) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Authorization'], // Important for React Native to read custom headers
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Payment webhooks and mock checkout pages must receive requests before the
// global JSON parser and do not require user authentication.
app.use('/api/payments', publicPaymentsRouter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Coarse IP-based limiter as a backstop. This runs in EVERY environment —
// leaving it production-only meant staging had no limit at all. The limit that
// actually matters for AI routes is per-user and lives in ai-guard.middleware.
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '600'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
  // Health checks must not be throttled by a shared carrier NAT address.
  skip: (req) => req.path === '/health',
});
app.use('/api/', limiter);

// Logging - enhanced for debugging
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Set Prisma instance on the app for use in routes
app.set('prisma', prisma);

// Health check endpoint with more details
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'success',
      message: 'Migo Backend Server is running',
      timestamp: new Date().toISOString(),
    },
  });
});

// API Routes

// Public routes (no authentication required)
app.use('/api/auth', authRouter);
app.use('/e', shareRouter);
app.use('/digest', digestHtmlRouter);
app.use('/api/events', eventsRouter); // Assuming events are public for browsing
app.use('/api/suppliers', suppliersRouter);
app.use('/api/digest', digestRouter);
app.use('/api/uploads', express.static(config.UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true,
}));

// Protected routes (authentication required)
app.use('/api/users', usersRouter);
app.use('/api/reviews', authenticate, reviewsRouter);
app.use('/api/payments', authenticate, paymentsRouter);
app.use('/api/bookings', authenticate, bookingsRouter);
app.use('/api/account', accountRouter);
app.use('/api/supplier', supplierRouter);
app.use('/api/external-events', externalEventsRouter);
app.use('/api/wishlists', wishlistsRouter);

// Places — Google Maps venue discovery (auth enforced inside the router)
app.use('/api/places', placesRouter);
app.use('/api/upload', uploadRouter);

// Admin (authentication + ADMIN role enforced inside the router)
app.use('/api/admin', adminRouter);

// AI Routes — authentication, per-user rate limiting, quota and input guards
// are all applied inside the router (see ai.routes.ts).
app.use('/api/ai', aiRouter);

// Tracked affiliate click-out. Deliberately mounted outside /api so it can be
// opened directly in a browser, and outside the IP limiter above.
app.use('/go', goRouter);
app.use(legalRouter);

if (config.WEB_DIST_DIR && fs.existsSync(config.WEB_DIST_DIR)) {
  app.use(express.static(config.WEB_DIST_DIR, { index: false }));
  app.get(/.*/, (req, res, next) => {
    const isApiOrGo = req.path === '/api' || req.path.startsWith('/api/')
      || req.path === '/go' || req.path.startsWith('/go/');
    const isLegalPage = ['/privacy', '/terms', '/delete-account'].includes(req.path);
    if (isApiOrGo || isLegalPage || !req.accepts('html')) return next();
    res.sendFile(path.join(config.WEB_DIST_DIR, 'index.html'), error => {
      if (error) next(error);
    });
  });
}

// 404 handler for undefined routes
app.all(/.*/, (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
  });
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app;