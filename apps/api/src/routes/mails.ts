import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendError, sendPaginated, sendSuccess, getParam } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import {
  UserRole,
  createMailSchema,
  assignMailSchema,
  respondMailSchema,
  mailListFiltersSchema,
} from '@alcom/shared';
import { requireRole } from '../middleware/rbac';
import logger from '../lib/logger';

const router: Router = Router();

router.use(requireAuth);

function computeSlaState(deadline: Date): 'ON_TIME' | 'DUE_SOON' | 'OVERDUE' {
  const now = Date.now();
  const deadlineMs = deadline.getTime();

  if (deadlineMs < now) {
    return 'OVERDUE';
  }

  const hoursUntilDeadline = (deadlineMs - now) / (1000 * 60 * 60);
  if (hoursUntilDeadline <= 24) {
    return 'DUE_SOON';
  }

  return 'ON_TIME';
}

function computeDeadline(receivedAt: Date, priority: 'NORMAL' | 'URGENT'): Date {
  const deadline = new Date(receivedAt);

  if (priority === 'URGENT') {
    deadline.setHours(deadline.getHours() + 24);
    return deadline;
  }

  deadline.setDate(deadline.getDate() + 5);
  return deadline;
}

// GET /mails
router.get('/', validateQuery(mailListFiltersSchema), async (req: Request, res: Response) => {
  try {
    const { page, limit, status, priority, department, startDate, endDate } = req.query as unknown as {
      page: number;
      limit: number;
      status?: 'RECEIVED' | 'IN_PROGRESS' | 'RESPONDED' | 'ARCHIVED';
      priority?: 'NORMAL' | 'URGENT';
      department?: string;
      startDate?: string;
      endDate?: string;
    };

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (department) where.recipientDepartment = department;
    if (startDate || endDate) {
      where.receivedAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [mails, total] = await Promise.all([
      prisma.incomingMail.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.incomingMail.count({ where }),
    ]);

    const data = mails.map((mail) => ({
      ...mail,
      slaState: computeSlaState(mail.deadline),
    }));

    sendPaginated(res, data, total, page, limit);
  } catch (error) {
    logger.error(`Error listing mails: ${error}`);
    sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to list incoming mails',
      statusCode: 500,
    });
  }
});

// GET /mails/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const mail = await prisma.incomingMail.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!mail) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Incoming mail not found',
        statusCode: 404,
      });
      return;
    }

    sendSuccess(res, {
      data: {
        ...mail,
        slaState: computeSlaState(mail.deadline),
      },
    });
  } catch (error) {
    logger.error(`Error getting mail: ${error}`);
    sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to get incoming mail',
      statusCode: 500,
    });
  }
});

// POST /mails
router.post(
  '/',
  requireRole(
    UserRole.CHEF_PISTE,
    UserRole.STATION_MANAGER,
    UserRole.FINANCE_DIR,
    UserRole.CFO,
    UserRole.CEO,
    UserRole.DCO,
    UserRole.LOGISTICS,
    UserRole.SUPER_ADMIN,
  ),
  validate(createMailSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        sender,
        subject,
        receivedAt,
        priority,
        recipientDepartment,
        attachmentUrl,
      } = req.body;

      const receivedAtDate = new Date(receivedAt);
      const deadline = computeDeadline(receivedAtDate, priority);

      const created = await prisma.incomingMail.create({
        data: {
          sender,
          subject,
          receivedAt: receivedAtDate,
          priority,
          recipientDepartment,
          deadline,
          status: 'RECEIVED',
          slaState: computeSlaState(deadline),
          attachmentUrl: attachmentUrl || null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'CREATE_MAIL',
          entityType: 'IncomingMail',
          entityId: created.id,
          changes: {
            sender,
            subject,
            priority,
            recipientDepartment,
            deadline: deadline.toISOString(),
          },
        },
      });

      sendSuccess(res, {
        data: {
          ...created,
          slaState: computeSlaState(created.deadline),
        },
        statusCode: 201,
      });
    } catch (error) {
      logger.error(`Error creating mail: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create incoming mail',
        statusCode: 500,
      });
    }
  },
);

// PUT /mails/:id/assign
router.put(
  '/:id/assign',
  requireRole(
    UserRole.CHEF_PISTE,
    UserRole.STATION_MANAGER,
    UserRole.FINANCE_DIR,
    UserRole.CFO,
    UserRole.CEO,
    UserRole.DCO,
    UserRole.LOGISTICS,
    UserRole.SUPER_ADMIN,
  ),
  validate(assignMailSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const { assignedToId } = req.body;

      const [mail, assignee] = await Promise.all([
        prisma.incomingMail.findUnique({ where: { id } }),
        prisma.user.findUnique({ where: { id: assignedToId, isActive: true } }),
      ]);

      if (!mail) {
        sendError(res, {
          code: 'NOT_FOUND',
          message: 'Incoming mail not found',
          statusCode: 404,
        });
        return;
      }

      if (!assignee) {
        sendError(res, {
          code: 'NOT_FOUND',
          message: 'Assignee not found',
          statusCode: 404,
        });
        return;
      }

      if (mail.status === 'ARCHIVED') {
        sendError(res, {
          code: 'INVALID_STATUS',
          message: 'Cannot assign archived mail',
          statusCode: 400,
        });
        return;
      }

      const updated = await prisma.incomingMail.update({
        where: { id },
        data: {
          assignedToId,
          status: mail.status === 'RECEIVED' ? 'IN_PROGRESS' : mail.status,
          slaState: computeSlaState(mail.deadline),
        },
        include: {
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await Promise.all([
        prisma.auditLog.create({
          data: {
            userId: req.user!.userId,
            action: 'ASSIGN_MAIL',
            entityType: 'IncomingMail',
            entityId: id,
            changes: { assignedToId },
          },
        }),
        prisma.notification.create({
          data: {
            userId: assignedToId,
            type: 'MAIL_ASSIGNED',
            title: 'Incoming mail assigned',
            message: `A new incoming mail has been assigned to you: ${updated.subject}`,
            link: `/admin/mails/${updated.id}`,
          },
        }),
      ]);

      sendSuccess(res, {
        data: {
          ...updated,
          slaState: computeSlaState(updated.deadline),
        },
      });
    } catch (error) {
      logger.error(`Error assigning mail: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to assign incoming mail',
        statusCode: 500,
      });
    }
  },
);

// PUT /mails/:id/respond
router.put(
  '/:id/respond',
  requireRole(
    UserRole.CHEF_PISTE,
    UserRole.STATION_MANAGER,
    UserRole.FINANCE_DIR,
    UserRole.CFO,
    UserRole.CEO,
    UserRole.DCO,
    UserRole.LOGISTICS,
    UserRole.SUPER_ADMIN,
  ),
  validate(respondMailSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');

      const existing = await prisma.incomingMail.findUnique({ where: { id } });
      if (!existing) {
        sendError(res, {
          code: 'NOT_FOUND',
          message: 'Incoming mail not found',
          statusCode: 404,
        });
        return;
      }

      if (existing.status === 'ARCHIVED') {
        sendError(res, {
          code: 'INVALID_STATUS',
          message: 'Cannot respond to archived mail',
          statusCode: 400,
        });
        return;
      }

      const updated = await prisma.incomingMail.update({
        where: { id },
        data: {
          status: 'RESPONDED',
          slaState: computeSlaState(existing.deadline),
        },
        include: {
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'RESPOND_MAIL',
          entityType: 'IncomingMail',
          entityId: id,
          changes: {
            note: req.body.note || null,
          },
        },
      });

      sendSuccess(res, {
        data: {
          ...updated,
          slaState: computeSlaState(updated.deadline),
        },
      });
    } catch (error) {
      logger.error(`Error responding to mail: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to mark incoming mail as responded',
        statusCode: 500,
      });
    }
  },
);

// PUT /mails/:id/archive
router.put(
  '/:id/archive',
  requireRole(
    UserRole.CHEF_PISTE,
    UserRole.STATION_MANAGER,
    UserRole.FINANCE_DIR,
    UserRole.CFO,
    UserRole.CEO,
    UserRole.DCO,
    UserRole.LOGISTICS,
    UserRole.SUPER_ADMIN,
  ),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');

      const existing = await prisma.incomingMail.findUnique({ where: { id } });
      if (!existing) {
        sendError(res, {
          code: 'NOT_FOUND',
          message: 'Incoming mail not found',
          statusCode: 404,
        });
        return;
      }

      const updated = await prisma.incomingMail.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          slaState: computeSlaState(existing.deadline),
        },
        include: {
          assignedTo: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'ARCHIVE_MAIL',
          entityType: 'IncomingMail',
          entityId: id,
          changes: {},
        },
      });

      sendSuccess(res, {
        data: {
          ...updated,
          slaState: computeSlaState(updated.deadline),
        },
      });
    } catch (error) {
      logger.error(`Error archiving mail: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to archive incoming mail',
        statusCode: 500,
      });
    }
  },
);

export default router;
