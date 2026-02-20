import Decimal from 'decimal.js';

// Configure Decimal.js globally
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const METER_ROLLOVER_THRESHOLD = new Decimal('999999.9999');

/**
 * Calculate volume sold from meter readings.
 * Handles meter rollover (when closing < opening).
 */
export function calculateVolumeSold(
  openingIndex: Decimal | number,
  closingIndex: Decimal | number,
): Decimal {
  const opening = new Decimal(openingIndex);
  const closing = new Decimal(closingIndex);

  if (closing.greaterThanOrEqualTo(opening)) {
    return closing.minus(opening);
  }

  // Meter rollover
  return METER_ROLLOVER_THRESHOLD.minus(opening).plus(closing);
}

/**
 * Calculate revenue from volume and unit price.
 */
export function calculateRevenue(
  volume: Decimal | number,
  unitPrice: Decimal | number,
): Decimal {
  return new Decimal(volume).times(new Decimal(unitPrice));
}

/**
 * Calculate theoretical cash (what should be in the register).
 * TheoreticalCash = TotalRevenue - CardPayments - Expenses
 */
export function calculateTheoreticalCash(
  totalRevenue: Decimal | number,
  cardPayments: Decimal | number,
  expenses: Decimal | number,
): Decimal {
  return new Decimal(totalRevenue).minus(new Decimal(cardPayments)).minus(new Decimal(expenses));
}

/**
 * Calculate cash variance.
 * Positive = surplus, Negative = shortage.
 */
export function calculateCashVariance(
  actualCash: Decimal | number,
  theoreticalCash: Decimal | number,
): Decimal {
  return new Decimal(actualCash).minus(new Decimal(theoreticalCash));
}

/**
 * Calculate theoretical stock level.
 * Theoretical = Opening + Deliveries - Sales
 */
export function calculateTheoreticalStock(
  openingLevel: Decimal | number,
  deliveries: Decimal | number,
  salesVolume: Decimal | number,
): Decimal {
  return new Decimal(openingLevel).plus(new Decimal(deliveries)).minus(new Decimal(salesVolume));
}

/**
 * Calculate stock variance.
 * Positive = surplus, Negative = shortage.
 */
export function calculateStockVariance(
  physicalLevel: Decimal | number,
  theoreticalLevel: Decimal | number,
): Decimal {
  return new Decimal(physicalLevel).minus(new Decimal(theoreticalLevel));
}

/**
 * Calculate delivery variance and check tolerance.
 * Returns { variance, isWithinTolerance }
 */
export function calculateDeliveryVariance(
  physicalReceived: Decimal | number,
  blVolume: Decimal | number,
  tolerancePercent: number = 0.005,
): { variance: Decimal; isWithinTolerance: boolean } {
  const received = new Decimal(physicalReceived);
  const expected = new Decimal(blVolume);
  const variance = received.minus(expected);
  const tolerance = expected.times(tolerancePercent);

  return {
    variance,
    isWithinTolerance: variance.abs().lessThanOrEqualTo(tolerance),
  };
}

/**
 * Calculate ullage (available space) in a tank.
 */
export function calculateUllage(
  capacity: Decimal | number,
  currentLevel: Decimal | number,
): Decimal {
  return new Decimal(capacity).minus(new Decimal(currentLevel));
}

/**
 * Calculate checklist score as percentage.
 */
export function calculateChecklistScore(
  conformeCount: number,
  totalCount: number,
): number {
  if (totalCount === 0) return 0;
  return Math.round((conformeCount / totalCount) * 100);
}

export { Decimal };
