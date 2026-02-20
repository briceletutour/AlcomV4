import { Router } from 'express';
import prisma from '../lib/prisma';
import { sendError, sendSuccess, sendPaginated } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuthWithBlacklistCheck } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createUserSchema,
  updateUserSchema,
  userListFiltersSchema,
} from '@alcom/shared/src/schemas/user.schema';
import { UserRole } from '@alcom/shared';
import bcrypt from 'bcrypt';
import { enqueueEmail } from '../jobs';

const router = Router();

// Apply auth to all routes
router.use(requireAuthWithBlacklistCheck);

// ─── LIST USERS ───
router.get('/', requireRole(UserRole.SUPER_ADMIN), validate(userListFiltersSchema, 'query'), async (req, res) => {
  const { page, limit, role, stationId, isActive, search } = req.query as any;

  const skip = (page - 1) * limit;

  const where: any = {
    deletedAt: null,
  };

  if (role) where.role = role;
  if (stationId) where.assignedStationId = stationId;
  if (typeof isActive !== 'undefined') where.isActive = isActive;

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        assignedStationId: true,
        assignedStation: {
          select: { name: true, code: true },
        },
        lastLogin: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  sendPaginated(res, users, total, page, limit);
});

// ─── GET USER ───
router.get('/:id', async (req, res) => {
  // Allow if admin or self
  if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.userId !== req.params.id) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Access denied',
      statusCode: 403,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      assignedStation: { select: { id: true, name: true, code: true } },
    },
  });

  if (!user || user.deletedAt) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    });
    return;
  }

  // Remove passwordHash
  const { passwordHash, ...cleanUser } = user;
  sendSuccess(res, { data: cleanUser });
});

// ─── CREATE USER (Invite) ───
router.post('/', requireRole(UserRole.SUPER_ADMIN), validate(createUserSchema), async (req, res) => {
  const { email, fullName, role, language, assignedStationId, lineManagerId } = req.body;

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    sendError(res, {
      code: 'DUPLICATE_EMAIL',
      message: 'Email already exists',
      statusCode: 400,
    });
    return;
  }

  // Verify station if provided
  if (assignedStationId) {
    const station = await prisma.station.findUnique({ where: { id: assignedStationId } });
    if (!station) {
      sendError(res, {
        code: 'INVALID_STATION',
        message: 'Station not found',
        statusCode: 400,
      });
      return;
    }
  }

  // Generate temp password
  const tempPassword = `Alcom${new Date().getFullYear()}!`;
  const hash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      role,
      language,
      assignedStationId,
      lineManagerId,
      passwordHash: hash,
    },
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: user.id,
      changes: req.body,
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  await enqueueEmail({
    to: email,
    subject: 'Invitation ALCOM V4',
    template: 'invite-user',
    templateData: {
      name: fullName,
      email,
      temporaryPassword: tempPassword,
      loginUrl: `${frontendUrl}/auth/login`,
    },
  });

  sendSuccess(res, {
    data: {
      user: { id: user.id, email: user.email },
      tempPassword, // Return for now until email works
    },
    statusCode: 201,
  });
});

// ─── UPDATE USER ───
router.put('/:id', requireRole(UserRole.SUPER_ADMIN), validate(updateUserSchema), async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updates,
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: id,
      changes: updates,
    },
  });

  // If role or station changed, consider revoking their tokens (via blacklist logic handled elsewhere or force logout)
  // For now, next time they refresh, we could check DB versions, but we don't track version on user yet.

  sendSuccess(res, { data: updated });
});

// ─── DELETE USER ───
router.delete('/:id', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const { id } = req.params;

  if (id === req.user!.userId) {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Cannot delete yourself',
      statusCode: 400,
    });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  // Audit
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'DELETE_USER',
      entityType: 'USER',
      entityId: id,
    },
  });

  sendSuccess(res, { data: { message: 'User deleted successfully' } });
});

// ─── SET DELEGATION ───
// POST /users/:id/delegate — Set backup approver for a user (for leave/vacation)
import { setDelegationSchema } from '@alcom/shared/src/schemas/user.schema';

router.post('/:id/delegate', requireRole(UserRole.SUPER_ADMIN), validate(setDelegationSchema), async (req, res) => {
  const { id } = req.params;
  const { backupApproverId, delegationStart, delegationEnd } = req.body;

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    });
    return;
  }

  // Verify backup approver exists
  const backupApprover = await prisma.user.findUnique({ where: { id: backupApproverId } });
  if (!backupApprover || backupApprover.deletedAt) {
    sendError(res, {
      code: 'BACKUP_NOT_FOUND',
      message: 'Backup approver not found',
      statusCode: 404,
    });
    return;
  }

  // Cannot delegate to self
  if (id === backupApproverId) {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Cannot delegate to yourself',
      statusCode: 400,
    });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      backupApproverId,
      delegationStart: new Date(delegationStart),
      delegationEnd: new Date(delegationEnd),
    },
    include: {
      backupApprover: { select: { id: true, fullName: true, email: true } },
    },
  });

  // Audit
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'SET_DELEGATION',
      entityType: 'USER',
      entityId: id,
      changes: { backupApproverId, delegationStart, delegationEnd },
    },
  });

  sendSuccess(res, {
    data: {
      message: 'Delegation set successfully',
      user: {
        id: updated.id,
        fullName: updated.fullName,
        backupApprover: updated.backupApprover,
        delegationStart: updated.delegationStart,
        delegationEnd: updated.delegationEnd,
      },
    },
  });
});

// DELETE /users/:id/delegate — Clear delegation
router.delete('/:id/delegate', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: {
      backupApproverId: null,
      delegationStart: null,
      delegationEnd: null,
    },
  });

  // Audit
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'CLEAR_DELEGATION',
      entityType: 'USER',
      entityId: id,
    },
  });

  sendSuccess(res, { data: { message: 'Delegation cleared successfully' } });
});

export default router;
