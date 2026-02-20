import { Router } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { sendError, sendSuccess } from '../lib/response';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  forgotPasswordSchema,
} from '@alcom/shared/src/schemas/auth.schema';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  requireAuth,
} from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import logger from '../lib/logger';
import { z } from 'zod';
import { enqueueEmail } from '../jobs';

const router = Router();
const REFRESH_COOKIE_NAME = 'refresh_token';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min

// In-memory lockout map (Note: use Redis for production in multi-instance env)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// ─── LOGIN ───
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Check lockout
  const attempt = loginAttempts.get(email);
  if (attempt) {
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
      const timeRemaining = attempt.lastAttempt + LOCKOUT_DURATION_MS - Date.now();
      if (timeRemaining > 0) {
        // Log attempt during lockout
        await prisma.auditLog.create({
          data: {
            action: 'LOGIN_LOCKED',
            entityType: 'USER',
            entityId: email, // temp ID
            ipAddress: String(ip),
            user: { connect: undefined }, // No user connected yet
          },
        }).catch(() => {}); // Ignore audit error if user doesn't exist/can't connect

        sendError(res, {
          code: 'AUTH_LOCKED',
          message: `Account is locked. Try again in ${Math.ceil(timeRemaining / 60000)} minutes.`,
          statusCode: 429,
        });
        return;
      } else {
        // Reset lockout
        loginAttempts.delete(email);
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive || !user.passwordHash) {
    // Record failed attempt
    const current = loginAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
    loginAttempts.set(email, { count: current.count + 1, lastAttempt: Date.now() });

    sendError(res, {
      code: 'AUTH_INVALID',
      message: 'Invalid email or password',
      statusCode: 401,
    });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    const current = loginAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
    loginAttempts.set(email, { count: current.count + 1, lastAttempt: Date.now() });

    sendError(res, {
      code: 'AUTH_INVALID',
      message: 'Invalid email or password',
      statusCode: 401,
    });
    return;
  }

  // Success: Clear attempts
  loginAttempts.delete(email);

  // Generate tokens
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    stationId: user.assignedStationId,
  };

  const { token: accessToken } = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(user.id);

  // Audit Log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: String(ip),
    },
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Set cookie
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
  });

  sendSuccess(res, {
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.fullName.split(' ')[0], // simple split
        lastName: user.fullName.split(' ').slice(1).join(' '),
        role: user.role,
        stationId: user.assignedStationId,
      },
      accessToken,
    },
  });
});

// ─── REFRESH ───
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME] || req.body.refreshToken;

  if (!refreshToken) {
    sendError(res, {
      code: 'AUTH_MISSING_TOKEN',
      message: 'Refresh token required',
      statusCode: 401,
    });
    return;
  }

  try {
    const { userId } = verifyRefreshToken(refreshToken);

    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      res.clearCookie(REFRESH_COOKIE_NAME);
      sendError(res, {
        code: 'AUTH_INVALID_USER',
        message: 'User no longer active',
        statusCode: 401,
      });
      return;
    }

    // Rotate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      stationId: user.assignedStationId,
    };

    const { token: newAccessToken } = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(user.id);

    // Set new cookie
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, {
      data: { accessToken: newAccessToken },
    });
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE_NAME);
    sendError(res, {
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid refresh token',
      statusCode: 401,
    });
  }
});

// ─── LOGOUT ───
router.post('/logout', requireAuth, async (req, res) => {
  if (req.user) {
    // Revoke current access token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h roughly
    await prisma.revokedToken.create({
      data: {
        jti: req.user.jti,
        expiresAt,
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: req.user.userId,
        ipAddress: req.ip,
      },
    });
  }

  res.clearCookie(REFRESH_COOKIE_NAME);
  sendSuccess(res, { data: { message: 'Logged out successfully' } });
});

// ─── ME ───
router.get('/me', requireAuth, async (req, res) => {
  if (!req.user) return; // Should be caught by requireAuth

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      language: true,
      assignedStationId: true,
      assignedStation: { select: { name: true, code: true } },
      createdAt: true,
      lastLogin: true,
    },
  });

  if (!user) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    });
    return;
  }

  sendSuccess(res, { data: user });
});

// ─── FORGOT PASSWORD ───
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Generate reset token (random hex)
    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

    await enqueueEmail({
      to: email,
      subject: 'Réinitialisation du mot de passe ALCOM',
      template: 'password-reset',
      templateData: {
        name: user.fullName,
        resetUrl,
      },
    });

    logger.info(`[Forgot Password] Token for ${email}: ${token}`);
  }

  // Always return success
  sendSuccess(res, {
    data: { message: 'If the email exists, a reset link has been sent.' },
  });
});

// ─── RESET PASSWORD ───
// Need a custom schema validator adapter because schema expects verify fields
const resetSchemaSimple = z.object({
  token: z.string(),
  newPassword: z.string().min(10),
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = resetSchemaSimple.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      sendError(res, {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid or expired reset token',
        statusCode: 400,
      });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, { data: { message: 'Password reset successfully' } });
  } catch (error) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: error instanceof Error ? { message: error.message } : undefined,
      statusCode: 400,
    });
  }
});

export default router;
