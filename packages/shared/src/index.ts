// ─── Enums ───
export * from './enums';

// ─── Schemas ───
export * from './schemas/api.schema';
export * from './schemas/auth.schema';
export * from './schemas/user.schema';
export * from './schemas/station.schema';
export * from './schemas/shift.schema';
export * from './schemas/price.schema';
export * from './schemas/finance.schema';
export * from './schemas/expense.schema';
export * from './schemas/supply.schema';
export * from './schemas/checklist.schema';
export * from './schemas/mail.schema';

// ─── Utilities ───
export * from './formatters';
export * from './calculations';

// ─── Constants ───
export const CURRENCY = 'XAF';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const INVOICE_THRESHOLD_CFO = 5_000_000;
export const EXPENSE_THRESHOLD_FINANCE = 500_000;
export const EXPENSE_THRESHOLD_CFO = 5_000_000;
export const DELIVERY_TOLERANCE_PERCENT = 0.005;
export const TANK_LOW_LEVEL_PERCENT = 0.20;
export const METER_ROLLOVER_THRESHOLD = 999999.9999;
