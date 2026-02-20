// ─── Role & Auth Enums ───
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CEO: 'CEO',
  CFO: 'CFO',
  FINANCE_DIR: 'FINANCE_DIR',
  STATION_MANAGER: 'STATION_MANAGER',
  CHEF_PISTE: 'CHEF_PISTE',
  POMPISTE: 'POMPISTE',
  LOGISTICS: 'LOGISTICS',
  DCO: 'DCO',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Language = {
  FR: 'FR',
  EN: 'EN',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

// ─── Station & Infrastructure Enums ───
export const FuelType = {
  ESSENCE: 'ESSENCE',
  GASOIL: 'GASOIL',
  PETROLE: 'PETROLE',
} as const;
export type FuelType = (typeof FuelType)[keyof typeof FuelType];

export const NozzleSide = {
  A: 'A',
  B: 'B',
} as const;
export type NozzleSide = (typeof NozzleSide)[keyof typeof NozzleSide];

// ─── Shift Enums ───
export const ShiftType = {
  MORNING: 'MORNING',
  EVENING: 'EVENING',
} as const;
export type ShiftType = (typeof ShiftType)[keyof typeof ShiftType];

export const ShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  LOCKED: 'LOCKED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

// ─── Financial Enums ───
export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const ExpenseStatus = {
  SUBMITTED: 'SUBMITTED',
  PENDING_MANAGER: 'PENDING_MANAGER',
  PENDING_FINANCE: 'PENDING_FINANCE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DISBURSED: 'DISBURSED',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ExpenseCategory = {
  MAINTENANCE: 'MAINTENANCE',
  UTILITIES: 'UTILITIES',
  SUPPLIES: 'SUPPLIES',
  TRANSPORT: 'TRANSPORT',
  PERSONNEL: 'PERSONNEL',
  MISCELLANEOUS: 'MISCELLANEOUS',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const SupplierCategory = {
  FUEL_SUPPLY: 'FUEL_SUPPLY',
  MAINTENANCE: 'MAINTENANCE',
  UTILITIES: 'UTILITIES',
  EQUIPMENT: 'EQUIPMENT',
  OTHER: 'OTHER',
} as const;
export type SupplierCategory = (typeof SupplierCategory)[keyof typeof SupplierCategory];

export const ApprovalAction = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;
export type ApprovalAction = (typeof ApprovalAction)[keyof typeof ApprovalAction];

export const ApprovalEntityType = {
  INVOICE: 'INVOICE',
  EXPENSE: 'EXPENSE',
} as const;
export type ApprovalEntityType = (typeof ApprovalEntityType)[keyof typeof ApprovalEntityType];

// ─── Supply Chain Enums ───
export const ReplenishmentStatus = {
  DRAFT: 'DRAFT',
  PENDING_VALIDATION: 'PENDING_VALIDATION',
  VALIDATED: 'VALIDATED',
  ORDERED: 'ORDERED',
  COMPLETED: 'COMPLETED',
} as const;
export type ReplenishmentStatus = (typeof ReplenishmentStatus)[keyof typeof ReplenishmentStatus];

export const DeliveryStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  VALIDATED: 'VALIDATED',
  DISPUTED: 'DISPUTED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const CompartmentStatus = {
  VALIDATED: 'VALIDATED',
  DISPUTED: 'DISPUTED',
} as const;
export type CompartmentStatus = (typeof CompartmentStatus)[keyof typeof CompartmentStatus];

// ─── Checklist & Incident Enums ───
export const ChecklistItemStatus = {
  CONFORME: 'CONFORME',
  NON_CONFORME: 'NON_CONFORME',
} as const;
export type ChecklistItemStatus =
  (typeof ChecklistItemStatus)[keyof typeof ChecklistItemStatus];

export const ChecklistSubmissionStatus = {
  DRAFT: 'DRAFT',
  PENDING_VALIDATION: 'PENDING_VALIDATION',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
} as const;
export type ChecklistSubmissionStatus =
  (typeof ChecklistSubmissionStatus)[keyof typeof ChecklistSubmissionStatus];

export const IncidentStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

// ─── Mail Enums ───
export const MailPriority = {
  NORMAL: 'NORMAL',
  URGENT: 'URGENT',
} as const;
export type MailPriority = (typeof MailPriority)[keyof typeof MailPriority];

export const MailStatus = {
  RECEIVED: 'RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESPONDED: 'RESPONDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type MailStatus = (typeof MailStatus)[keyof typeof MailStatus];

export const SlaState = {
  ON_TIME: 'ON_TIME',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
} as const;
export type SlaState = (typeof SlaState)[keyof typeof SlaState];

// ─── Job Enums ───
export const JobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const DisbursementMethod = {
  PETTY_CASH: 'PETTY_CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;
export type DisbursementMethod =
  (typeof DisbursementMethod)[keyof typeof DisbursementMethod];

// ─── Price Enums ───
export const PriceStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type PriceStatus = (typeof PriceStatus)[keyof typeof PriceStatus];
