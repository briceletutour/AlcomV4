import { z } from 'zod';

const fuelTypeEnum = z.enum(['ESSENCE', 'GASOIL', 'PETROLE']);
const priceStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

// ─── Create Price ───
export const createPriceSchema = z.object({
  fuelType: fuelTypeEnum,
  price: z.number().positive('Price must be positive'),
  effectiveDate: z.string().datetime('Invalid date format'),
});
export type CreatePriceInput = z.infer<typeof createPriceSchema>;

// ─── Approve Price ───
export const approvePriceSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
});
export type ApprovePriceInput = z.infer<typeof approvePriceSchema>;

// ─── Reject Price ───
export const rejectPriceSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
  idempotencyKey: z.string().uuid().optional(),
});
export type RejectPriceInput = z.infer<typeof rejectPriceSchema>;

// ─── List Prices Query ───
export const listPricesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  fuelType: fuelTypeEnum.optional(),
  status: priceStatusEnum.optional(),
  isActive: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type ListPricesQuery = z.infer<typeof listPricesQuerySchema>;

// ─── Price Response ───
export const priceResponseSchema = z.object({
  id: z.string().uuid(),
  fuelType: fuelTypeEnum,
  price: z.number(),
  effectiveDate: z.string().datetime(),
  status: priceStatusEnum,
  isActive: z.boolean(),
  createdById: z.string().uuid(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  rejectedReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.object({
    fullName: z.string(),
  }).optional(),
  approvedBy: z.object({
    fullName: z.string(),
  }).nullable().optional(),
});
export type PriceResponse = z.infer<typeof priceResponseSchema>;
