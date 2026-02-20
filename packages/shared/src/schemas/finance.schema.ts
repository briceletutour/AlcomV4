import { z } from 'zod';

const supplierCategoryEnum = z.enum(['FUEL_SUPPLY', 'MAINTENANCE', 'UTILITIES', 'EQUIPMENT', 'OTHER']);
const invoiceStatusEnum = z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID']);

// ─── Supplier ───
export const createSupplierSchema = z.object({
  name: z.string().min(2, 'Supplier name is required'),
  taxId: z.string().min(5, 'Tax ID (NIU) is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(5, 'Phone number is required'),
  category: supplierCategoryEnum,
  address: z.string().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  category: supplierCategoryEnum.optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  taxId: z.string(),
  email: z.string(),
  phone: z.string(),
  category: supplierCategoryEnum,
  address: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type SupplierResponse = z.infer<typeof supplierResponseSchema>;

// ─── Invoice ───
export const createInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  amount: z.number().positive('Amount must be positive'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  fileUrl: z.string().min(1, 'Invoice file is required'),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const approveInvoiceSchema = z.object({
  comment: z.string().optional(),
});
export type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema>;

export const rejectInvoiceSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
});
export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;

export const payInvoiceSchema = z.object({
  proofOfPaymentUrl: z.string().min(1, 'Proof of payment file is required'),
});
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  invoiceNumber: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: invoiceStatusEnum,
  dueDate: z.string(),
  fileUrl: z.string(),
  proofOfPaymentUrl: z.string().nullable(),
  submittedBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

export const invoiceListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: invoiceStatusEnum.optional(),
  supplierId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type InvoiceListFilters = z.infer<typeof invoiceListFiltersSchema>;

export const supplierListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  category: supplierCategoryEnum.optional(),
  isActive: z.string().transform((v) => v === 'true').optional(),
});
export type SupplierListFilters = z.infer<typeof supplierListFiltersSchema>;
