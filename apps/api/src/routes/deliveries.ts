import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { 
  UserRole, 
  createReplenishmentSchema, 
  createDeliverySchema,
  addCompartmentSchema,
  recordDipsSchema,
  validateReplenishmentSchema,
  DELIVERY_TOLERANCE_PERCENT,
} from '@alcom/shared';

// Types for compartment operations
interface CompartmentWithTank {
  id: string;
  blVolume: unknown;
  physicalReceived: unknown;
  variance: unknown;
  openingDip: number | null;
  closingDip: number | null;
  tankId: string;
  tank?: {
    id: string;
    fuelType: string;
    capacity?: number;
    currentLevel?: number;
  };
}

// Transaction client type
type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const router: Router = Router();

// Apply authentication middleware
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// REPLENISHMENT REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── LIST REPLENISHMENT REQUESTS ───
router.get('/requests', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { stationId, status, fuelType, page = '1', limit = '20' } = req.query;
  
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Record<string, unknown> = {};
  
  // Station managers can only see their own station's requests
  if (req.user!.stationId) {
    where.stationId = req.user!.stationId;
  } else if (stationId) {
    where.stationId = stationId;
  }
  
  if (status) where.status = status;
  if (fuelType) where.fuelType = fuelType;

  const [requests, total] = await Promise.all([
    prisma.replenishmentRequest.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        station: { select: { name: true, code: true } },
        requestedBy: { select: { fullName: true } },
      },
    }),
    prisma.replenishmentRequest.count({ where }),
  ]);

  sendSuccess(res, {
    data: requests,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ─── GET SINGLE REPLENISHMENT REQUEST ───
router.get('/requests/:id', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
    include: {
      station: { select: { name: true, code: true } },
      requestedBy: { select: { fullName: true } },
      deliveries: {
        include: {
          compartments: true,
        },
      },
    },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  // Station managers can only see their station's requests
  if (req.user!.stationId && req.user!.stationId !== request.stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot view request for another station',
      statusCode: 403,
    });
    return;
  }

  // Calculate ullage information
  const tank = await prisma.tank.findFirst({
    where: { stationId: request.stationId, fuelType: request.fuelType, deletedAt: null },
  });

  const response = {
    ...request,
    tankCapacity: tank ? Number(tank.capacity) : null,
    currentLevel: tank ? Number(tank.currentLevel) : null,
    ullage: tank ? Number(tank.capacity) - Number(tank.currentLevel) : null,
    overflowWarning: tank ? Number(request.requestedVolume) > (Number(tank.capacity) - Number(tank.currentLevel)) : false,
  };

  sendSuccess(res, { data: response });
});

// ─── CREATE REPLENISHMENT REQUEST (with ullage check) ───
router.post('/requests', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), validate(createReplenishmentSchema), async (req: Request, res: Response) => {
  const { stationId, fuelType, requestedVolume } = req.body;
  const userId = req.user!.userId;

  // Station managers can only request for their own station
  if (req.user!.stationId && req.user!.stationId !== stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot create request for another station',
      statusCode: 403,
    });
    return;
  }

  // Check the station exists
  const station = await prisma.station.findFirst({
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

  // Find tank for ullage calculation
  const tank = await prisma.tank.findFirst({
    where: { stationId, fuelType, deletedAt: null },
  });

  if (!tank) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: `No tank found for fuel type ${fuelType} at this station`,
      statusCode: 404,
    });
    return;
  }

  // Calculate ullage (max volume that can be received)
  const tankCapacity = Number(tank.capacity);
  const currentLevel = Number(tank.currentLevel);
  const ullage = tankCapacity - currentLevel;
  const overflowWarning = requestedVolume > ullage;

  const request = await prisma.replenishmentRequest.create({
    data: {
      stationId,
      fuelType,
      requestedVolume,
      status: 'DRAFT',
      requestedById: userId,
    },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  sendSuccess(res, { 
    data: {
      ...request,
      tankCapacity,
      currentLevel,
      ullage,
      overflowWarning,
      warning: overflowWarning ? `Risk of Overflow: Requested ${requestedVolume}L but ullage is only ${ullage.toFixed(2)}L` : null,
    }, 
    statusCode: 201 
  });
});

// ─── SUBMIT REPLENISHMENT REQUEST (DRAFT → PENDING_VALIDATION) ───
router.put('/requests/:id/submit', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  if (request.status !== 'DRAFT') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot submit request in ${request.status} status. Must be DRAFT`,
      statusCode: 400,
    });
    return;
  }

  const updated = await prisma.replenishmentRequest.update({
    where: { id },
    data: { status: 'PENDING_VALIDATION' },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  sendSuccess(res, { data: updated });
});

// ─── VALIDATE REPLENISHMENT REQUEST (PENDING_VALIDATION → VALIDATED) ── DCO Director ───
router.put('/requests/:id/validate', requireRole(UserRole.DCO, UserRole.SUPER_ADMIN), validate(validateReplenishmentSchema), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { comment } = req.body;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  if (request.status !== 'PENDING_VALIDATION') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot validate request in ${request.status} status. Must be PENDING_VALIDATION`,
      statusCode: 400,
    });
    return;
  }

  const updated = await prisma.replenishmentRequest.update({
    where: { id },
    data: { status: 'VALIDATED' },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'REPLENISHMENT_VALIDATED',
      entityType: 'ReplenishmentRequest',
      entityId: id,
      changes: { comment },
    },
  });

  sendSuccess(res, { data: updated });
});

// ─── ORDER REPLENISHMENT (VALIDATED → ORDERED) ── Logistics - locks editing ───
router.put('/requests/:id/order', requireRole(UserRole.LOGISTICS, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  if (request.status !== 'VALIDATED') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot order request in ${request.status} status. Must be VALIDATED`,
      statusCode: 400,
    });
    return;
  }

  const updated = await prisma.replenishmentRequest.update({
    where: { id },
    data: { status: 'ORDERED' },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'REPLENISHMENT_ORDERED',
      entityType: 'ReplenishmentRequest',
      entityId: id,
      changes: { orderedAt: new Date().toISOString() },
    },
  });

  sendSuccess(res, { data: updated });
});

// ─── COMPLETE REPLENISHMENT (ORDERED → COMPLETED) ───
router.put('/requests/:id/complete', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  if (request.status !== 'ORDERED') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot complete request in ${request.status} status. Must be ORDERED`,
      statusCode: 400,
    });
    return;
  }

  const updated = await prisma.replenishmentRequest.update({
    where: { id },
    data: { status: 'COMPLETED' },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  sendSuccess(res, { data: updated });
});

// ─── UPDATE REPLENISHMENT REQUEST (only in DRAFT status) ───
router.patch('/requests/:id', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { requestedVolume } = req.body;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  // Can only edit in DRAFT status
  if (request.status !== 'DRAFT') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot edit request in ${request.status} status. Only DRAFT requests can be edited`,
      statusCode: 400,
    });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (requestedVolume !== undefined) {
    if (requestedVolume <= 0) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Requested volume must be positive',
        statusCode: 400,
      });
      return;
    }
    updateData.requestedVolume = requestedVolume;
  }

  const updated = await prisma.replenishmentRequest.update({
    where: { id },
    data: updateData,
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  // Calculate ullage for response
  const tank = await prisma.tank.findFirst({
    where: { stationId: request.stationId, fuelType: request.fuelType, deletedAt: null },
  });

  const tankCapacity = tank ? Number(tank.capacity) : 0;
  const currentLevel = tank ? Number(tank.currentLevel) : 0;
  const ullage = tankCapacity - currentLevel;
  const newVolume = requestedVolume ?? Number(request.requestedVolume);
  const overflowWarning = newVolume > ullage;

  sendSuccess(res, { 
    data: {
      ...updated,
      tankCapacity,
      currentLevel,
      ullage,
      overflowWarning,
      warning: overflowWarning ? `Risk of Overflow: Requested ${newVolume}L but ullage is only ${ullage.toFixed(2)}L` : null,
    }
  });
});

// ─── DELETE REPLENISHMENT REQUEST (only in DRAFT status) ───
router.delete('/requests/:id', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await prisma.replenishmentRequest.findUnique({
    where: { id },
  });

  if (!request) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Replenishment request not found',
      statusCode: 404,
    });
    return;
  }

  if (request.status !== 'DRAFT') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: `Cannot delete request in ${request.status} status. Only DRAFT requests can be deleted`,
      statusCode: 400,
    });
    return;
  }

  await prisma.replenishmentRequest.delete({
    where: { id },
  });

  sendSuccess(res, { data: { message: 'Request deleted successfully' } });
});

// ─── GET ULLAGE FOR STATION/FUEL TYPE ───
router.get('/ullage', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { stationId, fuelType } = req.query;

  if (!stationId || !fuelType) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'stationId and fuelType are required',
      statusCode: 400,
    });
    return;
  }

  const tank = await prisma.tank.findFirst({
    where: { 
      stationId: stationId as string, 
      fuelType: fuelType as 'ESSENCE' | 'GASOIL', 
      deletedAt: null 
    },
  });

  if (!tank) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: `No tank found for fuel type ${fuelType} at this station`,
      statusCode: 404,
    });
    return;
  }

  const tankCapacity = Number(tank.capacity);
  const currentLevel = Number(tank.currentLevel);
  const ullage = tankCapacity - currentLevel;
  const percentFull = (currentLevel / tankCapacity) * 100;

  sendSuccess(res, { 
    data: {
      tankId: tank.id,
      fuelType: tank.fuelType,
      tankCapacity,
      currentLevel,
      ullage,
      percentFull: Math.round(percentFull * 100) / 100,
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FUEL DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

// ─── LIST DELIVERIES ───
router.get('/', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { stationId, status, startDate, endDate, page = '1', limit = '20' } = req.query;
  
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Record<string, unknown> = {};
  
  // Station managers can only see their own station's deliveries
  if (req.user!.stationId) {
    where.stationId = req.user!.stationId;
  } else if (stationId) {
    where.stationId = stationId;
  }
  
  if (status) where.status = status;
  
  // Date filters
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
    if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
  }

  const [deliveries, total] = await Promise.all([
    prisma.fuelDelivery.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        station: { select: { name: true, code: true } },
        compartments: {
          include: {
            tank: { select: { id: true, fuelType: true } },
          },
        },
      },
    }),
    prisma.fuelDelivery.count({ where }),
  ]);

  // Calculate total BL volume for each delivery
  const deliveriesWithTotals = deliveries.map((d: typeof deliveries[0]) => ({
    ...d,
    totalBlVolume: d.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + Number(c.blVolume), 0),
  }));

  sendSuccess(res, {
    data: deliveriesWithTotals,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ─── GET DELIVERY ───
router.get('/:id', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: {
      station: { select: { id: true, name: true, code: true } },
      replenishmentRequest: true,
      compartments: {
        include: {
          tank: { select: { id: true, fuelType: true, capacity: true, currentLevel: true } },
        },
      },
    },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  // Station managers can only view their own station's deliveries
  if (req.user!.stationId && req.user!.stationId !== delivery.stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot view delivery for another station',
      statusCode: 403,
    });
    return;
  }

  // Calculate totals
  const totalBlVolume = delivery.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + Number(c.blVolume), 0);
  const totalPhysicalReceived = delivery.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + (Number(c.physicalReceived) || 0), 0);
  const totalVariance = delivery.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + (Number(c.variance) || 0), 0);

  sendSuccess(res, { 
    data: {
      ...delivery,
      totalBlVolume,
      totalPhysicalReceived,
      totalVariance,
    } 
  });
});

// ─── CREATE DELIVERY ───
router.post('/', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), validate(createDeliverySchema), async (req: Request, res: Response) => {
  const { stationId, replenishmentRequestId, blNumber, truckPlate, driverName, blTotalVolume } = req.body;

  // Station managers can only create for their own station
  if (req.user!.stationId && req.user!.stationId !== stationId) {
    sendError(res, {
      code: 'FORBIDDEN',
      message: 'Cannot create delivery for another station',
      statusCode: 403,
    });
    return;
  }

  // Check station exists
  const station = await prisma.station.findFirst({
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

  // If replenishment request provided, validate it
  if (replenishmentRequestId) {
    const request = await prisma.replenishmentRequest.findUnique({
      where: { id: replenishmentRequestId },
    });

    if (!request) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Replenishment request not found',
        statusCode: 404,
      });
      return;
    }

    if (request.stationId !== stationId) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Replenishment request does not match station',
        statusCode: 400,
      });
      return;
    }

    if (request.status !== 'ORDERED') {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: `Replenishment request must be in ORDERED status, currently: ${request.status}`,
        statusCode: 400,
      });
      return;
    }
  }

  const delivery = await prisma.fuelDelivery.create({
    data: {
      stationId,
      replenishmentRequestId,
      blNumber,
      truckPlate,
      driverName,
      blTotalVolume: blTotalVolume || null,
      status: 'IN_PROGRESS',
    },
    include: {
      station: { select: { name: true, code: true } },
    },
  });

  sendSuccess(res, { data: delivery, statusCode: 201 });
});

// ─── ADD COMPARTMENT TO DELIVERY ───
router.post('/:id/compartments', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), validate(addCompartmentSchema), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tankId, fuelType, blVolume } = req.body;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { 
      station: true,
      compartments: true,
    },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  // Validate status
  if (delivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Can only add compartments to deliveries in progress',
      statusCode: 400,
    });
    return;
  }

  // Check if any compartment already has dips recorded (delivery started)
  const hasStarted = delivery.compartments.some((c: CompartmentWithTank) => c.openingDip !== null);
  if (hasStarted) {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Cannot add compartments after delivery has started',
      statusCode: 400,
    });
    return;
  }

  // Validate tank exists and matches station & fuel type
  const tank = await prisma.tank.findFirst({
    where: { id: tankId, stationId: delivery.stationId, fuelType, deletedAt: null },
  });

  if (!tank) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Tank not found or fuel type mismatch',
      statusCode: 400,
    });
    return;
  }

  const compartment = await prisma.deliveryCompartment.create({
    data: {
      deliveryId: id,
      tankId,
      fuelType,
      blVolume,
    },
    include: {
      tank: { select: { id: true, fuelType: true, capacity: true, currentLevel: true } },
    },
  });

  // Calculate new total and check against BL total if set
  const allCompartments = await prisma.deliveryCompartment.findMany({
    where: { deliveryId: id },
  });
  const totalBlVolume = allCompartments.reduce((sum: number, c: { blVolume: unknown }) => sum + Number(c.blVolume), 0);

  sendSuccess(res, { 
    data: {
      ...compartment,
      totalCompartments: allCompartments.length,
      totalBlVolume,
      blTotalVolume: delivery.blTotalVolume ? Number(delivery.blTotalVolume) : null,
    }, 
    statusCode: 201 
  });
});

// ─── REMOVE COMPARTMENT FROM DELIVERY ───
router.delete('/:id/compartments/:compartmentId', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id, compartmentId } = req.params;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { compartments: true },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  if (delivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Can only remove compartments from deliveries in progress',
      statusCode: 400,
    });
    return;
  }

  const compartment = delivery.compartments.find((c: CompartmentWithTank) => c.id === compartmentId);
  if (!compartment) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Compartment not found',
      statusCode: 404,
    });
    return;
  }

  // Check if opening dips recorded
  if (compartment.openingDip !== null) {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Cannot remove compartment after opening dip recorded',
      statusCode: 400,
    });
    return;
  }

  await prisma.deliveryCompartment.delete({
    where: { id: compartmentId },
  });

  sendSuccess(res, { data: { message: 'Compartment removed successfully' } });
});

// ─── FINALIZE COMPARTMENTS (validate BL total matches) ───
router.post('/:id/finalize-compartments', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { compartments: true },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  if (delivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Delivery is not in progress',
      statusCode: 400,
    });
    return;
  }

  if (delivery.compartments.length === 0) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Delivery must have at least one compartment',
      statusCode: 400,
    });
    return;
  }

  // Validate BL total if set
  const totalBlVolume = delivery.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + Number(c.blVolume), 0);
  
  if (delivery.blTotalVolume) {
    const blTotal = Number(delivery.blTotalVolume);
    if (Math.abs(totalBlVolume - blTotal) > 0.01) { // Allow tiny floating point difference
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: `Sum of compartment volumes (${totalBlVolume}L) does not match BL total (${blTotal}L)`,
        statusCode: 400,
      });
      return;
    }
  }

  sendSuccess(res, { 
    data: { 
      message: 'Compartments validated successfully',
      totalBlVolume,
      compartmentCount: delivery.compartments.length,
    } 
  });
});

// ─── START DELIVERY (record opening dips) ───
router.put('/:id/start', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { compartments } = req.body;

  if (!compartments || !Array.isArray(compartments) || compartments.length === 0) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Opening dips for all compartments are required',
      statusCode: 400,
    });
    return;
  }

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { compartments: true },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  if (delivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Delivery is not in progress',
      statusCode: 400,
    });
    return;
  }

  if (delivery.compartments.length === 0) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Delivery must have compartments before starting',
      statusCode: 400,
    });
    return;
  }

  // Check all compartments have opening dips provided
  const deliveryCompIds = new Set(delivery.compartments.map((c: CompartmentWithTank) => c.id));
  const providedCompIds = new Set(compartments.map((c: { compartmentId: string }) => c.compartmentId));
  
  if (providedCompIds.size !== deliveryCompIds.size) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Opening dips must be provided for all compartments',
      statusCode: 400,
    });
    return;
  }

  for (const compId of deliveryCompIds) {
    if (!providedCompIds.has(compId as string)) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: `Missing opening dip for compartment ${compId}`,
        statusCode: 400,
      });
      return;
    }
  }

  // Validate BL total if set
  const totalBlVolume = delivery.compartments.reduce((sum: number, c: CompartmentWithTank) => sum + Number(c.blVolume), 0);
  if (delivery.blTotalVolume) {
    const blTotal = Number(delivery.blTotalVolume);
    if (Math.abs(totalBlVolume - blTotal) > 0.01) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: `Sum of compartment volumes (${totalBlVolume}L) does not match BL total (${blTotal}L)`,
        statusCode: 400,
      });
      return;
    }
  }

  // Record opening dips
  for (const compData of compartments as { compartmentId: string; openingDip: number }[]) {
    const comp = delivery.compartments.find((c: CompartmentWithTank) => c.id === compData.compartmentId);
    if (!comp) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: `Compartment ${compData.compartmentId} not found`,
        statusCode: 404,
      });
      return;
    }

    if (compData.openingDip < 0) {
      sendError(res, {
        code: 'VALIDATION_ERROR',
        message: 'Opening dip cannot be negative',
        statusCode: 400,
      });
      return;
    }

    await prisma.deliveryCompartment.update({
      where: { id: compData.compartmentId },
      data: { openingDip: compData.openingDip },
    });
  }

  // Mark delivery as started
  const updated = await prisma.fuelDelivery.update({
    where: { id },
    data: { startedAt: new Date() },
    include: {
      station: { select: { name: true, code: true } },
      compartments: {
        include: {
          tank: { select: { id: true, fuelType: true, currentLevel: true } },
        },
      },
    },
  });

  sendSuccess(res, { data: updated });
});

// ─── COMPLETE DELIVERY (record closing dips) ───
router.put('/:id/complete', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), validate(recordDipsSchema), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { compartments } = req.body;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { 
      compartments: {
        include: {
          tank: true,
        },
      },
    },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  if (delivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Delivery already completed',
      statusCode: 400,
    });
    return;
  }

  // Check that all compartments have opening dips (delivery started)
  const hasAllOpeningDips = delivery.compartments.every((c: CompartmentWithTank) => c.openingDip !== null);
  if (!hasAllOpeningDips) {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Delivery must be started first (opening dips required)',
      statusCode: 400,
    });
    return;
  }

  // Update each compartment with closing dip readings
  let totalVariance = 0;
  let hasDispute = false;
  const compartmentResults: Array<{
    compartmentId: string;
    fuelType: string;
    blVolume: number;
    openingDip: number;
    closingDip: number;
    physicalReceived: number;
    variance: number;
    variancePercent: number;
    status: string;
    withinTolerance: boolean;
  }> = [];

  // Use transaction for atomic updates
  await prisma.$transaction(async (tx: PrismaTransaction) => {
    for (const compData of compartments) {
      const comp = delivery.compartments.find((c: CompartmentWithTank) => c.id === compData.compartmentId);
      if (!comp) {
        throw new Error(`Compartment ${compData.compartmentId} not found`);
      }

      const openingDip = Number(comp.openingDip);
      const closingDip = compData.closingDip;

      if (closingDip < openingDip) {
        throw new Error(`Closing dip (${closingDip}) cannot be less than opening dip (${openingDip}) for compartment ${compData.compartmentId}`);
      }

      const physicalReceived = closingDip - openingDip;
      const blVolume = Number(comp.blVolume);
      const variance = physicalReceived - blVolume;
      const variancePercent = blVolume > 0 ? variance / blVolume : 0;

      // Check if variance exceeds tolerance (0.5%)
      const status = Math.abs(variancePercent) > DELIVERY_TOLERANCE_PERCENT ? 'DISPUTED' : 'VALIDATED';
      if (status === 'DISPUTED') hasDispute = true;

      totalVariance += variance;

      await tx.deliveryCompartment.update({
        where: { id: compData.compartmentId },
        data: {
          closingDip,
          physicalReceived,
          variance,
          status,
        },
      });

      // Update tank level with optimistic locking
      const tank = comp.tank;
      const result = await tx.tank.updateMany({
        where: { 
          id: comp.tankId,
          version: tank.version, // Optimistic lock check
        },
        data: { 
          currentLevel: { increment: physicalReceived },
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new Error(`Tank ${comp.tankId} was modified by another process. Please retry.`);
      }

      compartmentResults.push({
        compartmentId: comp.id,
        fuelType: comp.fuelType,
        blVolume,
        openingDip,
        closingDip,
        physicalReceived,
        variance,
        variancePercent: Math.round(variancePercent * 10000) / 100, // Convert to percentage
        status,
        withinTolerance: status === 'VALIDATED',
      });
    }

    // Update delivery status
    await tx.fuelDelivery.update({
      where: { id },
      data: {
        status: hasDispute ? 'DISPUTED' : 'VALIDATED',
        globalVariance: totalVariance,
        completedAt: new Date(),
      },
    });

    // Update replenishment request if linked
    if (delivery.replenishmentRequestId) {
      await tx.replenishmentRequest.update({
        where: { id: delivery.replenishmentRequestId },
        data: { status: 'COMPLETED' },
      });
    }

    // Create audit log
    await tx.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: hasDispute ? 'DELIVERY_DISPUTED' : 'DELIVERY_VALIDATED',
        entityType: 'FuelDelivery',
        entityId: id,
        changes: {
          globalVariance: totalVariance,
          compartments: compartmentResults,
        },
      },
    });

    // If disputed, create notification for Tech Director
    if (hasDispute) {
      const techDirectors = await tx.user.findMany({
        where: {
          role: { in: ['SUPER_ADMIN', 'DCO'] },
          isActive: true,
        },
      });

      for (const director of techDirectors) {
        await tx.notification.create({
          data: {
            userId: director.id,
            type: 'DELIVERY_DISPUTED',
            title: 'Delivery Variance Alert',
            message: `Delivery ${delivery.blNumber} has variance exceeding tolerance (${(totalVariance).toFixed(2)}L)`,
            link: `/supply/deliveries/${id}`,
          },
        });
      }
    }
  });

  // Fetch updated delivery
  const updated = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: {
      station: { select: { name: true, code: true } },
      compartments: {
        include: {
          tank: { select: { id: true, fuelType: true, currentLevel: true } },
        },
      },
    },
  });

  sendSuccess(res, { 
    data: {
      ...updated,
      compartmentResults,
      totalVariance,
      isDisputed: hasDispute,
    }
  });
});

// Legacy endpoint for backwards compatibility
router.post('/:id/record-dips', requireRole(UserRole.STATION_MANAGER, UserRole.LOGISTICS, UserRole.DCO, UserRole.SUPER_ADMIN), validate(recordDipsSchema), async (req: Request, res: Response) => {
  // Redirect to complete endpoint
  const { id } = req.params;
  const { compartments } = req.body;

  const delivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { compartments: true },
  });

  if (!delivery) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Delivery not found',
      statusCode: 404,
    });
    return;
  }

  // If no opening dips, record them first
  const hasAllOpeningDips = delivery.compartments.every((c: CompartmentWithTank) => c.openingDip !== null);
  
  if (!hasAllOpeningDips) {
    // Record opening dips from the provided data
    for (const compData of compartments) {
      await prisma.deliveryCompartment.update({
        where: { id: compData.compartmentId },
        data: { openingDip: compData.openingDip },
      });
    }
    
    await prisma.fuelDelivery.update({
      where: { id },
      data: { startedAt: new Date() },
    });
  }

  // Now process closing dips through the complete logic
  // Re-fetch delivery with updated opening dips
  const updatedDelivery = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: { 
      compartments: {
        include: { tank: true },
      },
    },
  });

  if (!updatedDelivery || updatedDelivery.status !== 'IN_PROGRESS') {
    sendError(res, {
      code: 'INVALID_OPERATION',
      message: 'Delivery already completed',
      statusCode: 400,
    });
    return;
  }

  let totalVariance = 0;
  let hasDispute = false;

  await prisma.$transaction(async (tx: PrismaTransaction) => {
    for (const compData of compartments) {
      const comp = updatedDelivery.compartments.find((c: CompartmentWithTank) => c.id === compData.compartmentId);
      if (!comp) continue;

      const openingDip = compData.openingDip;
      const closingDip = compData.closingDip;
      const physicalReceived = closingDip - openingDip;
      const blVolume = Number(comp.blVolume);
      const variance = physicalReceived - blVolume;
      const variancePercent = blVolume > 0 ? variance / blVolume : 0;

      const status = Math.abs(variancePercent) > DELIVERY_TOLERANCE_PERCENT ? 'DISPUTED' : 'VALIDATED';
      if (status === 'DISPUTED') hasDispute = true;
      totalVariance += variance;

      await tx.deliveryCompartment.update({
        where: { id: compData.compartmentId },
        data: {
          openingDip,
          closingDip,
          physicalReceived,
          variance,
          status,
        },
      });

      await tx.tank.update({
        where: { id: comp.tankId },
        data: { 
          currentLevel: { increment: physicalReceived },
          version: { increment: 1 },
        },
      });
    }

    await tx.fuelDelivery.update({
      where: { id },
      data: {
        status: hasDispute ? 'DISPUTED' : 'VALIDATED',
        globalVariance: totalVariance,
        completedAt: new Date(),
      },
    });

    if (updatedDelivery.replenishmentRequestId) {
      await tx.replenishmentRequest.update({
        where: { id: updatedDelivery.replenishmentRequestId },
        data: { status: 'COMPLETED' },
      });
    }
  });

  const final = await prisma.fuelDelivery.findUnique({
    where: { id },
    include: {
      station: { select: { name: true, code: true } },
      compartments: {
        include: {
          tank: { select: { id: true, fuelType: true, currentLevel: true } },
        },
      },
    },
  });

  sendSuccess(res, { data: final });
});

export default router;
