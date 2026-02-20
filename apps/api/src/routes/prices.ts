import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { sendSuccess, sendError, sendPaginated } from '../lib/response';
import { validate, validateQuery } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole } from '@alcom/shared';
import {
  createPriceSchema,
  approvePriceSchema,
  rejectPriceSchema,
  listPricesQuerySchema,
} from '@alcom/shared/src/schemas/price.schema';
import logger from '../lib/logger';

const router: Router = Router();

// Apply authentication middleware to protected routes
router.use(requireAuth);

// ─── Audit Log Helper ───
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
    data: { userId, action, entityType, entityId, changes: changes as object | undefined, ipAddress },
  });
}

// ═══════════════════════════════════════════════════════════════════
// GET /prices — List all prices with filters
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.FINANCE_DIR,
    UserRole.STATION_MANAGER,
  ),
  validateQuery(listPricesQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, fuelType, status, isActive, startDate, endDate } = req.query as any;

      const where: Prisma.FuelPriceWhereInput = {};

      if (fuelType) where.fuelType = fuelType;
      if (status) where.status = status;
      if (typeof isActive === 'boolean') where.isActive = isActive;
      if (startDate || endDate) {
        where.effectiveDate = {};
        if (startDate) where.effectiveDate.gte = new Date(startDate);
        if (endDate) where.effectiveDate.lte = new Date(endDate);
      }

      const [prices, total] = await Promise.all([
        prisma.fuelPrice.findMany({
          where,
          include: {
            createdBy: { select: { id: true, fullName: true } },
            approvedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { effectiveDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.fuelPrice.count({ where }),
      ]);

      // Convert Decimal prices to numbers
      const formattedPrices = prices.map((p: typeof prices[0]) => ({
        ...p,
        price: Number(p.price),
      }));

      sendPaginated(res, formattedPrices, total, page, limit);
    } catch (error) {
      logger.error(`Error listing prices: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch prices',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /prices/active — Get current active prices per fuel type
// ═══════════════════════════════════════════════════════════════════
router.get('/active', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    // Fetch the latest price where effectiveDate <= NOW() AND isActive = true
    // ORDER BY effectiveDate DESC LIMIT 1 for each fuel type
    const [essencePrice, gasoilPrice] = await Promise.all([
      prisma.fuelPrice.findFirst({
        where: {
          fuelType: 'ESSENCE',
          isActive: true,
          effectiveDate: { lte: date },
        },
        orderBy: { effectiveDate: 'desc' },
        include: {
          createdBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
        },
      }),
      prisma.fuelPrice.findFirst({
        where: {
          fuelType: 'GASOIL',
          isActive: true,
          effectiveDate: { lte: date },
        },
        orderBy: { effectiveDate: 'desc' },
        include: {
          createdBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
        },
      }),
    ]);

    sendSuccess(res, {
      data: {
        ESSENCE: essencePrice
          ? { ...essencePrice, price: Number(essencePrice.price) }
          : null,
        GASOIL: gasoilPrice
          ? { ...gasoilPrice, price: Number(gasoilPrice.price) }
          : null,
      },
    });
  } catch (error) {
    logger.error(`Error fetching active prices: ${error}`);
    sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch active prices',
      statusCode: 500,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /prices/current — Legacy: Get current prices (numeric only)
// ═══════════════════════════════════════════════════════════════════
router.get('/current', async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();

  const [essencePrice, gasoilPrice] = await Promise.all([
    prisma.fuelPrice.findFirst({
      where: {
        fuelType: 'ESSENCE',
        isActive: true,
        effectiveDate: { lte: date },
      },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.fuelPrice.findFirst({
      where: {
        fuelType: 'GASOIL',
        isActive: true,
        effectiveDate: { lte: date },
      },
      orderBy: { effectiveDate: 'desc' },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ESSENCE: essencePrice ? Number(essencePrice.price) : 0,
      GASOIL: gasoilPrice ? Number(gasoilPrice.price) : 0,
    },
    meta: {
      effectiveDate: date,
      essenceId: essencePrice?.id,
      gasoilId: gasoilPrice?.id,
    },
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /prices/history — Price history for charts
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/history',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.FINANCE_DIR,
    UserRole.STATION_MANAGER,
  ),
  async (req: Request, res: Response) => {
    try {
      const fuelType = req.query.fuelType as string | undefined;
      const months = parseInt(req.query.months as string) || 12;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const where: Prisma.FuelPriceWhereInput = {
        effectiveDate: { gte: startDate },
        status: 'APPROVED',
      };
      if (fuelType) where.fuelType = fuelType as any;

      const prices = await prisma.fuelPrice.findMany({
        where,
        orderBy: { effectiveDate: 'asc' },
        select: {
          id: true,
          fuelType: true,
          price: true,
          effectiveDate: true,
          isActive: true,
        },
      });

      // Format for chart display
      const formattedPrices = prices.map((p: typeof prices[0]) => ({
        ...p,
        price: Number(p.price),
      }));

      sendSuccess(res, { data: formattedPrices });
    } catch (error) {
      logger.error(`Error fetching price history: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch price history',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /prices/:id — Get single price detail
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/:id',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CFO,
    UserRole.FINANCE_DIR,
    UserRole.STATION_MANAGER,
  ),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      const price = await prisma.fuelPrice.findUnique({
        where: { id },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      if (!price) {
        return sendError(res, {
          code: 'NOT_FOUND',
          message: 'Price not found',
          statusCode: 404,
        });
      }

      sendSuccess(res, {
        data: { ...price, price: Number(price.price) },
      });
    } catch (error) {
      logger.error(`Error fetching price: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch price',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /prices — Create new price with future effectiveDate
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.CFO, UserRole.FINANCE_DIR),
  validate(createPriceSchema),
  async (req: Request, res: Response) => {
    try {
      const { fuelType, price, effectiveDate } = req.body;
      const userId = req.user!.userId;

      const parsedDate = new Date(effectiveDate);
      const now = new Date();

      // Business rule: effectiveDate must be > NOW()
      if (parsedDate <= now) {
        return sendError(res, {
          code: 'BIZ_INVALID_DATE',
          message: 'Effective date must be in the future',
          statusCode: 400,
        });
      }

      // Check for existing pending price for same fuel type and date
      const existingPending = await prisma.fuelPrice.findFirst({
        where: {
          fuelType,
          effectiveDate: parsedDate,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        return sendError(res, {
          code: 'BIZ_DUPLICATE_PENDING',
          message: 'A pending price already exists for this fuel type and date',
          statusCode: 409,
        });
      }

      const newPrice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.fuelPrice.create({
          data: {
            fuelType,
            price,
            effectiveDate: parsedDate,
            status: 'PENDING',
            isActive: false,
            createdById: userId,
          },
          include: {
            createdBy: { select: { id: true, fullName: true } },
          },
        });

        // Create audit log
        await auditLog(
          tx,
          userId,
          'CREATE_PRICE',
          'FuelPrice',
          created.id,
          { fuelType, price, effectiveDate: parsedDate.toISOString() },
          req.ip,
        );

        return created;
      });

      logger.info(`Price created: ${newPrice.id} - ${fuelType} - ${price} - ${parsedDate.toISOString()}`);

      sendSuccess(res, {
        data: { ...newPrice, price: Number(newPrice.price) },
        statusCode: 201,
      });
    } catch (error) {
      logger.error(`Error creating price: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create price',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PUT /prices/:id/approve — Approve a pending price (CFO/CEO only)
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/approve',
  requireRole(UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.CFO),
  validate(approvePriceSchema),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.userId;
      const { idempotencyKey } = req.body;

      // Check idempotency (optional)
      if (idempotencyKey) {
        const existingApproval = await prisma.auditLog.findFirst({
          where: {
            entityId: id,
            action: 'APPROVE_PRICE',
            changes: { path: ['idempotencyKey'], equals: idempotencyKey },
          },
        });
        if (existingApproval) {
          const price = await prisma.fuelPrice.findUnique({
            where: { id },
            include: {
              createdBy: { select: { id: true, fullName: true } },
              approvedBy: { select: { id: true, fullName: true } },
            },
          });
          return sendSuccess(res, {
            data: price ? { ...price, price: Number(price.price) } : null,
          });
        }
      }

      const price = await prisma.fuelPrice.findUnique({
        where: { id },
      });

      if (!price) {
        return sendError(res, {
          code: 'NOT_FOUND',
          message: 'Price not found',
          statusCode: 404,
        });
      }

      if (price.status !== 'PENDING') {
        return sendError(res, {
          code: 'BIZ_INVALID_STATUS',
          message: `Price is already ${price.status.toLowerCase()}`,
          statusCode: 400,
        });
      }

      // 4-eyes principle: creator != approver
      if (price.createdById === userId) {
        return sendError(res, {
          code: 'BIZ_SELF_APPROVAL',
          message: 'Cannot approve your own price submission (4-eyes principle)',
          statusCode: 403,
        });
      }

      const now = new Date();
      const effectiveNow = price.effectiveDate <= now;

      const priceId = id as string;
      const updatedPrice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.fuelPrice.update({
          where: { id: priceId },
          data: {
            status: 'APPROVED',
            isActive: effectiveNow, // Auto-activate if effective date has passed
            approvedById: userId,
            approvedAt: now,
          },
          include: {
            createdBy: { select: { id: true, fullName: true } },
            approvedBy: { select: { id: true, fullName: true } },
          },
        });

        // Create audit log
        await auditLog(
          tx,
          userId,
          'APPROVE_PRICE',
          'FuelPrice',
          priceId,
          {
            previousStatus: 'PENDING',
            newStatus: 'APPROVED',
            isActive: effectiveNow,
            idempotencyKey,
          },
          req.ip,
        );

        // Create notification for station managers if price is now active
        if (effectiveNow) {
          const managers = await tx.user.findMany({
            where: {
              role: { in: ['STATION_MANAGER', 'CHEF_PISTE'] },
              isActive: true,
            },
            select: { id: true },
          });

          if (managers.length > 0) {
            await tx.notification.createMany({
              data: managers.map((m: { id: string }) => ({
                userId: m.id,
                type: 'PRICE_CHANGE',
                title: 'New Price Effective',
                message: `New ${updated.fuelType} price of ${Number(updated.price).toLocaleString('fr-FR')} XAF is now effective`,
                isRead: false,
              })),
            });
          }
        }

        return updated;
      });

      logger.info(`Price approved: ${priceId} by ${userId}, active=${effectiveNow}`);

      sendSuccess(res, {
        data: { ...updatedPrice, price: Number(updatedPrice.price) },
      });
    } catch (error) {
      logger.error(`Error approving price: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve price',
        statusCode: 500,
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PUT /prices/:id/reject — Reject a pending price
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/reject',
  requireRole(UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.CFO),
  validate(rejectPriceSchema),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.userId;
      const { reason, idempotencyKey } = req.body;

      const price = await prisma.fuelPrice.findUnique({
        where: { id },
      });

      if (!price) {
        return sendError(res, {
          code: 'NOT_FOUND',
          message: 'Price not found',
          statusCode: 404,
        });
      }

      if (price.status !== 'PENDING') {
        return sendError(res, {
          code: 'BIZ_INVALID_STATUS',
          message: `Price is already ${price.status.toLowerCase()}`,
          statusCode: 400,
        });
      }

      const priceId = id as string;
      const updatedPrice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.fuelPrice.update({
          where: { id: priceId },
          data: {
            status: 'REJECTED',
            rejectedReason: reason,
            approvedById: userId, // Record who rejected
            approvedAt: new Date(),
          },
          include: {
            createdBy: { select: { id: true, fullName: true } },
            approvedBy: { select: { id: true, fullName: true } },
          },
        });

        // Create audit log
        await auditLog(
          tx,
          userId,
          'REJECT_PRICE',
          'FuelPrice',
          priceId,
          {
            previousStatus: 'PENDING',
            newStatus: 'REJECTED',
            reason,
            idempotencyKey,
          },
          req.ip,
        );

        // Notify the creator
        await tx.notification.create({
          data: {
            userId: price.createdById,
            type: 'PRICE_REJECTED',
            title: 'Price Rejected',
            message: `Your ${price.fuelType} price submission was rejected: ${reason}`,
            isRead: false,
          },
        });

        return updated;
      });

      logger.info(`Price rejected: ${priceId} by ${userId} - ${reason}`);

      sendSuccess(res, {
        data: { ...updatedPrice, price: Number(updatedPrice.price) },
      });
    } catch (error) {
      logger.error(`Error rejecting price: ${error}`);
      sendError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reject price',
        statusCode: 500,
      });
    }
  },
);

export default router;
