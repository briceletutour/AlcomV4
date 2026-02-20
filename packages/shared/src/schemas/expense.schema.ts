import { z } from 'zod';

const expenseCategoryEnum = z.enum([
  'MAINTENANCE', 'UTILITIES', 'SUPPLIES', 'TRANSPORT', 'PERSONNEL', 'MISCELLANEOUS',
]);
const expenseStatusEnum = z.enum([
  'SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE', 'APPROVED', 'REJECTED', 'DISBURSED',
]);
const disbursementMethodEnum = z.enum(['PETTY_CASH', 'BANK_TRANSFER']);

// ─── Create Expense ───
export const createExpenseSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  amount: z.number().positive('Amount must be positive'),
  category: expenseCategoryEnum,
  stationId: z.string().uuid().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ─── Approve / Reject ───
export const approveExpenseSchema = z.object({
  comment: z.string().optional(),
});
export type ApproveExpenseInput = z.infer<typeof approveExpenseSchema>;

export const rejectExpenseSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
});
export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

// ─── Disburse ───
export const disburseExpenseSchema = z.object({
  method: disbursementMethodEnum,
});
export type DisburseExpenseInput = z.infer<typeof disburseExpenseSchema>;

// ─── Response ───
export const expenseResponseSchema = z.object({
  id: z.string().uuid(),
  requesterId: z.string().uuid(),
  stationId: z.string().uuid().nullable(),
  title: z.string(),
  amount: z.number(),
  category: expenseCategoryEnum,
  status: expenseStatusEnum,
  rejectionReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

// ─── List Filters ───
export const expenseListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: expenseStatusEnum.optional(),
  category: expenseCategoryEnum.optional(),
  stationId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ExpenseListFilters = z.infer<typeof expenseListFiltersSchema>;
