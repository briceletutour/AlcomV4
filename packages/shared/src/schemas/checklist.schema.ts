import { z } from 'zod';

const checklistItemStatusEnum = z.enum(['CONFORME', 'NON_CONFORME']);
const submissionStatusEnum = z.enum(['DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'REJECTED']);
const incidentStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

// ─── Checklist Template ───
export const checklistCategorySchema = z.object({
  name: z.string().min(1),
  items: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      labelFr: z.string().min(1),
    }),
  ).min(1),
});

export const createChecklistTemplateSchema = z.object({
  name: z.string().min(2, 'Template name is required'),
  categories: z.array(checklistCategorySchema).min(1, 'At least one category is required'),
});
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;

// ─── Checklist Submission ───
export const checklistItemInputSchema = z.object({
  itemId: z.string().min(1),
  status: checklistItemStatusEnum,
  comment: z.string().optional(),
  photoUrl: z.string().optional(),
});

export const submitChecklistSchema = z.object({
  stationId: z.string().uuid(),
  templateId: z.string().uuid(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.enum(['MORNING', 'EVENING']),
  items: z.array(checklistItemInputSchema).min(1, 'At least one item is required'),
});
export type SubmitChecklistInput = z.infer<typeof submitChecklistSchema>;

export const checklistResponseSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  templateId: z.string().uuid(),
  templateVersion: z.number(),
  shiftDate: z.string(),
  shiftType: z.enum(['MORNING', 'EVENING']),
  submittedBy: z.string().uuid(),
  validatedBy: z.string().uuid().nullable(),
  items: z.array(z.record(z.unknown())),
  computedScore: z.number(),
  status: submissionStatusEnum,
  createdAt: z.string().datetime(),
});
export type ChecklistResponse = z.infer<typeof checklistResponseSchema>;

// ─── Incident ───
export const createIncidentSchema = z.object({
  stationId: z.string().uuid(),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  photoUrl: z.string().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const resolveIncidentSchema = z.object({
  resolutionNote: z.string().min(5, 'Resolution note is required'),
});
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;

export const incidentResponseSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  checklistSubmissionId: z.string().uuid().nullable(),
  category: z.string(),
  description: z.string(),
  photoUrl: z.string().nullable(),
  status: incidentStatusEnum,
  assignedTo: z.string().uuid().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
  reportedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type IncidentResponse = z.infer<typeof incidentResponseSchema>;

// ─── List Filters ───
export const checklistListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stationId: z.string().uuid().optional(),
  status: submissionStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ChecklistListFilters = z.infer<typeof checklistListFiltersSchema>;

export const incidentListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stationId: z.string().uuid().optional(),
  status: incidentStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type IncidentListFilters = z.infer<typeof incidentListFiltersSchema>;
