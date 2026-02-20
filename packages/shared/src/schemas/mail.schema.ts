import { z } from 'zod';

const mailPriorityEnum = z.enum(['NORMAL', 'URGENT']);
const mailStatusEnum = z.enum(['RECEIVED', 'IN_PROGRESS', 'RESPONDED', 'ARCHIVED']);
const slaStateEnum = z.enum(['ON_TIME', 'DUE_SOON', 'OVERDUE']);

// ─── Create Mail ───
export const createMailSchema = z.object({
  sender: z.string().min(2, 'Sender is required'),
  subject: z.string().min(2, 'Subject is required'),
  receivedAt: z.string().datetime(),
  priority: mailPriorityEnum,
  recipientDepartment: z.string().min(1, 'Department is required'),
  attachmentUrl: z.string().nullable().optional(),
});
export type CreateMailInput = z.infer<typeof createMailSchema>;

// ─── Assign Mail ───
export const assignMailSchema = z.object({
  assignedToId: z.string().uuid('Assigned user must be a valid UUID'),
});
export type AssignMailInput = z.infer<typeof assignMailSchema>;

// ─── Respond Mail ───
export const respondMailSchema = z.object({
  note: z.string().min(3, 'Response note must contain at least 3 characters').optional(),
});
export type RespondMailInput = z.infer<typeof respondMailSchema>;

// ─── Response ───
export const mailResponseSchema = z.object({
  id: z.string().uuid(),
  sender: z.string(),
  subject: z.string(),
  receivedAt: z.string().datetime(),
  priority: mailPriorityEnum,
  recipientDepartment: z.string(),
  deadline: z.string().datetime(),
  assignedToId: z.string().uuid().nullable(),
  status: mailStatusEnum,
  slaState: slaStateEnum,
  attachmentUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MailResponse = z.infer<typeof mailResponseSchema>;

// ─── List Filters ───
export const mailListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: mailStatusEnum.optional(),
  priority: mailPriorityEnum.optional(),
  department: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type MailListFilters = z.infer<typeof mailListFiltersSchema>;

export { mailPriorityEnum, mailStatusEnum, slaStateEnum };
