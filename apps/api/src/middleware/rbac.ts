import { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/response';
import { UserRole } from '@alcom/shared';

// ─── Role Hierarchy ───
const ROLE_LEVELS: Record<string, number> = {
  [UserRole.POMPISTE]: 1,
  [UserRole.CHEF_PISTE]: 2,
  [UserRole.STATION_MANAGER]: 3,
  [UserRole.LOGISTICS]: 4,
  [UserRole.DCO]: 5,
  [UserRole.FINANCE_DIR]: 6,
  [UserRole.CFO]: 7,
  [UserRole.CEO]: 8,
  [UserRole.SUPER_ADMIN]: 99,
};

export function isRoleAtLeast(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_LEVELS[userRole] || 0;
  const reqLevel = ROLE_LEVELS[requiredRole] || 99;
  return userLevel >= reqLevel;
}

/**
 * Require specific roles to access an endpoint.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
        statusCode: 401,
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        statusCode: 403,
      });
      return;
    }

    next();
  };
}

/**
 * Ensure station-scoped users can only access their own station's data.
 */
export function requireStationAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
      statusCode: 401,
    });
    return;
  }

  // Global roles can access all stations
  const globalRoles: string[] = [
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.FINANCE_DIR,
    UserRole.LOGISTICS,
    UserRole.DCO,
  ];

  if (globalRoles.includes(req.user.role)) {
    next();
    return;
  }

  // Station-scoped roles must match
  const requestedStationId =
    req.params.stationId || req.body?.stationId || req.query?.stationId;

  if (requestedStationId && req.user.stationId !== requestedStationId) {
    sendError(res, {
      code: 'FORBIDDEN_STATION',
      message: 'Access denied to this station',
      statusCode: 403,
    });
    return;
  }

  next();
}

/**
 * Allow user to access only their own resource (or admin).
 */
export function requireSelfOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
      statusCode: 401,
    });
    return;
  }

  const targetUserId = req.params.userId || req.params.id;

  if (req.user.role === UserRole.SUPER_ADMIN || req.user.userId === targetUserId) {
    next();
    return;
  }

  sendError(res, {
    code: 'FORBIDDEN',
    message: 'Access denied',
    statusCode: 403,
  });
}
