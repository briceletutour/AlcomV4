'use client';

import { useMutation, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './api-client';

type MutationToastOptions = {
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  showRetry?: boolean;
  onRetry?: () => void;
};

interface MutationWithToastParams<TData, TError, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  toast?: MutationToastOptions;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: TError, variables: TVariables) => void;
}

/**
 * Enhanced useMutation hook with automatic toast notifications
 */
export function useMutationWithToast<TData = unknown, TError = Error, TVariables = void>(
  params: MutationWithToastParams<TData, TError, TVariables>,
): UseMutationResult<TData, TError, TVariables, unknown> {
  const { mutationFn, toast: toastOptions, onSuccess, onError } = params;
  const {
    loadingMessage,
    successMessage = 'Success!',
    errorMessage = 'An error occurred',
    showRetry = false,
    onRetry,
  } = toastOptions || {};

  return useMutation({
    mutationFn,
    onMutate: () => {
      // Show loading toast if configured
      if (loadingMessage) {
        return { _toastId: toast.loading(loadingMessage) };
      }
      return undefined;
    },
    onSuccess: (data, variables, context) => {
      // Dismiss loading toast
      const ctx = context as { _toastId?: string | number } | undefined;
      if (ctx?._toastId) {
        toast.dismiss(ctx._toastId);
      }
      
      // Show success toast
      if (successMessage) {
        toast.success(successMessage);
      }
      
      // Call original onSuccess
      onSuccess?.(data, variables);
    },
    onError: (error, variables, context) => {
      // Dismiss loading toast
      const ctx = context as { _toastId?: string | number } | undefined;
      if (ctx?._toastId) {
        toast.dismiss(ctx._toastId);
      }
      
      // Get error message
      let message = errorMessage;
      if (error instanceof ApiError) {
        message = error.message;
      } else if (error instanceof Error) {
        // Check for network errors
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          message = 'Network connection error. Please check your connection.';
        } else {
          message = error.message || errorMessage;
        }
      }
      
      // Show error toast with optional retry
      if (showRetry && onRetry) {
        toast.error('Error', {
          description: message,
          action: {
            label: 'Retry',
            onClick: onRetry,
          },
          duration: 8000,
        });
      } else {
        toast.error('Error', {
          description: message,
        });
      }
      
      // Call original onError
      onError?.(error, variables);
    },
  });
}

/**
 * Handle query errors with toast
 */
export function handleQueryError(
  error: unknown,
  options?: {
    errorMessage?: string;
    showRetry?: boolean;
    onRetry?: () => void;
  },
) {
  const { errorMessage = 'Failed to load data', showRetry = true, onRetry } = options || {};
  
  let message = errorMessage;
  if (error instanceof ApiError) {
    message = error.message;
  } else if (error instanceof Error) {
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
      message = 'Network connection error. Please check your connection.';
    } else {
      message = error.message || errorMessage;
    }
  }

  if (showRetry && onRetry) {
    toast.error('Error', {
      description: message,
      action: {
        label: 'Retry',
        onClick: onRetry,
      },
      duration: 8000,
    });
  } else {
    toast.error('Error', {
      description: message,
    });
  }
}
