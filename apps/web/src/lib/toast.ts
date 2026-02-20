import { toast } from 'sonner';
import { ApiError } from './api-client';

// Error code to i18n key mapping
const ERROR_CODE_MAP: Record<string, string> = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  FORBIDDEN_STATION: 'forbidden',
  NOT_FOUND: 'notFound',
  CONFLICT: 'duplicateEntry',
  VALIDATION_ERROR: 'validationError',
  INTERNAL_ERROR: 'serverError',
  NETWORK_ERROR: 'networkError',
  SESSION_EXPIRED: 'sessionExpired',
  // Business errors
  BIZ_SHIFT_ALREADY_OPEN: 'shiftAlreadyOpen',
  BIZ_SHIFT_ALREADY_CLOSED: 'shiftAlreadyClosed',
  BIZ_SHIFT_NOT_FOUND: 'shiftNotFound',
  BIZ_STATION_NOT_FOUND: 'notFound',
  BIZ_PRICE_NOT_APPROVED: 'priceNotApproved',
  BIZ_PRICE_LOCKED: 'priceLocked',
  BIZ_INVOICE_ALREADY_PAID: 'invoiceAlreadyPaid',
  BIZ_INVOICE_NOT_APPROVED: 'invoiceNotApproved',
  BIZ_EXPENSE_ALREADY_DISBURSED: 'expenseAlreadyDisbursed',
  BIZ_DELIVERY_IN_PROGRESS: 'deliveryInProgress',
  BIZ_DELIVERY_COMPLETED: 'deliveryCompleted',
  BIZ_TANK_OVERFLOW: 'tankOverflow',
  BIZ_INSUFFICIENT_STOCK: 'insufficientStock',
  BIZ_CHECKLIST_VALIDATED: 'checklistAlreadyValidated',
  BIZ_INCIDENT_RESOLVED: 'incidentAlreadyResolved',
  BIZ_MAIL_RESPONDED: 'mailAlreadyResponded',
};

/**
 * Get the i18n key for an error code
 */
export function getErrorKey(code: string): string {
  return ERROR_CODE_MAP[code] || 'generic';
}

/**
 * Show an error toast with retry option
 */
export function showErrorToast(
  error: Error | ApiError | unknown,
  options?: {
    title?: string;
    onRetry?: () => void;
    errorMessages?: Record<string, string>;
  },
) {
  const { title, onRetry, errorMessages } = options || {};

  let message = 'An error occurred';
  let errorCode = 'UNKNOWN';

  if (error instanceof ApiError) {
    message = error.message;
    errorCode = error.code;
    
    // Check if we have a custom message for this error code
    if (errorMessages?.[errorCode]) {
      message = errorMessages[errorCode]!;
    }
  } else if (error instanceof Error) {
    message = error.message;
    
    // Check for network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      message = 'Network connection error. Please check your connection.';
      errorCode = 'NETWORK_ERROR';
    }
  }

  if (onRetry) {
    toast.error(title || 'Error', {
      description: message,
      action: {
        label: 'Retry',
        onClick: onRetry,
      },
    });
  } else {
    toast.error(title || 'Error', {
      description: message,
    });
  }

  return errorCode;
}

/**
 * Show a success toast
 */
export function showSuccessToast(message: string, description?: string) {
  toast.success(message, {
    description,
  });
}

/**
 * Show a warning toast
 */
export function showWarningToast(message: string, description?: string) {
  toast.warning(message, {
    description,
  });
}

/**
 * Show an info toast
 */
export function showInfoToast(message: string, description?: string) {
  toast.info(message, {
    description,
  });
}

/**
 * Show a loading toast that can be updated
 */
export function showLoadingToast(message: string) {
  return toast.loading(message);
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(toastId: string | number) {
  toast.dismiss(toastId);
}

/**
 * Promise-based toast for async operations
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string;
  },
) {
  return toast.promise(promise, messages);
}
