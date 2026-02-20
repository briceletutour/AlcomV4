import { z } from 'zod';

const shiftTypeEnum = z.enum(['MORNING', 'EVENING']);
const shiftStatusEnum = z.enum(['OPEN', 'CLOSED', 'LOCKED']);

// ─── Open Shift ───
export const openShiftSchema = z.object({
  stationId: z.string().uuid(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  shiftType: shiftTypeEnum,
});
export type OpenShiftInput = z.infer<typeof openShiftSchema>;

// ─── Close Shift ───
export const shiftSaleInputSchema = z.object({
  nozzleId: z.string().uuid(),
  closingIndex: z.number().nonnegative('Closing index cannot be negative'),
});

export const shiftTankDipInputSchema = z.object({
  tankId: z.string().uuid(),
  physicalLevel: z.number().nonnegative('Physical level cannot be negative'),
});

export const shiftCashInputSchema = z.object({
  counted: z.number().nonnegative('Cash counted cannot be negative'),
  card: z.number().nonnegative().default(0),
  expenses: z.number().nonnegative().default(0),
});

export const closeShiftSchema = z.object({
  sales: z.array(shiftSaleInputSchema).min(1, 'At least one nozzle reading is required'),
  tankDips: z.array(shiftTankDipInputSchema).min(1, 'At least one tank dip is required'),
  cash: shiftCashInputSchema,
  justification: z.string().optional(),
});
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

// ─── Shift Response ───
export const shiftResponseSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  shiftDate: z.string(),
  shiftType: shiftTypeEnum,
  status: shiftStatusEnum,
  totalRevenue: z.number(),
  cashVariance: z.number(),
  stockVariance: z.number(),
  appliedPriceSnapshot: z.record(z.number()).nullable(),
  justification: z.string().nullable(),
  openedBy: z.string().uuid(),
  closedBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type ShiftResponse = z.infer<typeof shiftResponseSchema>;

// ─── Shift List Filters ───
export const shiftListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stationId: z.string().uuid().optional(),
  status: shiftStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ShiftListFilters = z.infer<typeof shiftListFiltersSchema>;
