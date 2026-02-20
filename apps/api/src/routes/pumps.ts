import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// Schemas
const createPumpSchema = z.object({
  stationId: z.string().uuid(),
  code: z.string().min(1, 'Pump code is required'),
  tankId: z.string().uuid('Tank ID is required'),
});

const updatePumpSchema = z.object({
  code: z.string().min(1).optional(),
  tankId: z.string().uuid().optional(),
});

// GET /pumps - List pumps (optionally by station)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { stationId } = req.query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (stationId) where.stationId = stationId as string;

    const pumps = await prisma.pump.findMany({
      where,
      include: {
        station: { select: { id: true, code: true, name: true } },
        tank: { select: { id: true, fuelType: true, capacity: true, currentLevel: true } },
        nozzles: true,
      },
      orderBy: { code: 'asc' },
    });

    return sendSuccess(res, { data: pumps });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch pumps', statusCode: 500 });
  }
});

// GET /pumps/:id - Get single pump
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pump = await prisma.pump.findFirst({
      where: { id, deletedAt: null },
      include: {
        station: { select: { id: true, code: true, name: true } },
        tank: { select: { id: true, fuelType: true, capacity: true, currentLevel: true } },
        nozzles: true,
      },
    });

    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }
    return sendSuccess(res, { data: pump });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch pump', statusCode: 500 });
  }
});

// POST /pumps - Create pump
router.post('/', requireAuth, requireRole('SUPER_ADMIN', 'CEO'), validate(createPumpSchema), async (req: Request, res: Response) => {
  try {
    const { stationId, code, tankId } = req.body;

    // Verify station exists
    const station = await prisma.station.findFirst({ where: { id: stationId, deletedAt: null } });
    if (!station) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    // Verify tank exists and belongs to the same station
    const tank = await prisma.tank.findFirst({ where: { id: tankId, deletedAt: null } });
    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }

    if (tank.stationId !== stationId) {
      return sendError(res, { 
        code: 'VALIDATION_ERROR', 
        message: 'Tank does not belong to this station', 
        statusCode: 400 
      });
    }

    // Check for duplicate pump code in station
    const existingPump = await prisma.pump.findFirst({
      where: { stationId, code, deletedAt: null },
    });
    if (existingPump) {
      return sendError(res, { 
        code: 'CONFLICT', 
        message: `Pump code "${code}" already exists for this station`, 
        statusCode: 400 
      });
    }

    const pump = await prisma.pump.create({
      data: { stationId, code, tankId },
      include: {
        station: { select: { id: true, code: true, name: true } },
        tank: { select: { id: true, fuelType: true } },
        nozzles: true,
      },
    });

    return sendSuccess(res, { data: pump, statusCode: 201 });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create pump', statusCode: 500 });
  }
});

// PATCH /pumps/:id - Update pump (including tank re-assignment with fuel type validation)
router.patch('/:id', requireAuth, requireRole('SUPER_ADMIN', 'CEO'), validate(updatePumpSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, tankId } = req.body;

    const pump = await prisma.pump.findFirst({ 
      where: { id, deletedAt: null },
      include: { tank: true },
    });
    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }

    // If changing tank, validate it belongs to same station and has same fuel type
    if (tankId && tankId !== pump.tankId) {
      const newTank = await prisma.tank.findFirst({ where: { id: tankId, deletedAt: null } });
      if (!newTank) {
        return sendError(res, { code: 'NOT_FOUND', message: 'New tank not found', statusCode: 404 });
      }

      if (newTank.stationId !== pump.stationId) {
        return sendError(res, { 
          code: 'VALIDATION_ERROR', 
          message: 'Cannot link pump to tank from different station', 
          statusCode: 400 
        });
      }

      // CRITICAL: Validate fuel type match
      if (newTank.fuelType !== pump.tank.fuelType) {
        return sendError(res, { 
          code: 'FUEL_TYPE_MISMATCH', 
          message: `Cannot link ${pump.tank.fuelType} pump to ${newTank.fuelType} tank. Fuel types must match.`, 
          statusCode: 400 
        });
      }
    }

    // If changing code, check for duplicates
    if (code && code !== pump.code) {
      const existingPump = await prisma.pump.findFirst({
        where: { stationId: pump.stationId, code, deletedAt: null },
      });
      if (existingPump) {
        return sendError(res, { 
          code: 'CONFLICT', 
          message: `Pump code "${code}" already exists for this station`, 
          statusCode: 400 
        });
      }
    }

    const updated = await prisma.pump.update({
      where: { id },
      data: {
        ...(code && { code }),
        ...(tankId && { tankId }),
      },
      include: {
        tank: { select: { id: true, fuelType: true } },
        nozzles: true,
      },
    });

    return sendSuccess(res, { data: updated });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update pump', statusCode: 500 });
  }
});

// DELETE /pumps/:id - Soft delete pump
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pump = await prisma.pump.findFirst({ where: { id, deletedAt: null } });

    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }

    // Also soft-delete nozzles
    await prisma.$transaction([
      prisma.nozzle.deleteMany({ where: { pumpId: id } }),
      prisma.pump.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);

    return sendSuccess(res, { data: { message: 'Pump deleted' } });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete pump', statusCode: 500 });
  }
});

export default router;
