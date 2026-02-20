import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

// Transaction client type
type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import {
  UserRole,
  submitChecklistSchema,
  checklistListFiltersSchema,
} from '@alcom/shared';
import logger from '../lib/logger';
import { z } from 'zod';

const router: Router = Router();

const toSingleParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// Apply authentication middleware
router.use(requireAuth);

// ─── VALIDATION SCHEMA ───
const validateChecklistSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'reject' && (!data.comment || data.comment.length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Rejection comment must be at least 10 characters',
      path: ['comment'],
    });
  }
});

// ─── LIST CHECKLISTS ───
// GET /checklists
router.get('/', async (req: Request, res: Response) => {
  const parsed = checklistListFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid query parameters',
      details: { errors: parsed.error.errors },
      statusCode: 400,
    });
    return;
  }

  const { page, limit, stationId, status, startDate, endDate } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  // Station-based access control
  if (req.user!.stationId) {
    // Users assigned to a station can only see their station's checklists
    where.stationId = req.user!.stationId;
  } else if (stationId) {
    where.stationId = stationId;
  }

  if (status) where.status = status;
  
  if (startDate || endDate) {
    where.shiftDate = {};
    if (startDate) (where.shiftDate as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.shiftDate as Record<string, unknown>).lte = new Date(endDate);
  }

  const [checklists, total] = await Promise.all([
    prisma.checklistSubmission.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        station: { select: { name: true, code: true } },
        template: { select: { name: true, version: true } },
        submittedBy: { select: { fullName: true } },
        validatedBy: { select: { fullName: true } },
      },
    }),
    prisma.checklistSubmission.count({ where }),
  ]);

  sendSuccess(res, {
    data: checklists,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── GET SINGLE CHECKLIST ───
// GET /checklists/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = toSingleParam(req.params.id);

  if (!id) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Checklist id is required',
      statusCode: 400,
    });
    return;
  }

  const checklist = await prisma.checklistSubmission.findUnique({
    where: { id },
    include: {
      station: { select: { name: true, code: true } },
      template: true,
      submittedBy: { select: { id: true, fullName: true } },
      validatedBy: { select: { id: true, fullName: true } },
      incidents: {
        select: {
          id: true,
          category: true,
          description: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!checklist) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Checklist not found',
      statusCode: 404,
    });
    return;
  }

  // Station-based access control
  if (req.user!.stationId && req.user!.stationId !== checklist.stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot view checklist for another station',
      statusCode: 403,
    });
    return;
  }

  sendSuccess(res, { data: checklist });
});

// ─── SUBMIT CHECKLIST ───
// POST /checklists
router.post(
  '/',
  requireRole(UserRole.POMPISTE, UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.SUPER_ADMIN),
  validate(submitChecklistSchema),
  async (req: Request, res: Response) => {
    const { stationId, templateId, shiftDate, shiftType, items } = req.body;
    const userId = req.user!.userId;

    // Station-based access control for pompistes
    if (req.user!.stationId && req.user!.stationId !== stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot submit checklist for another station',
        statusCode: 403,
      });
      return;
    }

    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id: stationId, deletedAt: null },
    });

    if (!station) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Station not found',
        statusCode: 404,
      });
      return;
    }

    // Verify template exists and is active
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || !template.isActive) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Checklist template not found or inactive',
        statusCode: 404,
      });
      return;
    }

    // Check for duplicate submission (unique: station + shiftDate + shiftType)
    const existingSubmission = await prisma.checklistSubmission.findUnique({
      where: {
        stationId_shiftDate_shiftType: {
          stationId,
          shiftDate: new Date(shiftDate),
          shiftType,
        },
      },
    });

    if (existingSubmission && existingSubmission.status !== 'REJECTED') {
      sendError(res, {
        code: 'DUPLICATE_SUBMISSION',
        message: 'A checklist has already been submitted for this station/shift/day',
        details: { existingId: existingSubmission.id, status: existingSubmission.status },
        statusCode: 409,
      });
      return;
    }

    // Validate items: NON_CONFORME must have photoUrl
    const nonConformeWithoutPhoto = items.filter(
      (item: { status: string; photoUrl?: string }) => 
        item.status === 'NON_CONFORME' && !item.photoUrl
    );

    if (nonConformeWithoutPhoto.length > 0) {
      sendError(res, {
        code: 'EVIDENCE_REQUIRED',
        message: 'Photo evidence is required for all non-conforming items',
        details: { 
          itemsWithoutPhoto: nonConformeWithoutPhoto.map((i: { itemId: string }) => i.itemId) 
        },
        statusCode: 400,
      });
      return;
    }

    // Compute score: (conforme / total) × 100
    const totalItems = items.length;
    const conformeItems = items.filter((item: { status: string }) => item.status === 'CONFORME').length;
    const computedScore = Math.round((conformeItems / totalItems) * 100);

    // Use transaction to create checklist and auto-incidents
    const result = await prisma.$transaction(async (tx: PrismaTransaction) => {
      // If rejected checklist exists, delete it first to allow resubmission
      if (existingSubmission && existingSubmission.status === 'REJECTED') {
        await tx.checklistSubmission.delete({
          where: { id: existingSubmission.id },
        });
      }

      // Create the checklist submission
      const checklist = await tx.checklistSubmission.create({
        data: {
          stationId,
          templateId,
          templateVersion: template.version,
          shiftDate: new Date(shiftDate),
          shiftType,
          submittedById: userId,
          items,
          computedScore,
          status: 'PENDING_VALIDATION',
        },
        include: {
          station: { select: { name: true, code: true } },
          template: { select: { name: true } },
          submittedBy: { select: { fullName: true } },
        },
      });

      // Auto-create incidents for NON_CONFORME items
      const nonConformeItems = items.filter(
        (item: { status: string }) => item.status === 'NON_CONFORME'
      );

      const incidents = [];
      for (const item of nonConformeItems) {
        // Try to find the item label from template categories
        let itemLabel = item.itemId;
        const templateData = template.categories as { categories?: Array<{ name: string; items: Array<{ id: string; label: string }> }> };
        const categories = templateData.categories || [];
        for (const category of categories) {
          const found = category.items.find((i) => i.id === item.itemId);
          if (found) {
            itemLabel = `${category.name}: ${found.label}`;
            break;
          }
        }

        const incident = await tx.incident.create({
          data: {
            stationId,
            checklistSubmissionId: checklist.id,
            category: 'CHECKLIST_ITEM',
            description: item.comment || `Non-conforming item: ${itemLabel}`,
            photoUrl: item.photoUrl,
            status: 'OPEN',
            reportedById: userId,
          },
        });
        incidents.push(incident);
      }

      return { checklist, incidents };
    });

    logger.info(
      { checklistId: result.checklist.id, stationId, score: computedScore, incidentsCreated: result.incidents.length, userId },
      'Checklist submitted with auto-incidents',
    );

    sendSuccess(res, {
      data: {
        ...result.checklist,
        incidentsCreated: result.incidents.length,
        incidents: result.incidents.map((i: { id: string; category: string }) => ({ id: i.id, category: i.category })),
      },
      statusCode: 201,
    });
  },
);

// ─── VALIDATE/REJECT CHECKLIST ───
// PUT /checklists/:id/validate
router.put(
  '/:id/validate',
  requireRole(UserRole.STATION_MANAGER, UserRole.SUPER_ADMIN),
  validate(validateChecklistSchema),
  async (req: Request, res: Response) => {
    const id = toSingleParam(req.params.id);
    const { action, comment } = req.body;
    const userId = req.user!.userId;

    if (!id) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Checklist id is required',
        statusCode: 400,
      });
      return;
    }

    // Find the checklist
    const checklist = await prisma.checklistSubmission.findUnique({
      where: { id },
      include: {
        station: { select: { name: true } },
        submittedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!checklist) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Checklist not found',
        statusCode: 404,
      });
      return;
    }

    // Check current status
    if (checklist.status !== 'PENDING_VALIDATION') {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Checklist cannot be validated/rejected in ${checklist.status} status`,
        statusCode: 400,
      });
      return;
    }

    // Station-based access control
    if (req.user!.stationId && req.user!.stationId !== checklist.stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot validate checklist for another station',
        statusCode: 403,
      });
      return;
    }

    // Cannot validate own submission (unless SUPER_ADMIN)
    if (checklist.submittedById === userId && req.user!.role !== UserRole.SUPER_ADMIN) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot validate your own checklist submission',
        statusCode: 403,
      });
      return;
    }

    const newStatus = action === 'approve' ? 'VALIDATED' : 'REJECTED';

    // Update checklist with validation info
    const updatedChecklist = await prisma.checklistSubmission.update({
      where: { id },
      data: {
        status: newStatus,
        validatedById: userId,
      },
      include: {
        station: { select: { name: true, code: true } },
        template: { select: { name: true } },
        submittedBy: { select: { fullName: true } },
        validatedBy: { select: { fullName: true } },
      },
    });

    logger.info(
      { checklistId: id, action, validatedBy: userId, previousStatus: checklist.status },
      `Checklist ${action === 'approve' ? 'validated' : 'rejected'}`,
    );

    sendSuccess(res, {
      data: {
        ...updatedChecklist,
        validationAction: action,
        validationComment: comment,
      },
    });
  },
);

export default router;
