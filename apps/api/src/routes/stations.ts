import { Router } from 'express';
import prisma from '../lib/prisma';
import { sendError, sendSuccess, sendPaginated } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole } from '@alcom/shared';
import {
  createStationSchema,
  updateStationSchema,
  stationListFiltersSchema,
  createTankSchema,
  updateTankSchema,
  createPumpSchema,
} from '@alcom/shared/src/schemas/station.schema';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const GLOBAL_ROLES: string[] = [
  UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.CFO,
  UserRole.FINANCE_DIR, UserRole.LOGISTICS, UserRole.DCO,
];

// ─── LIST STATIONS ───
router.get('/', validate(stationListFiltersSchema, 'query'), async (req, res) => {
  try {
    const { page, limit, isActive, search } = req.query as any;
    const skip = ((page as number) - 1) * (limit as number);

    const where: any = { deletedAt: null };
    if (typeof isActive !== 'undefined') where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const userRole = req.user?.role || '';
    if (!GLOBAL_ROLES.includes(userRole)) {
      const stationId = req.user?.stationId;
      if (stationId) {
        where.id = stationId;
      } else {
        return sendPaginated(res, [], 0, page as number, limit as number);
      }
    }

    const [stations, total] = await Promise.all([
      prisma.station.findMany({
        where,
        skip,
        take: limit as number,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              tanks: { where: { deletedAt: null } },
              pumps: { where: { deletedAt: null } },
              users: true,
            },
          },
        },
      }),
      prisma.station.count({ where }),
    ]);

    sendPaginated(res, stations, total, page as number, limit as number);
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to list stations', statusCode: 500 });
  }
});

// ─── GET STATION BY ID ───
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;

    const station = await prisma.station.findUnique({
      where: { id },
      include: {
        tanks: { where: { deletedAt: null }, orderBy: { fuelType: 'asc' } },
        pumps: {
          where: { deletedAt: null },
          include: {
            nozzles: true,
            tank: { select: { id: true, fuelType: true } },
          },
          orderBy: { code: 'asc' },
        },
        users: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const userRole = req.user?.role || '';
    const userStationId = req.user?.stationId || '';
    if (!GLOBAL_ROLES.includes(userRole) && userStationId !== id) {
      return sendError(res, { code: 'FORBIDDEN', message: 'Access denied', statusCode: 403 });
    }

    sendSuccess(res, { data: station });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch station', statusCode: 500 });
  }
});

// ─── CREATE STATION ───
router.post('/', requireRole(UserRole.SUPER_ADMIN), validate(createStationSchema), async (req, res) => {
  try {
    const { code, name, settings, tanks, pumps } = req.body;

    const existing = await prisma.station.findUnique({ where: { code } });
    if (existing) {
      return sendError(res, { code: 'CONFLICT', message: 'Station code already exists', statusCode: 409 });
    }

    if (tanks?.length || pumps?.length) {
      const station = await prisma.$transaction(async (tx) => {
        const newStation = await tx.station.create({
          data: { code, name, settings: settings || {} },
        });

        const createdTanks: Record<string, string> = {};
        if (tanks?.length) {
          for (const tank of tanks) {
            const created = await tx.tank.create({
              data: {
                stationId: newStation.id,
                fuelType: tank.fuelType,
                capacity: tank.capacity,
                currentLevel: tank.currentLevel || 0,
              },
            });
            createdTanks[tank.fuelType] = created.id;
            if (tank.tempId) createdTanks[tank.tempId] = created.id;
          }
        }

        if (pumps?.length) {
          for (const pump of pumps) {
            const tankId = createdTanks[pump.tankId] || pump.tankId;
            const createdPump = await tx.pump.create({
              data: { stationId: newStation.id, code: pump.code, tankId },
            });
            await tx.nozzle.createMany({
              data: [
                { pumpId: createdPump.id, side: 'A', meterIndex: 0 },
                { pumpId: createdPump.id, side: 'B', meterIndex: 0 },
              ],
            });
          }
        }

        return tx.station.findUnique({
          where: { id: newStation.id },
          include: { tanks: true, pumps: { include: { nozzles: true } } },
        });
      });

      return sendSuccess(res, { data: station, statusCode: 201 });
    }

    const station = await prisma.station.create({
      data: { code, name, settings: settings || {} },
    });
    sendSuccess(res, { data: station, statusCode: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return sendError(res, { code: 'CONFLICT', message: 'Station code or pump code already exists', statusCode: 409 });
    }
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create station', statusCode: 500 });
  }
});

// ─── UPDATE STATION ───
router.put('/:id', requireRole(UserRole.SUPER_ADMIN), validate(updateStationSchema), async (req, res) => {
  try {
    const id = req.params.id as string;
    const data = req.body;

    const station = await prisma.station.findUnique({ where: { id } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const updateData: any = { ...data };
    if (data.settings) {
      const current = (station.settings as any) || {};
      updateData.settings = {
        ...current,
        ...data.settings,
        tolerance: { ...(current.tolerance || {}), ...(data.settings.tolerance || {}) },
        openingHours: { ...(current.openingHours || {}), ...(data.settings.openingHours || {}) },
      };
    }

    const updated = await prisma.station.update({ where: { id }, data: updateData });
    sendSuccess(res, { data: updated });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update station', statusCode: 500 });
  }
});

// ─── DELETE STATION (soft-delete, check constraints) ───
router.delete('/:id', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const id = req.params.id as string;

    const station = await prisma.station.findUnique({ where: { id } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const openShifts = await prisma.shiftReport.count({ where: { stationId: id, status: 'OPEN' } });
    if (openShifts > 0) {
      return sendError(res, {
        code: 'BIZ_ACTIVE_SHIFTS',
        message: 'Cannot delete station with open shifts. Close all shifts first.',
        statusCode: 409,
      });
    }

    const assignedUsers = await prisma.user.count({
      where: { assignedStationId: id, isActive: true, deletedAt: null },
    });
    if (assignedUsers > 0) {
      return sendError(res, {
        code: 'BIZ_ASSIGNED_USERS',
        message: 'Cannot delete station with assigned users. Remove user assignments first.',
        statusCode: 409,
      });
    }

    await prisma.station.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    sendSuccess(res, { data: { message: 'Station deleted successfully' } });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete station', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── TANK CRUD ───
// ═══════════════════════════════════════════════════════════

router.get('/:stationId/tanks', async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const tanks = await prisma.tank.findMany({
      where: { stationId, deletedAt: null },
      orderBy: { fuelType: 'asc' },
    });
    sendSuccess(res, { data: tanks });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to list tanks', statusCode: 500 });
  }
});

router.post('/:stationId/tanks', requireRole(UserRole.SUPER_ADMIN), validate(createTankSchema), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const { fuelType, capacity, currentLevel } = req.body;

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const tank = await prisma.tank.create({
      data: { stationId, fuelType, capacity, currentLevel: currentLevel || 0 },
    });
    sendSuccess(res, { data: tank, statusCode: 201 });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create tank', statusCode: 500 });
  }
});

router.put('/:stationId/tanks/:tankId', requireRole(UserRole.SUPER_ADMIN), validate(updateTankSchema), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const tankId = req.params.tankId as string;

    const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }

    const updated = await prisma.tank.update({ where: { id: tankId }, data: req.body });
    sendSuccess(res, { data: updated });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update tank', statusCode: 500 });
  }
});

router.delete('/:stationId/tanks/:tankId', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const tankId = req.params.tankId as string;

    const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
    if (!tank) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Tank not found', statusCode: 404 });
    }

    const activePumps = await prisma.pump.count({ where: { tankId, deletedAt: null } });
    if (activePumps > 0) {
      return sendError(res, {
        code: 'BIZ_ACTIVE_PUMPS',
        message: 'Cannot delete tank with active pumps. Remove or reassign pumps first.',
        statusCode: 409,
      });
    }

    await prisma.tank.update({ where: { id: tankId }, data: { deletedAt: new Date() } });
    sendSuccess(res, { data: { message: 'Tank deleted successfully' } });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete tank', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── PUMP CRUD ───
// ═══════════════════════════════════════════════════════════

router.get('/:stationId/pumps', async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const pumps = await prisma.pump.findMany({
      where: { stationId, deletedAt: null },
      include: { nozzles: true, tank: { select: { id: true, fuelType: true } } },
      orderBy: { code: 'asc' },
    });
    sendSuccess(res, { data: pumps });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to list pumps', statusCode: 500 });
  }
});

router.post('/:stationId/pumps', requireRole(UserRole.SUPER_ADMIN), validate(createPumpSchema), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const { code, tankId } = req.body;

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
    if (!tank) {
      return sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Tank not found or does not belong to this station',
        statusCode: 400,
      });
    }

    const pump = await prisma.$transaction(async (tx) => {
      const newPump = await tx.pump.create({ data: { stationId, code, tankId } });
      await tx.nozzle.createMany({
        data: [
          { pumpId: newPump.id, side: 'A', meterIndex: 0 },
          { pumpId: newPump.id, side: 'B', meterIndex: 0 },
        ],
      });
      return tx.pump.findUnique({
        where: { id: newPump.id },
        include: { nozzles: true, tank: { select: { id: true, fuelType: true } } },
      });
    });

    sendSuccess(res, { data: pump, statusCode: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return sendError(res, { code: 'CONFLICT', message: 'Pump code already exists for this station', statusCode: 409 });
    }
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create pump', statusCode: 500 });
  }
});

router.put('/:stationId/pumps/:pumpId', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const pumpId = req.params.pumpId as string;
    const { tankId, code: pumpCode } = req.body;

    const pump = await prisma.pump.findFirst({ 
      where: { id: pumpId, stationId, deletedAt: null },
      include: { tank: { select: { fuelType: true } } },
    });
    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }

    const updateData: any = {};
    if (tankId && tankId !== pump.tankId) {
      const newTank = await prisma.tank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
      if (!newTank) {
        return sendError(res, {
          code: 'VALIDATION_ERROR',
          message: 'Tank not found or does not belong to this station',
          statusCode: 400,
        });
      }
      // Validate fuel type match
      if (newTank.fuelType !== pump.tank.fuelType) {
        return sendError(res, {
          code: 'FUEL_TYPE_MISMATCH',
          message: `Cannot reassign pump to different fuel type. Current: ${pump.tank.fuelType}, Target: ${newTank.fuelType}`,
          statusCode: 400,
        });
      }
      updateData.tankId = tankId;
    }
    if (pumpCode) updateData.code = pumpCode;

    const updated = await prisma.pump.update({
      where: { id: pumpId },
      data: updateData,
      include: { nozzles: true, tank: { select: { id: true, fuelType: true } } },
    });
    sendSuccess(res, { data: updated });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return sendError(res, { code: 'CONFLICT', message: 'Pump code already exists for this station', statusCode: 409 });
    }
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update pump', statusCode: 500 });
  }
});

router.delete('/:stationId/pumps/:pumpId', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const pumpId = req.params.pumpId as string;

    const pump = await prisma.pump.findFirst({ where: { id: pumpId, stationId, deletedAt: null } });
    if (!pump) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Pump not found', statusCode: 404 });
    }

    await prisma.pump.update({ where: { id: pumpId }, data: { deletedAt: new Date() } });
    sendSuccess(res, { data: { message: 'Pump deleted successfully' } });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete pump', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── STATION AGENT ASSIGNMENT ───
// ═══════════════════════════════════════════════════════════

router.get('/:stationId/agents', async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const agents = await prisma.user.findMany({
      where: { assignedStationId: stationId, deletedAt: null, isActive: true },
      select: { id: true, fullName: true, email: true, role: true, isActive: true },
      orderBy: { fullName: 'asc' },
    });
    sendSuccess(res, { data: agents });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to list agents', statusCode: 500 });
  }
});

const assignAgentSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

router.post('/:stationId/agents', requireRole(UserRole.SUPER_ADMIN), validate(assignAgentSchema), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const { userId } = req.body;

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 });
    }

    const operationalRoles: string[] = [
      UserRole.STATION_MANAGER, UserRole.CHEF_PISTE, UserRole.POMPISTE,
    ];

    if (operationalRoles.includes(user.role)) {
      if (user.assignedStationId && user.assignedStationId !== stationId) {
        return sendError(res, {
          code: 'BIZ_ALREADY_ASSIGNED',
          message: 'User is already assigned to another station. Remove existing assignment first.',
          statusCode: 409,
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { assignedStationId: stationId },
      select: { id: true, fullName: true, email: true, role: true, assignedStationId: true },
    });
    sendSuccess(res, { data: updated, statusCode: 201 });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to assign agent', statusCode: 500 });
  }
});

router.delete('/:stationId/agents/:userId', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const userId = req.params.userId as string;

    const user = await prisma.user.findFirst({
      where: { id: userId, assignedStationId: stationId },
    });
    if (!user) {
      return sendError(res, { code: 'NOT_FOUND', message: 'User not assigned to this station', statusCode: 404 });
    }

    await prisma.user.update({ where: { id: userId }, data: { assignedStationId: null } });
    sendSuccess(res, { data: { message: 'User removed from station' } });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to remove agent', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── STATION SETTINGS ───
// ═══════════════════════════════════════════════════════════

const updateSettingsSchema = z.object({
  tolerance: z.object({
    cashVariance: z.number().nonnegative().optional(),
    stockVariance: z.number().nonnegative().optional(),
  }).optional(),
  openingHours: z.object({
    morning: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required').optional(),
    evening: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required').optional(),
  }).optional(),
});

router.get('/:stationId/settings', async (req, res) => {
  try {
    const stationId = req.params.stationId as string;

    const station = await prisma.station.findUnique({
      where: { id: stationId },
      select: { id: true, code: true, name: true, settings: true, deletedAt: true },
    });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const current = (station.settings as any) || {};
    const settings = {
      tolerance: { cashVariance: 5000, stockVariance: 50, ...(current.tolerance || {}) },
      openingHours: { morning: '06:00', evening: '18:00', ...(current.openingHours || {}) },
    };

    sendSuccess(res, { data: { id: station.id, code: station.code, name: station.name, settings } });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch settings', statusCode: 500 });
  }
});

router.put('/:stationId/settings', requireRole(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER), validate(updateSettingsSchema), async (req, res) => {
  try {
    const stationId = req.params.stationId as string;
    const newSettings = req.body;

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.deletedAt) {
      return sendError(res, { code: 'NOT_FOUND', message: 'Station not found', statusCode: 404 });
    }

    const userRole = req.user?.role || '';
    const userStationId = req.user?.stationId || '';
    if (userRole === UserRole.STATION_MANAGER && userStationId !== stationId) {
      return sendError(res, { code: 'FORBIDDEN', message: 'Access denied', statusCode: 403 });
    }

    const current = (station.settings as any) || {};
    const mergedSettings = {
      ...current,
      tolerance: { ...(current.tolerance || {}), ...(newSettings.tolerance || {}) },
      openingHours: { ...(current.openingHours || {}), ...(newSettings.openingHours || {}) },
    };

    const updated = await prisma.station.update({
      where: { id: stationId },
      data: { settings: mergedSettings },
    });
    sendSuccess(res, { data: updated });
  } catch (error) {
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update settings', statusCode: 500 });
  }
});

export default router;
