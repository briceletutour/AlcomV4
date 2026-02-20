import Decimal from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Currency Formatting ───

/**
 * Format amount as XAF currency string: "1 500 000 FCFA"
 */
export function formatCurrency(amount: number | string | Decimal, locale: string = 'fr'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount instanceof Decimal ? amount.toNumber() : amount;

  if (locale === 'fr' || locale === 'FR') {
    return new Intl.NumberFormat('fr-CM', {
      style: 'currency',
      currency: 'XAF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }

  return new Intl.NumberFormat('en-CM', {
    style: 'currency',
    currency: 'XAF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// ─── Date Formatting ───

/**
 * Format date as DD/MM/YYYY (FR) or MM/DD/YYYY (EN)
 */
export function formatDate(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const loc = locale === 'fr' || locale === 'FR' ? 'fr-CM' : 'en-CM';

  return new Intl.DateTimeFormat(loc, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Format date with time: "15/02/2026 14:30"
 */
export function formatDateTime(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const loc = locale === 'fr' || locale === 'FR' ? 'fr-CM' : 'en-CM';

  return new Intl.DateTimeFormat(loc, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// ─── Number Formatting ───

/**
 * Format number with locale-specific separators: "1 234,5" (FR) or "1,234.5" (EN)
 */
export function formatNumber(num: number | string | Decimal, locale: string = 'fr'): string {
  const n = typeof num === 'string' ? parseFloat(num) : num instanceof Decimal ? num.toNumber() : num;
  const loc = locale === 'fr' || locale === 'FR' ? 'fr-CM' : 'en-CM';
  return new Intl.NumberFormat(loc).format(n);
}

/**
 * Format volume in liters: "500,5 L"
 */
export function formatVolume(liters: number | string | Decimal, locale: string = 'fr'): string {
  return `${formatNumber(liters, locale)} L`;
}

// ─── Relative Time ───

/**
 * Format relative time: "Il y a 2h" / "2h ago"
 */
export function formatRelativeTime(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const isFr = locale === 'fr' || locale === 'FR';

  if (diffMins < 1) return isFr ? "À l'instant" : 'Just now';
  if (diffMins < 60) return isFr ? `Il y a ${diffMins}min` : `${diffMins}min ago`;
  if (diffHours < 24) return isFr ? `Il y a ${diffHours}h` : `${diffHours}h ago`;
  if (diffDays < 7) return isFr ? `Il y a ${diffDays}j` : `${diffDays}d ago`;
  return formatDate(d, locale);
}

// ─── Percentage ───

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Bilingual Labels ───

export const EXPENSE_CATEGORY_LABELS = {
  MAINTENANCE: { FR: 'Maintenance', EN: 'Maintenance' },
  UTILITIES: { FR: 'Charges (Eau/Électricité)', EN: 'Utilities' },
  SUPPLIES: { FR: 'Fournitures', EN: 'Supplies' },
  TRANSPORT: { FR: 'Transport', EN: 'Transport' },
  PERSONNEL: { FR: 'Personnel', EN: 'Personnel' },
  MISCELLANEOUS: { FR: 'Divers', EN: 'Miscellaneous' },
} as const;

export const EXPENSE_STATUS_LABELS = {
  SUBMITTED: { FR: 'Soumis', EN: 'Submitted' },
  PENDING_MANAGER: { FR: 'En attente du Manager', EN: 'Pending Manager' },
  PENDING_FINANCE: { FR: 'En attente de la Finance', EN: 'Pending Finance' },
  APPROVED: { FR: 'Approuvé', EN: 'Approved' },
  REJECTED: { FR: 'Rejeté', EN: 'Rejected' },
  DISBURSED: { FR: 'Décaissé', EN: 'Disbursed' },
} as const;

export const DISBURSEMENT_METHOD_LABELS = {
  PETTY_CASH: { FR: 'Caisse menue', EN: 'Petty Cash' },
  BANK_TRANSFER: { FR: 'Virement bancaire', EN: 'Bank Transfer' },
} as const;

export const USER_ROLE_LABELS = {
  SUPER_ADMIN: { FR: 'Super Administrateur', EN: 'Super Admin' },
  CEO: { FR: 'Directeur Général', EN: 'CEO' },
  CFO: { FR: 'Directeur Financier', EN: 'CFO' },
  FINANCE_DIR: { FR: 'Directeur Finance', EN: 'Finance Director' },
  STATION_MANAGER: { FR: 'Chef de Station', EN: 'Station Manager' },
  CHEF_PISTE: { FR: 'Chef de Piste', EN: 'Shift Supervisor' },
  POMPISTE: { FR: 'Pompiste', EN: 'Pump Attendant' },
  LOGISTICS: { FR: 'Logistique', EN: 'Logistics' },
  DCO: { FR: 'DCO', EN: 'DCO' },
} as const;

export const INVOICE_STATUS_LABELS = {
  DRAFT: { FR: 'Brouillon', EN: 'Draft' },
  PENDING_APPROVAL: { FR: 'En attente d\'approbation', EN: 'Pending Approval' },
  APPROVED: { FR: 'Approuvé', EN: 'Approved' },
  REJECTED: { FR: 'Rejeté', EN: 'Rejected' },
  PAID: { FR: 'Payé', EN: 'Paid' },
} as const;

export const SHIFT_TYPE_LABELS = {
  MORNING: { FR: 'Matin', EN: 'Morning' },
  EVENING: { FR: 'Soir', EN: 'Evening' },
} as const;

export const SHIFT_STATUS_LABELS = {
  OPEN: { FR: 'Ouvert', EN: 'Open' },
  CLOSED: { FR: 'Fermé', EN: 'Closed' },
  LOCKED: { FR: 'Verrouillé', EN: 'Locked' },
} as const;

export const FUEL_TYPE_LABELS = {
  ESSENCE: { FR: 'Super', EN: 'Petrol' },
  GASOIL: { FR: 'Gasoil', EN: 'Diesel' },
  PETROLE: { FR: 'Pétrole', EN: 'Kerosene' },
} as const;

/**
 * Get label for a value in the specified language
 */
export function getLabel<T extends Record<string, { FR: string; EN: string }>>(
  labels: T,
  key: keyof T,
  locale: 'FR' | 'EN' = 'FR',
): string {
  return labels[key]?.[locale] ?? String(key);
}
