import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateVolumeSold,
  calculateRevenue,
  calculateTheoreticalCash,
  calculateCashVariance,
  calculateTheoreticalStock,
  calculateStockVariance,
  calculateDeliveryVariance,
  calculateUllage,
  calculateChecklistScore,
} from '../calculations';

// ─── calculateVolumeSold ───
describe('calculateVolumeSold', () => {
  it('should calculate normal volume (closing > opening)', () => {
    const result = calculateVolumeSold(1000, 1500);
    expect(result.toNumber()).toBe(500);
  });

  it('should return 0 when opening == closing', () => {
    const result = calculateVolumeSold(5000, 5000);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle small decimal values', () => {
    const result = calculateVolumeSold(1000.5, 1001.75);
    expect(result.toNumber()).toBe(1.25);
  });

  it('should handle large numbers', () => {
    const result = calculateVolumeSold(0, 999999.9999);
    expect(result.toNumber()).toBe(999999.9999);
  });

  it('should handle meter rollover (closing < opening)', () => {
    // When meter rolls over: volume = 999999.9999 - opening + closing
    const result = calculateVolumeSold(999990, 10);
    expect(result.toNumber()).toBe(9.9999 + 10); // 19.9999
  });

  it('should handle rollover with both at extremes', () => {
    const result = calculateVolumeSold(999999, 0);
    expect(result.toNumber()).toBeCloseTo(0.9999, 4);
  });

  it('should handle Decimal inputs', () => {
    const result = calculateVolumeSold(new Decimal('100.1234'), new Decimal('200.5678'));
    expect(result.toNumber()).toBeCloseTo(100.4444, 4);
  });

  it('should handle zero opening and closing', () => {
    const result = calculateVolumeSold(0, 0);
    expect(result.toNumber()).toBe(0);
  });
});

// ─── calculateRevenue ───
describe('calculateRevenue', () => {
  it('should calculate revenue correctly', () => {
    const result = calculateRevenue(500, 750);
    expect(result.toNumber()).toBe(375000);
  });

  it('should handle zero volume', () => {
    const result = calculateRevenue(0, 750);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle zero price', () => {
    const result = calculateRevenue(500, 0);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle decimal values', () => {
    const result = calculateRevenue(123.456, 750);
    expect(result.toNumber()).toBe(92592);
  });

  it('should handle large numbers (real-world station)', () => {
    // Typical station: 5000L × 750 FCFA = 3,750,000 FCFA
    const result = calculateRevenue(5000, 750);
    expect(result.toNumber()).toBe(3750000);
  });

  it('should handle Decimal inputs', () => {
    const result = calculateRevenue(new Decimal('100'), new Decimal('650'));
    expect(result.toNumber()).toBe(65000);
  });
});

// ─── calculateTheoreticalCash ───
describe('calculateTheoreticalCash', () => {
  it('should calculate theoretical cash (all cash, no card/expenses)', () => {
    const result = calculateTheoreticalCash(1000000, 0, 0);
    expect(result.toNumber()).toBe(1000000);
  });

  it('should subtract card payments', () => {
    const result = calculateTheoreticalCash(1000000, 200000, 0);
    expect(result.toNumber()).toBe(800000);
  });

  it('should subtract expenses', () => {
    const result = calculateTheoreticalCash(1000000, 0, 50000);
    expect(result.toNumber()).toBe(950000);
  });

  it('should subtract both card and expenses', () => {
    const result = calculateTheoreticalCash(1000000, 200000, 50000);
    expect(result.toNumber()).toBe(750000);
  });

  it('should handle zero revenue', () => {
    const result = calculateTheoreticalCash(0, 0, 0);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle negative theoretical cash (if card + expenses > revenue)', () => {
    const result = calculateTheoreticalCash(100000, 80000, 50000);
    expect(result.toNumber()).toBe(-30000);
  });
});

// ─── calculateCashVariance ───
describe('calculateCashVariance', () => {
  it('should return 0 for perfect match', () => {
    const result = calculateCashVariance(750000, 750000);
    expect(result.toNumber()).toBe(0);
  });

  it('should return positive for surplus', () => {
    const result = calculateCashVariance(800000, 750000);
    expect(result.toNumber()).toBe(50000);
  });

  it('should return negative for shortage', () => {
    const result = calculateCashVariance(700000, 750000);
    expect(result.toNumber()).toBe(-50000);
  });

  it('should handle small variance (under tolerance)', () => {
    const result = calculateCashVariance(750100, 750000);
    expect(result.toNumber()).toBe(100);
  });

  it('should handle zero values', () => {
    const result = calculateCashVariance(0, 0);
    expect(result.toNumber()).toBe(0);
  });
});

// ─── calculateTheoreticalStock ───
describe('calculateTheoreticalStock', () => {
  it('should calculate basic theoretical stock', () => {
    // opening: 10000, deliveries: 5000, sales: 3000
    const result = calculateTheoreticalStock(10000, 5000, 3000);
    expect(result.toNumber()).toBe(12000);
  });

  it('should handle no deliveries and no sales', () => {
    const result = calculateTheoreticalStock(10000, 0, 0);
    expect(result.toNumber()).toBe(10000);
  });

  it('should handle all sold', () => {
    const result = calculateTheoreticalStock(10000, 0, 10000);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle over-sold (negative theoretical)', () => {
    const result = calculateTheoreticalStock(10000, 0, 12000);
    expect(result.toNumber()).toBe(-2000);
  });

  it('should handle delivery only', () => {
    const result = calculateTheoreticalStock(10000, 8000, 0);
    expect(result.toNumber()).toBe(18000);
  });

  it('should handle decimal values', () => {
    const result = calculateTheoreticalStock(10000.5, 5000.25, 3000.125);
    expect(result.toNumber()).toBeCloseTo(12000.625, 3);
  });
});

// ─── calculateStockVariance ───
describe('calculateStockVariance', () => {
  it('should return 0 when physical == theoretical', () => {
    const result = calculateStockVariance(10000, 10000);
    expect(result.toNumber()).toBe(0);
  });

  it('should return positive for stock surplus', () => {
    const result = calculateStockVariance(10500, 10000);
    expect(result.toNumber()).toBe(500);
  });

  it('should return negative for stock shortage', () => {
    const result = calculateStockVariance(9800, 10000);
    expect(result.toNumber()).toBe(-200);
  });

  it('should handle zero values', () => {
    const result = calculateStockVariance(0, 0);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle decimal precision', () => {
    const result = calculateStockVariance(10000.1234, 10000);
    expect(result.toNumber()).toBeCloseTo(0.1234, 4);
  });
});

// ─── calculateDeliveryVariance ───
describe('calculateDeliveryVariance', () => {
  it('should return zero variance for exact match', () => {
    const { variance, isWithinTolerance } = calculateDeliveryVariance(10000, 10000);
    expect(variance.toNumber()).toBe(0);
    expect(isWithinTolerance).toBe(true);
  });

  it('should identify variance within tolerance (0.5%)', () => {
    // BL: 10000, received: 10040 → variance = 40, tolerance = 50
    const { variance, isWithinTolerance } = calculateDeliveryVariance(10040, 10000);
    expect(variance.toNumber()).toBe(40);
    expect(isWithinTolerance).toBe(true);
  });

  it('should identify variance outside tolerance', () => {
    // BL: 10000, received: 9900 → variance = -100, tolerance = 50
    const { variance, isWithinTolerance } = calculateDeliveryVariance(9900, 10000);
    expect(variance.toNumber()).toBe(-100);
    expect(isWithinTolerance).toBe(false);
  });

  it('should handle custom tolerance', () => {
    const { isWithinTolerance } = calculateDeliveryVariance(9900, 10000, 0.02);
    // tolerance = 200, variance = -100 → within
    expect(isWithinTolerance).toBe(true);
  });
});

// ─── calculateUllage ───
describe('calculateUllage', () => {
  it('should calculate available space in tank', () => {
    const result = calculateUllage(30000, 20000);
    expect(result.toNumber()).toBe(10000);
  });

  it('should return 0 when tank is full', () => {
    const result = calculateUllage(30000, 30000);
    expect(result.toNumber()).toBe(0);
  });

  it('should return full capacity when tank is empty', () => {
    const result = calculateUllage(30000, 0);
    expect(result.toNumber()).toBe(30000);
  });
});

// ─── calculateChecklistScore ───
describe('calculateChecklistScore', () => {
  it('should calculate 100% when all conforme', () => {
    expect(calculateChecklistScore(10, 10)).toBe(100);
  });

  it('should calculate 0% when none conforme', () => {
    expect(calculateChecklistScore(0, 10)).toBe(0);
  });

  it('should handle zero total', () => {
    expect(calculateChecklistScore(0, 0)).toBe(0);
  });

  it('should round correctly', () => {
    expect(calculateChecklistScore(7, 10)).toBe(70);
    expect(calculateChecklistScore(1, 3)).toBe(33);
  });
});
