import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// Schemas
const createTankSchema = z.object({
  stationId: z.string().uuid(),
  fuelType: z.enum(['ESSENCE', 'GASOIL', 'PETROLE']),
  capacity: z.number().positive('Capacity must be positive'),
  currentLevel: z.number().nonnegative().default(0),
});

const updateTankSchema = z.object({
  capacity: z.number().positive().optional(),
  currentLevel: z.number().nonnegative().optional(),
});

// GET /tanks - List tanks (optionally by station)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { stationId } = req.query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (stationId) where.stationId = stationId as string;

    const tanks = await prisma.tank.findMany({
      where,
      include: { station: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(res, { data: tanks });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch tanks', statusCode: 500 });
  }
});

// GET /tanks/:id - Get single tank
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tank = await prisma.tank.findFirst({
      where: { id, deletedAt: null },
      include: {
        station: { select: { id: true, code: true, name: true } },
        pumps: { where: { deletedAt: null }, include: { nozzles: true } },
      },
    });

    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }
    return sendSuccess(res, { data: tank });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch tank', statusCode: 500 });
  }
});

// POST /tanks - Create tank
router.post('/', requireAuth, requireRole('SUPER_ADMIN', 'CEO'), validate(createTankSchema), async (req: Request, res: Response) => {
  try {
    const { stationId, fuelType, capacity, currentLevel } = req.body;

    // Verify station exists
    const station = await prisma.station.findFirst({ where: { id: stationId, deletedAt: null } });
    if (!station) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    // Check if same fuel type tank already exists for this station
    const existingTank = await prisma.tank.findFirst({
      where: { stationId, fuelType, deletedAt: null },
    });
    if (existingTank) {
      return sendError(res, { 
        code: 'CONFLICT', 
        message: `A ${fuelType} tank already exists for this station`, 
        statusCode: 400 
      });
    }

    const tank = await prisma.tank.create({
      data: { stationId, fuelType, capacity, currentLevel: currentLevel || 0 },
      include: { station: { select: { id: true, code: true, name: true } } },
    });

    return sendSuccess(res, { data: tank, statusCode: 201 });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create tank', statusCode: 500 });
  }
});

// PATCH /tanks/:id - Update tank
router.patch('/:id', requireAuth, requireRole('SUPER_ADMIN', 'CEO', 'STATION_MANAGER'), validate(updateTankSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { capacity, currentLevel } = req.body;

    const tank = await prisma.tank.findFirst({ where: { id, deletedAt: null } });
    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }

    // Validate currentLevel <= capacity
    const newCapacity = capacity ?? Number(tank.capacity);
    const newLevel = currentLevel ?? Number(tank.currentLevel);
    if (newLevel > newCapacity) {
      return sendError(res, { 
        code: 'VALIDATION_ERROR', 
        message: 'Current level cannot exceed capacity', 
        statusCode: 400 
      });
    }

    const updated = await prisma.tank.update({
      where: { id },
      data: {
        ...(capacity !== undefined && { capacity }),
        ...(currentLevel !== undefined && { currentLevel }),
      },
    });

    return sendSuccess(res, { data: updated });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update tank', statusCode: 500 });
  }
});

// DELETE /tanks/:id - Soft delete tank
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tank = await prisma.tank.findFirst({ where: { id, deletedAt: null } });

    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }

    // Check if tank has active pumps
    const activePumps = await prisma.pump.count({ where: { tankId: id, deletedAt: null } });
    if (activePumps > 0) {
      return sendError(res, { 
        code: 'CONFLICT', 
        message: 'Cannot delete tank with active pumps', 
        statusCode: 400 
      });
    }

    await prisma.tank.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return sendSuccess(res, { data: { message: 'Tank deleted' } });
  } catch (error) {
    return sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete tank', statusCode: 500 });
  }
});

export default router;
