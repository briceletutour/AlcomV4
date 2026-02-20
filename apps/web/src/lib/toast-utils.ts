'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

interface UseQueryErrorHandlerOptions {
  error: Error | null;
  /** Custom error message to show instead of the default */
  customMessage?: string;
  /** Whether to show a retry button in the toast */
  showRetry?: boolean;
  /** Callback when retry is clicked */
  onRetry?: () => void;
}

/**
 * Hook that displays a toast notification when a query error occurs.
 * Handles both ApiError and generic errors.
 */
export function useQueryErrorHandler({
  error,
  customMessage,
  showRetry = false,
  onRetry,
}: UseQueryErrorHandlerOptions) {
  useEffect(() => {
    if (!error) return;

    let message: string;
    let description: string | undefined;

    if (error instanceof ApiError) {
      message = customMessage || getErrorMessage(error.code);
      description = error.message !== message ? error.message : undefined;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      message = 'Erreur de connexion';
      description = 'Vérifiez votre connexion internet et réessayez';
    } else {
      message = customMessage || 'Une erreur est survenue';
      description = error.message;
    }

    if (showRetry && onRetry) {
      toast.error(message, {
        description,
        action: {
          label: 'Réessayer',
          onClick: onRetry,
        },
        duration: 6000,
      });
    } else {
      toast.error(message, {
        description,
      });
    }
  }, [error, customMessage, showRetry, onRetry]);
}

/**
 * Get user-friendly error message from API error code
 */
function getErrorMessage(code: string): string {
  const errorMessages: Record<string, string> = {
    // Auth errors
    AUTH_MISSING_TOKEN: 'Session expirée, veuillez vous reconnecter',
    AUTH_INVALID_TOKEN: 'Session invalide, veuillez vous reconnecter',
    AUTH_TOKEN_REVOKED: 'Session révoquée, veuillez vous reconnecter',
    AUTH_INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
    AUTH_USER_INACTIVE: 'Compte désactivé',
    
    // Validation errors
    VALIDATION_ERROR: 'Données invalides',
    
    // Business errors
    BIZ_STATION_NOT_FOUND: 'Station non trouvée',
    BIZ_USER_NOT_FOUND: 'Utilisateur non trouvé',
    BIZ_SHIFT_NOT_FOUND: 'Quart non trouvé',
    BIZ_SHIFT_ALREADY_EXISTS: 'Un quart existe déjà pour cette date et période',
    BIZ_NO_OPEN_SHIFT: 'Aucun quart ouvert',
    BIZ_INVOICE_NOT_FOUND: 'Facture non trouvée',
    BIZ_EXPENSE_NOT_FOUND: 'Dépense non trouvée',
    BIZ_SUPPLIER_NOT_FOUND: 'Fournisseur non trouvé',
    BIZ_TANK_NOT_FOUND: 'Cuve non trouvée',
    BIZ_DELIVERY_NOT_FOUND: 'Livraison non trouvée',
    BIZ_CHECKLIST_NOT_FOUND: 'Checklist non trouvée',
    BIZ_CHECKLIST_ALREADY_EXISTS: 'Checklist déjà soumise pour cette période',
    BIZ_INCIDENT_NOT_FOUND: 'Incident non trouvé',
    BIZ_MAIL_NOT_FOUND: 'Courrier non trouvé',
    
    // Permission errors
    FORBIDDEN: 'Accès non autorisé',
    FORBIDDEN_STATION: 'Accès non autorisé à cette station',
    FORBIDDEN_ROLE: 'Rôle insuffisant pour cette action',
    
    // Server errors
    INTERNAL_ERROR: 'Erreur serveur, veuillez réessayer',
    
    // Default
    UNKNOWN_ERROR: 'Une erreur inattendue est survenue',
  };

  return errorMessages[code] || errorMessages.UNKNOWN_ERROR;
}

/**
 * Show success toast with standard formatting
 */
export function showSuccessToast(message: string, description?: string) {
  toast.success(message, { description });
}

/**
 * Show error toast with standard formatting
 */
export function showErrorToast(message: string, description?: string) {
  toast.error(message, { description });
}

/**
 * Show warning toast with standard formatting
 */
export function showWarningToast(message: string, description?: string) {
  toast.warning(message, { description });
}

/**
 * Show info toast with standard formatting
 */
export function showInfoToast(message: string, description?: string) {
  toast.info(message, { description });
}
