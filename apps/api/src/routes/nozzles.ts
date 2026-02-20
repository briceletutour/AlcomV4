import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// Schemas
const createNozzleSchema = z.object({
  pumpId: z.string().uuid(),
  side: z.enum(['A', 'B']),
  meterIndex: z.number().nonnegative().default(0),
});

const updateNozzleSchema = z.object({
  meterIndex: z.number().nonnegative().optional(),
});

// GET /nozzles - List nozzles (optionally by pump)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { pumpId } = req.query;
    const where: Record<string, unknown> = {};
    if (pumpId) where.pumpId = pumpId as string;

    const nozzles = await prisma.nozzle.findMany({
      where,
      include: {
        pump: {
          select: { id: true, code: true, stationId: true },
        },
      },
      orderBy: [{ pumpId: 'asc' }, { side: 'asc' }],
    });

    return sendSuccess(res, { data: nozzles });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch nozzles', statusCode: 500 });
  }
});

// GET /nozzles/:id - Get single nozzle
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nozzle = await prisma.nozzle.findUnique({
      where: { id },
      include: {
        pump: {
          include: {
            tank: { select: { id: true, fuelType: true } },
            station: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!nozzle) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Nozzle not found', statusCode: 404 });
    }
    return sendSuccess(res, { data: nozzle });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch nozzle', statusCode: 500 });
  }
});

// POST /nozzles - Create nozzle
router.post('/', requireAuth, requireRole('SUPER_ADMIN', 'CEO'), validate(createNozzleSchema), async (req: Request, res: Response) => {
  try {
    const { pumpId, side, meterIndex } = req.body;

    // Verify pump exists
    const pump = await prisma.pump.findFirst({ where: { id: pumpId, deletedAt: null } });
    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }

    // Check existing nozzles on this pump
    const existingNozzles = await prisma.nozzle.findMany({ where: { pumpId } });
    
    // Maximum 2 nozzles per pump (A and B)
    if (existingNozzles.length >= 2) {
      return sendError(res, { 
        code: 'MAX_NOZZLES_EXCEEDED', 
        message: 'Pump already has maximum 2 nozzles (A and B). Cannot add more.', 
        statusCode: 400 
      });
    }

    // Check if this side already exists
    const sideExists = existingNozzles.some(n => n.side === side);
    if (sideExists) {
      return sendError(res, { 
        code: 'CONFLICT', 
        message: `Nozzle side ${side} already exists for this pump`, 
        statusCode: 400 
      });
    }

    const nozzle = await prisma.nozzle.create({
      data: { pumpId, side, meterIndex: meterIndex || 0 },
      include: {
        pump: { select: { id: true, code: true, stationId: true } },
      },
    });

    return sendSuccess(res, { data: nozzle, statusCode: 201 });
  } catch (error) {
    console.error('Create nozzle error:', error);
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create nozzle', statusCode: 500 });
  }
});

// PATCH /nozzles/:id - Update nozzle meter index
router.patch('/:id', requireAuth, requireRole('SUPER_ADMIN', 'CEO', 'STATION_MANAGER', 'CHEF_PISTE'), validate(updateNozzleSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { meterIndex } = req.body;

    const nozzle = await prisma.nozzle.findUnique({ where: { id } });
    if (!nozzle) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Nozzle not found', statusCode: 404 });
    }

    const updated = await prisma.nozzle.update({
      where: { id },
      data: { ...(meterIndex !== undefined && { meterIndex }) },
    });

    return sendSuccess(res, { data: updated });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update nozzle', statusCode: 500 });
  }
});

// DELETE /nozzles/:id - Hard delete nozzle
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nozzle = await prisma.nozzle.findUnique({ where: { id } });

    if (!nozzle) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Nozzle not found', statusCode: 404 });
    }

    await prisma.nozzle.delete({ where: { id } });

    return sendSuccess(res, { data: { message: 'Nozzle deleted' } });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete nozzle', statusCode: 500 });
  }
});

export default router;
