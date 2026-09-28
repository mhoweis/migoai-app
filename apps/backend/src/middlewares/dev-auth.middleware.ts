// src/middlewares/dev-auth.middleware.ts
//
// Historically this middleware fell back to a hardcoded test user whenever a
// JWT was missing or invalid — in every environment, including production.
// That left every AI route open to the world on our own Gemini key.
//
// The fallback now requires BOTH:
//   1. NODE_ENV === 'development'
//   2. ALLOW_DEV_AUTH=true set explicitly
//
// Anywhere else, this behaves exactly like `authenticate` and returns 401.

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import config from '../config/env';
import logger from '../utils/logger';

export const DEV_USER = {
  id: 'test_user_123',
  email: 'test@migo.ai',
  name: 'Test User',
  displayName: 'Migo Tester',
  role: 'USER',
};

/** True only in local development with the escape hatch explicitly enabled. */
export function devAuthEnabled(): boolean {
  return config.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true';
}

export const devAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = await authService.validateToken(token);
      (req as any).user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
      (req as any).userId = decoded.userId;
      return next();
    } catch (error: any) {
      if (!devAuthEnabled()) {
        return res.status(401).json({
          success: false,
          error: error?.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
        });
      }
      logger.warn('dev-auth: invalid token accepted via development fallback');
    }
  }

  if (!devAuthEnabled()) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  // Local development only, and only when ALLOW_DEV_AUTH=true.
  (req as any).user = { ...DEV_USER };
  (req as any).userId = DEV_USER.id;
  next();
};

/**
 * Route guard for endpoints that must not exist outside local development.
 * Returns 404 (not 403) so the endpoint is invisible in staging/production.
 */
export const developmentOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!devAuthEnabled()) {
    return res.status(404).json({
      success: false,
      error: `Route ${req.originalUrl} not found`,
    });
  }
  next();
};
