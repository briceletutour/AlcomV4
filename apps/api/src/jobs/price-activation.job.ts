/**
 * Price Activation Job
 *
 * This job runs daily at midnight to:
 * 1. Check for approved prices with effectiveDate <= NOW() that are not yet active
 * 2. Activate them
 * 3. Send notifications to station managers
 */

import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import logger from '../lib/logger';

export async function processActivatePrices(): Promise<{
  activated: number;
  notified: number;
}> {
  const now = new Date();
  logger.info(`Starting price activation job at ${now.toISOString()}`);

  // Find approved prices that should now be active
  const pricesToActivate = await prisma.fuelPrice.findMany({
    where: {
      status: 'APPROVED',
      isActive: false,
      effectiveDate: { lte: now },
    },
    orderBy: { effectiveDate: 'asc' },
  });

  if (pricesToActivate.length === 0) {
    logger.info('No prices to activate');
    return { activated: 0, notified: 0 };
  }

  logger.info(`Found ${pricesToActivate.length} prices to activate`);

  // Group by fuel type - we only want to activate the latest for each type
  const latestByFuelType = new Map<string, typeof pricesToActivate[0]>();

  for (const price of pricesToActivate) {
    const existing = latestByFuelType.get(price.fuelType);
    if (!existing || price.effectiveDate > existing.effectiveDate) {
      latestByFuelType.set(price.fuelType, price);
    }
  }

  // Activate prices in a transaction
  const activatedIds: string[] = [];
  const fuelTypesActivated: string[] = [];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const [fuelType, price] of latestByFuelType) {
      // Deactivate any currently active price of this fuel type
      await tx.fuelPrice.updateMany({
        where: {
          fuelType: fuelType as 'ESSENCE' | 'GASOIL',
          isActive: true,
          id: { not: price.id },
        },
        data: { isActive: false },
      });

      // Activate the new price
      await tx.fuelPrice.update({
        where: { id: price.id },
        data: { isActive: true },
      });

      activatedIds.push(price.id);
      fuelTypesActivated.push(fuelType);

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: price.approvedById!, // Use the approver's ID
          action: 'PRICE_AUTO_ACTIVATED',
          entityType: 'FuelPrice',
          entityId: price.id,
          changes: {
            fuelType,
            price: Number(price.price),
            effectiveDate: price.effectiveDate.toISOString(),
            activatedAt: now.toISOString(),
          },
        },
      });

      logger.info(`Activated price: ${price.id} - ${fuelType} - ${Number(price.price)} XAF`);
    }
  });

  // Send notifications to station managers
  let notifiedCount = 0;

  if (fuelTypesActivated.length > 0) {
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ['STATION_MANAGER', 'CHEF_PISTE'] },
        isActive: true,
      },
      select: { id: true },
    });

    if (managers.length > 0) {
      // Get the activated prices for notification content
      const activatedPrices = await prisma.fuelPrice.findMany({
        where: { id: { in: activatedIds } },
      });

      const priceDetails = activatedPrices
        .map((p: typeof activatedPrices[0]) => `${p.fuelType}: ${Number(p.price).toLocaleString('fr-FR')} XAF`)
        .join(', ');

      await prisma.notification.createMany({
        data: managers.map((m: { id: string }) => ({
          userId: m.id,
          type: 'PRICE_CHANGE',
          title: 'Nouveau prix en vigueur',
          message: `Nouveaux tarifs carburant effectifs: ${priceDetails}`,
          isRead: false,
        })),
      });

      notifiedCount = managers.length;
      logger.info(`Sent notifications to ${notifiedCount} managers`);
    }
  }

  logger.info(`Price activation job completed: activated=${activatedIds.length}, notified=${notifiedCount}, fuelTypes=${fuelTypesActivated.join(',')}`);

  return {
    activated: activatedIds.length,
    notified: notifiedCount,
  };
}
