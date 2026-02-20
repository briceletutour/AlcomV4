import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendPaginated } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole } from '@alcom/shared';
import {
  openShiftSchema,
  closeShiftSchema,
  shiftListFiltersSchema,
} from '@alcom/shared/src/schemas/shift.schema';
import {
  calculateVolumeSold,
  calculateRevenue,
  calculateTheoreticalCash,
  calculateCashVariance,
  calculateTheoreticalStock,
  calculateStockVariance,
} from '@alcom/shared/src/calculations';
import logger from '../lib/logger';

const router = Router();

// ─── Helpers ───

/**
 * Fetch the latest active fuel prices effective on or before `date`.
 * Returns a Record<FuelType, Decimal price>.
 */
async function getActivePricesForDate(date: Date): Promise<Record<string, Decimal>> {
  const prices = await prisma.fuelPrice.findMany({
    where: {
      effectiveDate: { lte: date },
      isActive: true,
    },
    orderBy: { effectiveDate: 'desc' },
  });

  const priceMap: Record<string, Decimal> = {};
  for (const p of prices) {
    if (!priceMap[p.fuelType]) {
      priceMap[p.fuelType] = new Decimal(p.price.toString());
    }
  }
  return priceMap;
}

/**
 * Create an audit log entry.
 */
async function auditLog(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>,
  ipAddress?: string,
) {
  await tx.auditLog.create({
    data: { userId, action, entityType, entityId, changes: changes ?? Prisma.JsonNull, ipAddress },
  });
}

/**
 * Check if the user has access to a station (station-scoped or global).
 */
function canAccessStation(user: Request['user'], stationId: string): boolean {
  if (!user) return false;
  const globalRoles = [
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.FINANCE_DIR,
    UserRole.LOGISTICS,
    UserRole.DCO,
  ];
  if (globalRoles.includes(user.role as any)) return true;
  return user.stationId === stationId;
}

// ═══════════════════════════════════════════════════════════════════
// POST /shifts/open — Open a new shift
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/open',
  requireAuth,
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.STATION_MANAGER,
    UserRole.CHEF_PISTE,
  ),
  validate(openShiftSchema),
  async (req: Request, res: Response) => {
    try {
      const { stationId, shiftDate, shiftType } = req.body;
      const userId = req.user!.userId;

      // Station access check
      if (!canAccessStation(req.user, stationId)) {
        return sendError(res, {
          code: 'FORBIDDEN_STATION',
          message: 'Access denied to this station',
          statusCode: 403,
        });
      }

      // 1. Verify station exists and is active
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        include: {
          tanks: { where: { deletedAt: null } },
          pumps: {
            where: { deletedAt: null },
            include: {
              nozzles: true,
              tank: true,
            },
          },
        },
      });

      if (!station || !station.isActive) {
        return sendError(res, {
          code: 'BIZ_STATION_NOT_FOUND',
          message: 'Station not found or inactive',
          statusCode: 404,
        });
      }

      const parsedDate = new Date(shiftDate);

      // 2. Check unique constraint — no duplicate shift
      const existing = await prisma.shiftReport.findUnique({
        where: {
          stationId_shiftDate_shiftType: {
            stationId,
            shiftDate: parsedDate,
            shiftType,
          },
        },
      });

      if (existing) {
        return sendError(res, {
          code: 'BIZ_SHIFT_DUPLICATE',
          message: 'A shift already exists for this station, date and type',
          details: { existingShiftId: existing.id },
          statusCode: 409,
        });
      }

      // 3. Check if previous shift is still open
      const openShift = await prisma.shiftReport.findFirst({
        where: { stationId, status: 'OPEN' },
      });

      if (openShift) {
        return sendError(res, {
          code: 'BIZ_PREVIOUS_SHIFT_OPEN',
          message: 'Previous shift must be closed first',
          details: { openShiftId: openShift.id },
          statusCode: 400,
        });
      }

      // 4. Fetch active fuel prices
      const priceMap = await getActivePricesForDate(parsedDate);
      if (Object.keys(priceMap).length === 0) {
        return sendError(res, {
          code: 'BIZ_NO_ACTIVE_PRICES',
          message: 'No active fuel prices found. Cannot open shift.',
          statusCode: 400,
        });
      }

      // Build price snapshot { ESSENCE: 750, GASOIL: 650, ... }
      const priceSnapshot: Record<string, number> = {};
      for (const [fuelType, price] of Object.entries(priceMap)) {
        priceSnapshot[fuelType] = price.toNumber();
      }

      // 5. Get opening meter indices from previous shift's closing indices
      const lastClosedShift = await prisma.shiftReport.findFirst({
        where: { stationId, status: 'CLOSED' },
        orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
        include: { sales: true, tankDips: true },
      });

      // 6. Build nozzle opening indices
      const allNozzles = station.pumps.flatMap((p) => p.nozzles);

      const salesStubs = allNozzles.map((nozzle) => {
        // Find previous closing index for this nozzle
        const prevSale = lastClosedShift?.sales.find((s) => s.nozzleId === nozzle.id);
        const openingIndex = prevSale?.closingIndex
          ? new Decimal(prevSale.closingIndex.toString())
          : new Decimal(nozzle.meterIndex.toString());

        // Find the fuel type for this nozzle's pump's tank
        const pump = station.pumps.find((p) => p.id === nozzle.pumpId);
        const fuelType = pump?.tank?.fuelType || 'ESSENCE';
        const unitPrice = priceMap[fuelType] || new Decimal(0);

        return {
          nozzleId: nozzle.id,
          openingIndex: new Prisma.Decimal(openingIndex.toFixed(4)),
          unitPrice: new Prisma.Decimal(unitPrice.toFixed(4)),
        };
      });

      // 7. Build tank dip stubs
      const tankDipStubs = station.tanks.map((tank) => {
        const prevDip = lastClosedShift?.tankDips.find((d) => d.tankId === tank.id);
        const openingLevel = prevDip?.closingLevel
          ? new Decimal(prevDip.closingLevel.toString())
          : new Decimal(tank.currentLevel.toString());

        return {
          tankId: tank.id,
          openingLevel: new Prisma.Decimal(openingLevel.toFixed(4)),
        };
      });

      // 8. Create ShiftReport + stubs in transaction
      const shift = await prisma.$transaction(async (tx) => {
        const created = await tx.shiftReport.create({
          data: {
            stationId,
            shiftDate: parsedDate,
            shiftType,
            status: 'OPEN',
            appliedPriceSnapshot: priceSnapshot,
            openedById: userId,
            sales: { create: salesStubs },
            tankDips: { create: tankDipStubs },
          },
          include: {
            station: { select: { id: true, code: true, name: true } },
            sales: {
              include: {
                nozzle: { include: { pump: { select: { id: true, code: true } } } },
              },
            },
            tankDips: { include: { tank: { select: { id: true, fuelType: true, capacity: true } } } },
            openedBy: { select: { id: true, fullName: true } },
          },
        });

        // Audit log
        await auditLog(tx, userId, 'SHIFT_OPENED', 'ShiftReport', created.id, {
          stationId,
          shiftDate,
          shiftType,
          priceSnapshot,
        });

        return created;
      });

      logger.info({ shiftId: shift.id, stationId, shiftDate, shiftType }, 'Shift opened');

      return sendSuccess(res, { data: shift, statusCode: 201 });
    } catch (error) {
      logger.error({ error }, 'Error opening shift');
      return sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to open shift',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /shifts/:id/close — Close an open shift
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/:id/close',
  requireAuth,
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.STATION_MANAGER,
    UserRole.CHEF_PISTE,
  ),
  validate(closeShiftSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { sales, tankDips, cash, justification } = req.body;

      // Idempotency-Key header
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const existingShift = await prisma.shiftReport.findUnique({
          where: { idempotencyKey },
        });
        if (existingShift) {
          const full = await prisma.shiftReport.findUnique({
            where: { id: existingShift.id },
            include: {
              station: { select: { id: true, code: true, name: true } },
              sales: { include: { nozzle: { include: { pump: { select: { id: true, code: true } } } } } },
              tankDips: { include: { tank: { select: { id: true, fuelType: true, capacity: true } } } },
              openedBy: { select: { id: true, fullName: true } },
              closedBy: { select: { id: true, fullName: true } },
            },
          });
          return sendSuccess(res, { data: full });
        }
      }

      // Run entire close in a transaction with row-level lock
      const result = await prisma.$transaction(
        async (tx) => {
          // 1. Acquire lock on shift row
          const locked: any[] = await tx.$queryRaw`
            SELECT * FROM shift_reports WHERE id = ${id}::uuid FOR UPDATE
          `;

          if (locked.length === 0) {
            throw { code: 'BIZ_SHIFT_NOT_FOUND', message: 'Shift not found', statusCode: 404 };
          }

          const shiftRow = locked[0];

          // 2. Verify status == OPEN
          if (shiftRow.status !== 'OPEN') {
            throw {
              code: 'BIZ_SHIFT_NOT_OPEN',
              message: 'Shift is not open. Cannot close.',
              statusCode: 409,
            };
          }

          // Station access check
          if (!canAccessStation(req.user, shiftRow.station_id)) {
            throw { code: 'FORBIDDEN_STATION', message: 'Access denied', statusCode: 403 };
          }

          // Load existing sale stubs and tank dip stubs
          const existingSales = await tx.shiftSale.findMany({
            where: { shiftReportId: id },
            include: {
              nozzle: { include: { pump: { include: { tank: true } } } },
            },
          });

          const existingDips = await tx.shiftTankDip.findMany({
            where: { shiftReportId: id },
          });

          // Parse price snapshot
          const priceSnapshot: Record<string, number> = shiftRow.applied_price_snapshot || {};

          // 3. Process sales
          let totalRevenue = new Decimal(0);
          const saleUpdates: { saleId: string; data: any }[] = [];
          // Track volume sold per tank for stock calculation
          const volumeByTank: Record<string, Decimal> = {};

          for (const saleInput of sales) {
            const existingSale = existingSales.find((s) => s.nozzleId === saleInput.nozzleId);
            if (!existingSale) {
              throw {
                code: 'BIZ_NOZZLE_NOT_IN_SHIFT',
                message: `Nozzle ${saleInput.nozzleId} not found in this shift`,
                statusCode: 400,
              };
            }

            const openingIndex = new Decimal(existingSale.openingIndex.toString());
            const closingIndex = new Decimal(saleInput.closingIndex);

            // Calculate volume (handles rollover)
            const volumeSold = calculateVolumeSold(openingIndex, closingIndex);

            // Get unit price from snapshot
            const fuelType = existingSale.nozzle.pump.tank.fuelType;
            const unitPrice = new Decimal(priceSnapshot[fuelType] || existingSale.unitPrice.toString());

            // Calculate revenue
            const revenue = calculateRevenue(volumeSold, unitPrice);
            totalRevenue = totalRevenue.plus(revenue);

            saleUpdates.push({
              saleId: existingSale.id,
              data: {
                closingIndex: new Prisma.Decimal(closingIndex.toFixed(4)),
                volumeSold: new Prisma.Decimal(volumeSold.toFixed(4)),
                revenue: new Prisma.Decimal(revenue.toFixed(4)),
              },
            });

            // Accumulate volume by tank
            const tankId = existingSale.nozzle.pump.tankId;
            volumeByTank[tankId] = (volumeByTank[tankId] || new Decimal(0)).plus(volumeSold);
          }

          // 4. Cash reconciliation
          const cashCounted = new Decimal(cash.counted);
          const cardAmount = new Decimal(cash.card);
          const expensesAmount = new Decimal(cash.expenses);

          const theoreticalCash = calculateTheoreticalCash(totalRevenue, cardAmount, expensesAmount);
          const cashVar = calculateCashVariance(cashCounted, theoreticalCash);

          // 5. Process tank dips & stock variance
          let totalStockVariance = new Decimal(0);
          const dipUpdates: { dipId: string; data: any }[] = [];

          for (const dipInput of tankDips) {
            const existingDip = existingDips.find((d) => d.tankId === dipInput.tankId);
            if (!existingDip) {
              throw {
                code: 'BIZ_TANK_NOT_IN_SHIFT',
                message: `Tank ${dipInput.tankId} not found in this shift`,
                statusCode: 400,
              };
            }

            const openingLevel = new Decimal(existingDip.openingLevel.toString());
            const deliveries = new Decimal(existingDip.deliveries.toString());
            const salesFromTank = volumeByTank[dipInput.tankId] || new Decimal(0);
            const physicalLevel = new Decimal(dipInput.physicalLevel);

            const theoreticalStock = calculateTheoreticalStock(openingLevel, deliveries, salesFromTank);
            const stockVar = calculateStockVariance(physicalLevel, theoreticalStock);

            totalStockVariance = totalStockVariance.plus(stockVar.abs());

            dipUpdates.push({
              dipId: existingDip.id,
              data: {
                closingLevel: new Prisma.Decimal(physicalLevel.toFixed(4)),
                theoreticalStock: new Prisma.Decimal(theoreticalStock.toFixed(4)),
                stockVariance: new Prisma.Decimal(stockVar.toFixed(4)),
              },
            });
          }

          // 6. Justification required check
          const hasVariance = !cashVar.isZero() || !totalStockVariance.isZero();
          if (hasVariance && !justification) {
            throw {
              code: 'BIZ_JUSTIFICATION_REQUIRED',
              message: 'Variance detected. A justification is required to close this shift.',
              details: {
                cashVariance: cashVar.toNumber(),
                totalStockVariance: totalStockVariance.toNumber(),
              },
              statusCode: 400,
            };
          }

          // 7. Apply all updates
          for (const su of saleUpdates) {
            await tx.shiftSale.update({ where: { id: su.saleId }, data: su.data });
          }

          for (const du of dipUpdates) {
            await tx.shiftTankDip.update({ where: { id: du.dipId }, data: du.data });
          }

          // 8. Update Tank.currentLevel with optimistic locking
          for (const dipInput of tankDips) {
            const tank = await tx.tank.findUnique({ where: { id: dipInput.tankId } });
            if (!tank) continue;

            const updated = await tx.tank.updateMany({
              where: { id: dipInput.tankId, version: tank.version },
              data: {
                currentLevel: new Prisma.Decimal(new Decimal(dipInput.physicalLevel).toFixed(4)),
                version: { increment: 1 },
              },
            });

            if (updated.count === 0) {
              throw {
                code: 'BIZ_CONCURRENCY_FAIL',
                message: `Concurrent modification detected on tank ${dipInput.tankId}. Please retry.`,
                statusCode: 409,
              };
            }
          }

          // 9. Update ShiftReport
          const updatedShift = await tx.shiftReport.update({
            where: { id },
            data: {
              status: 'CLOSED',
              totalRevenue: new Prisma.Decimal(totalRevenue.toFixed(4)),
              cashCounted: new Prisma.Decimal(cashCounted.toFixed(4)),
              cardAmount: new Prisma.Decimal(cardAmount.toFixed(4)),
              expensesAmount: new Prisma.Decimal(expensesAmount.toFixed(4)),
              theoreticalCash: new Prisma.Decimal(theoreticalCash.toFixed(4)),
              cashVariance: new Prisma.Decimal(cashVar.toFixed(4)),
              stockVariance: new Prisma.Decimal(totalStockVariance.toFixed(4)),
              justification: justification || null,
              closedById: userId,
              ...(idempotencyKey ? { idempotencyKey } : {}),
            },
            include: {
              station: { select: { id: true, code: true, name: true, settings: true } },
              sales: {
                include: { nozzle: { include: { pump: { select: { id: true, code: true } } } } },
              },
              tankDips: {
                include: { tank: { select: { id: true, fuelType: true, capacity: true } } },
              },
              openedBy: { select: { id: true, fullName: true } },
              closedBy: { select: { id: true, fullName: true } },
            },
          });

          // 10. Check tolerance & create notifications if exceeded
          const settings = (updatedShift.station.settings as any) || {};
          const tolerance = settings.tolerance || { cashVariance: 5000, stockVariance: 50 };

          if (
            cashVar.abs().greaterThan(tolerance.cashVariance) ||
            totalStockVariance.greaterThan(tolerance.stockVariance)
          ) {
            const managers = await tx.user.findMany({
              where: {
                OR: [
                  { assignedStationId: updatedShift.stationId, role: 'STATION_MANAGER' },
                  { role: { in: ['CEO', 'CFO', 'DCO'] } },
                ],
                isActive: true,
                deletedAt: null,
              },
              select: { id: true },
            });

            const notifications = managers.map((u) => ({
              userId: u.id,
              type: 'SHIFT_VARIANCE_ALERT',
              title: 'Alerte écart de quart',
              message: `Quart ${updatedShift.shiftDate} ${updatedShift.shiftType} — Écart caisse: ${cashVar.toNumber()} FCFA, Écart stock: ${totalStockVariance.toNumber()} L`,
              link: `/admin/shifts/${updatedShift.id}`,
            }));

            if (notifications.length > 0) {
              await tx.notification.createMany({ data: notifications });
            }
          }

          // 11. Audit log
          await auditLog(tx, userId, 'SHIFT_CLOSED', 'ShiftReport', id, {
            totalRevenue: totalRevenue.toNumber(),
            cashVariance: cashVar.toNumber(),
            stockVariance: totalStockVariance.toNumber(),
            hasJustification: !!justification,
          });

          // Update nozzle meter indices to closing values
          for (const saleInput of sales) {
            await tx.nozzle.update({
              where: { id: saleInput.nozzleId },
              data: { meterIndex: new Prisma.Decimal(new Decimal(saleInput.closingIndex).toFixed(4)) },
            });
          }

          return updatedShift;
        },
        {
          maxWait: 10000,
          timeout: 30000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      logger.info({ shiftId: id }, 'Shift closed');
      return sendSuccess(res, { data: result });
    } catch (error: any) {
      logger.error({ error }, 'Error closing shift');

      // Business errors thrown from transaction
      if (error.code && error.statusCode) {
        return sendError(res, {
          code: error.code,
          message: error.message,
          details: error.details,
          statusCode: error.statusCode,
        });
      }

      return sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to close shift',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /shifts — List shifts (paginated, filtered)
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/',
  requireAuth,
  validate(shiftListFiltersSchema, 'query'),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, stationId, status, startDate, endDate } = req.query as any;

      const where: Prisma.ShiftReportWhereInput = {};

      // Station scoping
      const globalRoles = [
        UserRole.SUPER_ADMIN,
        UserRole.CEO,
        UserRole.CFO,
        UserRole.FINANCE_DIR,
        UserRole.LOGISTICS,
        UserRole.DCO,
      ];
      if (!globalRoles.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || undefined;
      } else if (stationId) {
        where.stationId = stationId;
      }

      if (status) where.status = status;

      if (startDate || endDate) {
        where.shiftDate = {};
        if (startDate) (where.shiftDate as any).gte = new Date(startDate);
        if (endDate) (where.shiftDate as any).lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const [total, shifts] = await Promise.all([
        prisma.shiftReport.count({ where }),
        prisma.shiftReport.findMany({
          where,
          include: {
            station: { select: { id: true, code: true, name: true } },
            openedBy: { select: { id: true, fullName: true } },
            closedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
        }),
      ]);

      return sendPaginated(res, shifts, total, page, limit);
    } catch (error) {
      logger.error({ error }, 'Error listing shifts');
      return sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list shifts',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /shifts/current — Get currently open shift for a station
// ═══════════════════════════════════════════════════════════════════
router.get('/current', requireAuth, async (req: Request, res: Response) => {
  try {
    const stationId = (req.query.stationId as string) || req.user!.stationId;

    if (!stationId) {
      return sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'stationId is required',
        statusCode: 400,
      });
    }

    if (!canAccessStation(req.user, stationId)) {
      return sendError(res, {
        code: 'FORBIDDEN_STATION',
        message: 'Access denied to this station',
        statusCode: 403,
      });
    }

    const shift = await prisma.shiftReport.findFirst({
      where: { stationId, status: 'OPEN' },
      include: {
        station: { select: { id: true, code: true, name: true } },
        sales: {
          include: {
            nozzle: { include: { pump: { select: { id: true, code: true } } } },
          },
        },
        tankDips: { include: { tank: { select: { id: true, fuelType: true, capacity: true } } } },
        openedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!shift) {
      return sendSuccess(res, { data: null });
    }

    return sendSuccess(res, { data: shift });
  } catch (error) {
    logger.error({ error }, 'Error getting current shift');
    return sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to get current shift',
      statusCode: 500,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /shifts/:id — Get shift detail
// ═══════════════════════════════════════════════════════════════════
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const shift = await prisma.shiftReport.findUnique({
      where: { id },
      include: {
        station: { select: { id: true, code: true, name: true } },
        sales: {
          include: {
            nozzle: {
              include: {
                pump: { select: { id: true, code: true, tankId: true } },
              },
            },
          },
        },
        tankDips: {
          include: {
            tank: { select: { id: true, fuelType: true, capacity: true } },
          },
        },
        openedBy: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!shift) {
      return sendError(res, {
        code: 'NOT_FOUND',
        message: 'Shift not found',
        statusCode: 404,
      });
    }

    // Station access check
    if (!canAccessStation(req.user, shift.stationId)) {
      return sendError(res, {
        code: 'FORBIDDEN_STATION',
        message: 'Access denied to this station',
        statusCode: 403,
      });
    }

    return sendSuccess(res, { data: shift });
  } catch (error) {
    logger.error({ error }, 'Error getting shift detail');
    return sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to get shift',
      statusCode: 500,
    });
  }
});

export default router;
