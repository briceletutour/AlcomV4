'use client';

import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Handle specific API error codes
    const messages: Record<string, string> = {
      AUTH_MISSING_TOKEN: 'Session expirée',
      AUTH_INVALID_TOKEN: 'Session invalide',
      FORBIDDEN: 'Accès non autorisé',
      FORBIDDEN_STATION: 'Accès non autorisé à cette station',
    };
    return messages[error.code] || error.message;
  }
  if (error instanceof Error) {
    if (error.message.includes('fetch')) {
      return 'Erreur de connexion réseau';
    }
    return error.message;
  }
  return 'Une erreur est survenue';
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors
              if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Only show error toast if we haven't already handled it in the component
            // and it's not a background refetch
            if (query.state.data !== undefined) {
              // Background refetch failed - show toast
              toast.error(getErrorMessage(error));
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            // Show toast for all mutation errors
            toast.error(getErrorMessage(error));
          },
        }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
