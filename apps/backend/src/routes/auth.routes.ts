// src/routes/auth.routes.ts - SIMPLIFIED
import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { authenticate } from '../middlewares/auth.middleware';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const sendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification codes requested. Please try again later.' },
});
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

router.post('/phone-signup/send-otp', sendOtpLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    await authService.sendPhoneSignupOtp(phone, name);
    res.json({ success: true, data: { expiresIn: 600 } });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/phone-signup/verify-otp', verifyOtpLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code, name } = req.body;
    if (!phone || !code) {
      res.status(400).json({ error: 'Phone number and verification code are required' });
      return;
    }

    const result = await authService.verifyPhoneSignupOtp(phone, code, name);
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isFirstLogin: true,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Register
router.post('/register', credentialLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }

    if (
      typeof password !== 'string'
      || password.length < MIN_PASSWORD_LENGTH
      || password.length > MAX_PASSWORD_LENGTH
    ) {
      res.status(400).json({
        error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      res.status(400).json({ error: 'Name must be at most 100 characters' });
      return;
    }
    
    const result = await authService.registerWithEmail(email, password, name);
    
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isFirstLogin: true,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Forgot password: emails a reset link. Always answers the same way so it
// can't be used to find out which emails have accounts.
router.post('/forgot-password', sendOtpLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  try {
    await authService.requestPasswordReset(email);
  } catch (error) {
    console.error('Password reset request failed:', error);
  }
  res.json({ success: true, data: { message: 'If an account exists for that email, a reset link is on its way.' } });
});

router.post('/reset-password', verifyOtpLimiter, async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (typeof token !== 'string' || !token || token.length > 2048) {
    res.status(400).json({ error: 'This reset link is invalid or has expired' });
    return;
  }
  if (
    typeof password !== 'string'
    || password.length < MIN_PASSWORD_LENGTH
    || password.length > MAX_PASSWORD_LENGTH
  ) {
    res.status(400).json({
      error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    });
    return;
  }
  try {
    await authService.resetPassword(token, password);
    res.json({ success: true, data: { message: 'Password updated' } });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'This reset link is invalid or has expired' });
  }
});

// Login
router.post('/login', credentialLimiter, async (req: Request, res: Response) => {
  try {
    const { identifier, email, phone, password } = req.body;
    const loginIdentifier = identifier || email || phone;
    
    if (
      typeof loginIdentifier !== 'string'
      || typeof password !== 'string'
      || !loginIdentifier
      || !password
      || password.length > MAX_PASSWORD_LENGTH
    ) {
      res.status(400).json({ error: 'Email or phone number and password are required' });
      return;
    }
    
    const result = await authService.loginWithIdentifier(loginIdentifier, password);
    
    // Check if user has interests
    const hasInterests = result.user.interests && Array.isArray(result.user.interests) && result.user.interests.length > 0;
    
    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isFirstLogin: !hasInterests,
      },
    });
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_PAUSED') {
      res.status(403).json({ success: false, error: 'Account paused', code: 'ACCOUNT_PAUSED' });
      return;
    }
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Refresh token
router.post('/refresh-token', refreshLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }
    
    const result = await authService.refreshAccessToken(refreshToken);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_PAUSED') {
      res.status(403).json({ success: false, error: 'Account paused', code: 'ACCOUNT_PAUSED' });
      return;
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: any, res: Response) => {
  try {
    // Get user from database
    const prisma = req.app.get('prisma');
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({
      success: true,
      data: authService.sanitizeUser(user),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update interests
router.put('/interests', authenticate, async (req: any, res: Response) => {
  try {
    const { interests } = req.body;
    
    if (
      !Array.isArray(interests)
      || interests.length < 3
      || interests.length > 50
      || !interests.every((i: unknown) => typeof i === 'string' && i.length <= 100)
    ) {
      res.status(400).json({ error: 'At least 3 interests are required' });
      return;
    }
    
    const prisma = req.app.get('prisma');
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        interests: interests as any,
        updatedAt: new Date(),
      },
    });
    
    res.json({
      success: true,
      data: authService.sanitizeUser(user),
    });
  } catch (error: any) {
    res.status(400).json({ error: 'Failed to update interests' });
  }
});

// Logout
router.post('/logout', authenticate, async (req: any, res: Response) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(
      req.userId,
      typeof refreshToken === 'string' ? refreshToken : undefined,
    );
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

export { router as authRouter };