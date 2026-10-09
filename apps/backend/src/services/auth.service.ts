// src/services/auth.service.ts - SIMPLIFIED WORKING VERSION
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config/env';
import prisma from '../config/database';
import { User, UserRole } from '@prisma/client';
import crypto from 'crypto';
import { smsService } from './sms.service';
import { emailService } from './messaging/email.service';
import logger from '../utils/logger';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  user: any;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export class AuthService {
  private jwtSecret = config.JWT_SECRET;
  private jwtRefreshSecret = config.JWT_REFRESH_SECRET;
  private static readonly REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  private static readonly REUSE_GRACE_MS = 60_000;

  private static readonly PASSWORD_RESET_TTL = '30m';

  // Reset links are signed with a key derived from JWT_SECRET so they can never
  // be used as access tokens, and they embed a fingerprint of the current
  // password hash so a link stops working once the password has changed.
  private passwordResetSecret(): string {
    return crypto.createHash('sha256').update(`password-reset:${this.jwtSecret}`).digest('hex');
  }

  private passwordFingerprint(user: Pick<User, 'id' | 'password'>): string {
    return crypto.createHash('sha256').update(`${user.id}:${user.password || ''}`).digest('hex').slice(0, 32);
  }

  // Always resolves without revealing whether the email has an account.
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (!user || user.status === 'DELETED' || !user.email) return;

    const token = jwt.sign(
      { sub: user.id, fp: this.passwordFingerprint(user), purpose: 'password_reset' },
      this.passwordResetSecret(),
      { expiresIn: AuthService.PASSWORD_RESET_TTL },
    );
    const base = (config.APP_PUBLIC_URL || config.CLIENT_URL).replace(/\/+$/, '');
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    if (!emailService.isConfigured()) {
      logger.warn('[auth] Password reset requested but email is not configured (set SENDGRID_API_KEY or SMTP_HOST)');
      if (config.NODE_ENV !== 'production') logger.info(`[auth] Password reset link for ${user.email}: ${link}`);
      return;
    }

    const name = user.name || 'there';
    try {
      await emailService.send({
        to: user.email,
        subject: 'Reset your Migo password',
        text: `Hi ${name},\n\nUse this link to choose a new Migo password. It expires in 30 minutes:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
        html: `<p>Hi ${name.replace(/[<>&"]/g, '')},</p><p>Use the button below to choose a new Migo password. The link expires in 30 minutes.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#D81B60;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p><p>If you didn't ask for this, you can ignore this email.</p>`,
      });
    } catch (error) {
      logger.error('[auth] Failed to send password reset email', error);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const invalid = () => new Error('This reset link is invalid or has expired');
    let payload: { sub?: string; fp?: string; purpose?: string };
    try {
      payload = jwt.verify(token, this.passwordResetSecret()) as typeof payload;
    } catch {
      throw invalid();
    }
    if (payload.purpose !== 'password_reset' || !payload.sub || !payload.fp) throw invalid();

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'DELETED' || this.passwordFingerprint(user) !== payload.fp) {
      throw invalid();
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true, expiresAt: new Date() },
      }),
    ]);
  }

  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private normalizePhone(phone: string): string {
    const normalized = phone.trim().replace(/[^\d+]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error('Enter a valid phone number with country code, such as +971501234567');
    }
    return normalized;
  }

  private hashOtp(phone: string, code: string): string {
    return crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${phone}:${code}`)
      .digest('hex')
      .slice(0, 10);
  }

  async sendPhoneSignupOtp(phone: string, name?: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phone);
    const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

    if (existingUser?.phoneVerified) {
      throw new Error('Phone number already registered');
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const verificationData = {
      name: name?.trim() || existingUser?.name || normalizedPhone,
      phoneVerificationCode: this.hashOtp(normalizedPhone, code),
      phoneVerificationExpires: new Date(Date.now() + 10 * 60 * 1000),
      authMethod: 'phone_otp',
    };

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: verificationData,
      });
    } else {
      await prisma.user.create({
        data: {
          phone: normalizedPhone,
          role: UserRole.USER,
          ...verificationData,
        },
      });
    }

    try {
      await smsService.sendVerificationCode(normalizedPhone, code);
    } catch (error) {
      await prisma.user.update({
        where: { phone: normalizedPhone },
        data: {
          phoneVerificationCode: null,
          phoneVerificationExpires: null,
        },
      });
      throw error;
    }
  }

  async verifyPhoneSignupOtp(phone: string, code: string, name?: string): Promise<AuthResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    const suppliedHash = this.hashOtp(normalizedPhone, code.trim());

    if (
      !user
      || !user.phoneVerificationCode
      || !user.phoneVerificationExpires
      || user.phoneVerificationExpires.getTime() < Date.now()
      || !crypto.timingSafeEqual(
        Buffer.from(user.phoneVerificationCode),
        Buffer.from(suppliedHash)
      )
    ) {
      throw new Error('Invalid or expired verification code');
    }

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name?.trim() || user.name,
        phoneVerified: true,
        isVerified: true,
        phoneVerificationCode: null,
        phoneVerificationExpires: null,
        lastLoginAt: new Date(),
      },
    });

    return {
      user: this.sanitizeUser(verifiedUser),
      tokens: await this.generateTokens(verifiedUser),
    };
  }
  
  // Register with at least one login identifier: email address or phone number.
  async registerWithEmail(email: string | undefined, password: string, name?: string, phone?: string): Promise<AuthResponse> {
    const normalizedEmail = email?.trim().toLowerCase() || undefined;
    const normalizedPhone = phone ? this.normalizePhone(phone) : undefined;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
        ]
      }
    });
    
    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw new Error('Email already registered');
      }
      if (normalizedPhone && existingUser.phone === normalizedPhone) {
        throw new Error('Phone number already registered');
      }
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail || null,
        password: hashedPassword,
        name: name || normalizedEmail?.split('@')[0] || normalizedPhone,
        phone: normalizedPhone || null,
        role: UserRole.USER,
      }
    });
    
    // Generate tokens
    const tokens = await this.generateTokens(user);
    
    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }
  
  // Login with either email address or phone number.
  async loginWithIdentifier(identifier: string, password: string): Promise<AuthResponse> {
    const value = identifier.trim();
    const normalizedEmail = value.toLowerCase();
    const normalizedPhone = value.includes('@') ? undefined : this.normalizePhone(value);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { phone: value },
          ...(normalizedPhone && normalizedPhone !== value ? [{ phone: normalizedPhone }] : []),
        ],
      },
    });
    
    if (!user || user.status === 'DELETED' || !user.password) {
      throw new Error('Invalid credentials');
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }
    if (user.status === 'PAUSED') {
      throw Object.assign(new Error('Account paused'), { code: 'ACCOUNT_PAUSED' });
    }
    
    // Update last login
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      }
    });
    
    const tokens = await this.generateTokens(updatedUser);
    
    return {
      user: this.sanitizeUser(updatedUser),
      tokens,
    };
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    return this.loginWithIdentifier(email, password);
  }
  
  // Generate tokens
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email || '', // Handle null email
      role: user.role,
    };
    
    // Generate access token
    const accessToken = this.signAccessToken(payload);
    
    const refreshToken = await this.issueRefreshToken(user.id);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }
  
  private signAccessToken(payload: JwtPayload): string {
    return jwt.sign({ ...payload, type: 'access' }, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const refreshToken = jwt.sign(
      { userId, type: 'refresh', jti: crypto.randomUUID() },
      this.jwtRefreshSecret,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    // Prune rows that can never be presented again so the table does not grow
    // unboundedly with active usage.
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true, updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }).catch(() => undefined);

    await prisma.refreshToken.create({
      data: {
        userId,
        token: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + AuthService.REFRESH_TTL_MS),
      },
    });

    return refreshToken;
  }

  // Refresh access token. Refresh tokens are single-use: each call revokes the
  // presented token and issues a new one. Reuse of a revoked token revokes
  // every session for that user.
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret, {
        algorithms: ['HS256'],
      }) as { userId: string; type: string };
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const stored = await prisma.refreshToken.findUnique({
        where: { token: this.hashRefreshToken(refreshToken) },
      });

      if (!stored || stored.userId !== decoded.userId) {
        throw new Error('Unknown refresh token');
      }

      if (stored.expiresAt.getTime() < Date.now()) {
        throw new Error('Refresh token expired');
      }

      if (stored.revoked) {
        // Concurrent-refresh grace: two parallel requests can present the same
        // token within seconds of rotation (the mobile interceptor refreshes
        // per 401). Treat very recent reuse as a race and issue a fresh pair
        // below instead of revoking every session.
        if (Date.now() - stored.updatedAt.getTime() > AuthService.REUSE_GRACE_MS) {
          await prisma.refreshToken.updateMany({
            where: { userId: stored.userId, revoked: false },
            data: { revoked: true, expiresAt: new Date() },
          });
          throw new Error('Refresh token reuse detected');
        }
      } else {
        const { count } = await prisma.refreshToken.updateMany({
          where: { id: stored.id, revoked: false },
          data: { revoked: true },
        });
        if (count === 0) {
          // Same race within the same instant — fall through and issue a pair.
        }
      }
      
      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      
      if (!user || user.status === 'DELETED') {
        throw new Error('User not found');
      }
      if (user.status === 'PAUSED') {
        throw Object.assign(new Error('Account paused'), { code: 'ACCOUNT_PAUSED' });
      }
      
      // Generate new access token
      const payload: JwtPayload = {
        userId: user.id,
        email: user.email || '',
        role: user.role,
      };
      
      const accessToken = this.signAccessToken(payload);
      const newRefreshToken = await this.issueRefreshToken(user.id);
      
      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 15 * 60,
      };
    } catch (error: any) {
      if (error?.code === 'ACCOUNT_PAUSED') {
        throw error;
      }
      throw new Error('Invalid refresh token');
    }
  }
  
  // Logout
  async logout(userId: string, refreshToken?: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: refreshToken
        ? { userId, token: this.hashRefreshToken(refreshToken) }
        : { userId },
      data: { revoked: true, expiresAt: new Date() },
    });

    // Update user last active
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() }
    });
  }
  
  // Validate token
  async validateToken(token: string): Promise<JwtPayload> {
    const decoded = jwt.verify(token, this.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload & { type?: string };
    if (decoded.type === 'refresh') {
      throw new jwt.JsonWebTokenError('Invalid token type');
    }
    return decoded;
  }
  
  // Helper methods
  sanitizeUser(user: User): any {
    const {
      password,
      phoneVerificationCode,
      phoneVerificationExpires,
      ...safeUser
    } = user;
    return safeUser;
  }
  
  // Update interests
  async updateInterests(userId: string, interests: string[]): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        interests: interests as any, // Cast to Prisma JsonValue
        updatedAt: new Date(),
      }
    });
    
    return user;
  }
}

export const authService = new AuthService();