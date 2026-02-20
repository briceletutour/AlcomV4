import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { sendError } from '../lib/response';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  stationId: string | null;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, {
      code: 'AUTH_MISSING_TOKEN',
      message: 'Authentication required',
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    sendError(res, {
      code: 'AUTH_MISSING_TOKEN',
      message: 'Authentication required',
      statusCode: 401,
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    sendError(res, {
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}

export async function requireAuthWithBlacklistCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  requireAuth(req, res, async () => {
    if (!req.user) return;

    // Check if token is revoked
    const revoked = await prisma.revokedToken.findUnique({
      where: { jti: req.user.jti },
    });

    if (revoked) {
      sendError(res, {
        code: 'AUTH_TOKEN_REVOKED',
        message: 'Token has been revoked',
        statusCode: 401,
      });
      return;
    }

    next();
  });
}

export function generateAccessToken(payload: Omit<JwtPayload, 'jti'>): { token: string; jti: string } {
  const jti = require('uuid').v4();
  const token = jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: '1h' });
  return { token, jti };
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
}
