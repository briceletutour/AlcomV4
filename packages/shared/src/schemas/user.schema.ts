import { z } from 'zod';

const userRoleEnum = z.enum([
  'SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR',
  'STATION_MANAGER', 'CHEF_PISTE', 'POMPISTE',
  'LOGISTICS', 'DCO',
]);

const languageEnum = z.enum(['FR', 'EN']);

// ─── Create User ───
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  role: userRoleEnum,
  language: languageEnum.default('FR'),
  assignedStationId: z.string().uuid().nullable().optional(),
  lineManagerId: z.string().uuid().nullable().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update User ───
export const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  role: userRoleEnum.optional(),
  language: languageEnum.optional(),
  assignedStationId: z.string().uuid().nullable().optional(),
  lineManagerId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── User Response ───
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleEnum,
  language: languageEnum,
  assignedStationId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  lastLogin: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

// ─── User List Filters ───
export const userListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: userRoleEnum.optional(),
  stationId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});
export type UserListFilters = z.infer<typeof userListFiltersSchema>;

// ─── Delegation ───
export const setDelegationSchema = z.object({
  backupApproverId: z.string().uuid('Invalid backup approver ID'),
  delegationStart: z.string().datetime({ message: 'Invalid delegation start date' }),
  delegationEnd: z.string().datetime({ message: 'Invalid delegation end date' }),
}).refine(
  (data) => new Date(data.delegationEnd) > new Date(data.delegationStart),
  { message: 'Delegation end must be after start date', path: ['delegationEnd'] }
);
export type SetDelegationInput = z.infer<typeof setDelegationSchema>;

export const clearDelegationSchema = z.object({});
export type ClearDelegationInput = z.infer<typeof clearDelegationSchema>;
