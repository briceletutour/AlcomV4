/**
 * Auto-Replenishment Job
 *
 * This job runs daily at 06:00 to:
 * 1. Check all tanks with currentLevel < capacity × 0.20 (below 20%)
 * 2. Create draft replenishment requests for low tanks
 * 3. Notify DCO and Station Managers
 */

import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { TANK_LOW_LEVEL_PERCENT } from '@alcom/shared';

export interface AutoReplenishmentResult {
  tanksChecked: number;
  lowTanks: number;
  requestsCreated: number;
  notificationsSent: number;
}

export async function processAutoReplenishment(): Promise<AutoReplenishmentResult> {
  const now = new Date();
  logger.info(`Starting auto-replenishment job at ${now.toISOString()}`);

  // Find all active tanks with their station info
  const tanks = await prisma.tank.findMany({
    where: { deletedAt: null },
    include: {
      station: {
        select: { id: true, name: true, code: true, isActive: true },
      },
    },
  });

  const result: AutoReplenishmentResult = {
    tanksChecked: tanks.length,
    lowTanks: 0,
    requestsCreated: 0,
    notificationsSent: 0,
  };

  if (tanks.length === 0) {
    logger.info('No tanks found to check');
    return result;
  }

  logger.info(`Checking ${tanks.length} tanks for low levels`);

  // Filter tanks below 20% capacity
  const lowTanks = tanks.filter((tank) => {
    if (!tank.station.isActive) return false;
    const capacity = Number(tank.capacity);
    const currentLevel = Number(tank.currentLevel);
    const threshold = capacity * TANK_LOW_LEVEL_PERCENT;
    return currentLevel < threshold;
  });

  result.lowTanks = lowTanks.length;

  if (lowTanks.length === 0) {
    logger.info('No tanks below 20% capacity');
    return result;
  }

  logger.info(`Found ${lowTanks.length} tanks below 20% capacity`);

  // Get system user for creating requests (or first DCO user)
  const systemUser = await prisma.user.findFirst({
    where: {
      role: { in: ['SUPER_ADMIN', 'DCO', 'LOGISTICS'] },
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!systemUser) {
    logger.error('No system user found to create replenishment requests');
    return result;
  }

  // Create draft replenishment requests
  for (const tank of lowTanks) {
    const capacity = Number(tank.capacity);
    const currentLevel = Number(tank.currentLevel);
    const percentFull = (currentLevel / capacity) * 100;
    const ullage = capacity - currentLevel;
    
    // Calculate suggested volume: fill to 85% capacity
    const targetLevel = capacity * 0.85;
    const suggestedVolume = Math.round(targetLevel - currentLevel);

    // Check if there's already a pending request for this station/fuel type
    const existingRequest = await prisma.replenishmentRequest.findFirst({
      where: {
        stationId: tank.stationId,
        fuelType: tank.fuelType,
        status: { in: ['DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'ORDERED'] },
      },
    });

    if (existingRequest) {
      logger.info(
        `Skipping ${tank.station.code} - ${tank.fuelType}: existing request in ${existingRequest.status} status`
      );
      continue;
    }

    // Create draft replenishment request
    const request = await prisma.replenishmentRequest.create({
      data: {
        stationId: tank.stationId,
        fuelType: tank.fuelType,
        requestedVolume: suggestedVolume > 0 ? suggestedVolume : ullage,
        status: 'DRAFT',
        requestedById: systemUser.id,
      },
    });

    result.requestsCreated++;

    logger.info(
      `Created replenishment request for ${tank.station.code} - ${tank.fuelType}: ` +
      `${currentLevel.toFixed(0)}L / ${capacity.toFixed(0)}L (${percentFull.toFixed(1)}%) - ` +
      `Suggested: ${suggestedVolume}L`
    );

    // Create notifications for relevant users
    const usersToNotify = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ['DCO', 'LOGISTICS', 'SUPER_ADMIN'] } },
          { assignedStationId: tank.stationId, role: 'STATION_MANAGER' },
        ],
        isActive: true,
      },
    });

    for (const user of usersToNotify) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'LOW_TANK_ALERT',
          title: 'Low Tank Level Alert',
          message: `${tank.station.name} - ${tank.fuelType}: ${percentFull.toFixed(1)}% remaining (${currentLevel.toFixed(0)}L / ${capacity.toFixed(0)}L). Auto-replenishment request created.`,
          link: `/supply/replenishment/${request.id}`,
        },
      });
      result.notificationsSent++;
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: systemUser.id,
        action: 'AUTO_REPLENISHMENT_CREATED',
        entityType: 'ReplenishmentRequest',
        entityId: request.id,
        changes: {
          stationId: tank.stationId,
          stationCode: tank.station.code,
          fuelType: tank.fuelType,
          currentLevel,
          capacity,
          percentFull,
          suggestedVolume,
          triggeredByJob: true,
        },
      },
    });
  }

  logger.info(
    `Auto-replenishment job completed: ${result.requestsCreated} requests created, ` +
    `${result.notificationsSent} notifications sent`
  );

  return result;
}
