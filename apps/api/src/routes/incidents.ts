import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  UserRole,
  createIncidentSchema,
  resolveIncidentSchema,
  incidentListFiltersSchema,
} from '@alcom/shared';
import logger from '../lib/logger';
import { z } from 'zod';

const router: Router = Router();

const toSingleParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// Apply authentication middleware
router.use(requireAuth);

// ─── ADDITIONAL SCHEMAS ───
const assignIncidentSchema = z.object({
  assignedToId: z.string().uuid(),
});

// ─── LIST INCIDENTS ───
// GET /incidents
router.get('/', async (req: Request, res: Response) => {
  const parsed = incidentListFiltersSchema.safeParse(req.query);
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
    where.stationId = req.user!.stationId;
  } else if (stationId) {
    where.stationId = stationId;
  }

  if (status) where.status = status;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
  }

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
        checklistSubmission: {
          select: { id: true, shiftDate: true, shiftType: true },
        },
      },
    }),
    prisma.incident.count({ where }),
  ]);

  sendSuccess(res, {
    data: incidents,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── GET SINGLE INCIDENT ───
// GET /incidents/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = toSingleParam(req.params.id);

  if (!id) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Incident id is required',
      statusCode: 400,
    });
    return;
  }

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      station: { select: { name: true, code: true } },
      reportedBy: { select: { id: true, fullName: true, email: true } },
      assignedTo: { select: { id: true, fullName: true, email: true } },
      checklistSubmission: {
        select: {
          id: true,
          shiftDate: true,
          shiftType: true,
          template: { select: { name: true } },
        },
      },
    },
  });

  if (!incident) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Incident not found',
      statusCode: 404,
    });
    return;
  }

  // Station-based access control
  if (req.user!.stationId && req.user!.stationId !== incident.stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot view incident for another station',
      statusCode: 403,
    });
    return;
  }

  sendSuccess(res, { data: incident });
});

// ─── CREATE INCIDENT (manual) ───
// POST /incidents
router.post(
  '/',
  requireRole(UserRole.POMPISTE, UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  validate(createIncidentSchema),
  async (req: Request, res: Response) => {
    const { stationId, category, description, photoUrl } = req.body;
    const userId = req.user!.userId;

    // Station-based access control for field staff
    if (req.user!.stationId && req.user!.stationId !== stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot create incident for another station',
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

    const incident = await prisma.incident.create({
      data: {
        stationId,
        category,
        description,
        photoUrl,
        status: 'OPEN',
        reportedById: userId,
      },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
      },
    });

    logger.info(
      { incidentId: incident.id, stationId, category, reportedBy: userId },
      'Incident created',
    );

    sendSuccess(res, {
      data: incident,
      statusCode: 201,
    });
  },
);

// ─── ASSIGN INCIDENT ───
// PUT /incidents/:id/assign
router.put(
  '/:id/assign',
  requireRole(UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  validate(assignIncidentSchema),
  async (req: Request, res: Response) => {
    const id = toSingleParam(req.params.id);
    const { assignedToId } = req.body;
    const userId = req.user!.userId;

    if (!id) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Incident id is required',
        statusCode: 400,
      });
      return;
    }

    // Find the incident
    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Incident not found',
        statusCode: 404,
      });
      return;
    }

    // Station-based access control
    if (req.user!.stationId && req.user!.stationId !== incident.stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot assign incident for another station',
        statusCode: 403,
      });
      return;
    }

    // Cannot assign closed incidents
    if (incident.status === 'CLOSED') {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: 'Cannot assign a closed incident',
        statusCode: 400,
      });
      return;
    }

    // Verify assignee exists
    const assignee = await prisma.user.findUnique({
      where: { id: assignedToId, isActive: true },
    });

    if (!assignee) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Assignee user not found',
        statusCode: 404,
      });
      return;
    }

    // Update incident status and assignee
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: {
        assignedToId,
        status: 'IN_PROGRESS',
      },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    logger.info(
      { incidentId: id, assignedTo: assignedToId, assignedBy: userId },
      'Incident assigned',
    );

    sendSuccess(res, { data: updatedIncident });
  },
);

// ─── RESOLVE INCIDENT ───
// PUT /incidents/:id/resolve
router.put(
  '/:id/resolve',
  requireRole(UserRole.POMPISTE, UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  validate(resolveIncidentSchema),
  async (req: Request, res: Response) => {
    const id = toSingleParam(req.params.id);
    const { resolutionNote } = req.body;
    const userId = req.user!.userId;

    if (!id) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Incident id is required',
        statusCode: 400,
      });
      return;
    }

    // Find the incident
    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Incident not found',
        statusCode: 404,
      });
      return;
    }

    // Station-based access control
    if (req.user!.stationId && req.user!.stationId !== incident.stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot resolve incident for another station',
        statusCode: 403,
      });
      return;
    }

    // Can only resolve OPEN or IN_PROGRESS incidents
    if (!['OPEN', 'IN_PROGRESS'].includes(incident.status)) {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Cannot resolve incident in ${incident.status} status`,
        statusCode: 400,
      });
      return;
    }

    // Update incident
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionNote,
        resolvedAt: new Date(),
      },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    logger.info(
      { incidentId: id, resolvedBy: userId },
      'Incident resolved',
    );

    sendSuccess(res, { data: updatedIncident });
  },
);

// ─── CLOSE INCIDENT ───
// PUT /incidents/:id/close
// Manager verifies resolution and closes
router.put(
  '/:id/close',
  requireRole(UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const id = toSingleParam(req.params.id);
    const userId = req.user!.userId;

    if (!id) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Incident id is required',
        statusCode: 400,
      });
      return;
    }

    // Find the incident
    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Incident not found',
        statusCode: 404,
      });
      return;
    }

    // Station-based access control
    if (req.user!.stationId && req.user!.stationId !== incident.stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot close incident for another station',
        statusCode: 403,
      });
      return;
    }

    // Can only close RESOLVED incidents
    if (incident.status !== 'RESOLVED') {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Cannot close incident in ${incident.status} status. Incident must be resolved first.`,
        statusCode: 400,
      });
      return;
    }

    // Update incident
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: {
        status: 'CLOSED',
      },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    logger.info(
      { incidentId: id, closedBy: userId },
      'Incident closed',
    );

    sendSuccess(res, { data: updatedIncident });
  },
);

// ─── REOPEN INCIDENT ───
// PUT /incidents/:id/reopen
// Allows reopening if resolution wasn't satisfactory
router.put(
  '/:id/reopen',
  requireRole(UserRole.CHEF_PISTE, UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const id = toSingleParam(req.params.id);
    const userId = req.user!.userId;

    if (!id) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Incident id is required',
        statusCode: 400,
      });
      return;
    }

    // Find the incident
    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Incident not found',
        statusCode: 404,
      });
      return;
    }

    // Station-based access control
    if (req.user!.stationId && req.user!.stationId !== incident.stationId) {
      sendError(res, {
        code: 'FORBIDDEN',
        message: 'Cannot reopen incident for another station',
        statusCode: 403,
      });
      return;
    }

    // Can only reopen RESOLVED or CLOSED incidents
    if (!['RESOLVED', 'CLOSED'].includes(incident.status)) {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Cannot reopen incident in ${incident.status} status`,
        statusCode: 400,
      });
      return;
    }

    // Update incident - back to IN_PROGRESS if assigned, OPEN otherwise
    const newStatus = incident.assignedToId ? 'IN_PROGRESS' : 'OPEN';
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: {
        status: newStatus,
        resolvedAt: null,
        resolutionNote: null,
      },
      include: {
        station: { select: { name: true, code: true } },
        reportedBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });

    logger.info(
      { incidentId: id, reopenedBy: userId, newStatus },
      'Incident reopened',
    );

    sendSuccess(res, { data: updatedIncident });
  },
);

export default router;
