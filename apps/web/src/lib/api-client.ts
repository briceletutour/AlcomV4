const API_BASE =
  typeof window === 'undefined' && process.env.API_URL
    ? process.env.API_URL
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Record<string, unknown>,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();

  if (!response.ok || json.success === false) {
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('alcom-auth');
      localStorage.removeItem('access_token');
      window.location.href = '/auth/login';
    }

    throw new ApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An error occurred',
      response.status,
      json.error?.details,
      json.error?.traceId,
    );
  }

  // For paginated responses, return both data and meta
  // The envelope format is: { success: true, data: [...], meta: {...} }
  if (json.meta && Array.isArray(json.data)) {
    return { data: json.data, meta: json.meta } as T;
  }

  return json.data as T;
}

export async function apiFetchEnvelope<T>(endpoint: string, options: FetchOptions = {}): Promise<ApiEnvelope<T>> {
  const { body, headers: customHeaders, ...rest } = options;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();

  if (!response.ok || json.success === false) {
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('alcom-auth');
      localStorage.removeItem('access_token');
      window.location.href = '/auth/login';
    }

    throw new ApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An error occurred',
      response.status,
      json.error?.details,
      json.error?.traceId,
    );
  }

  return json as ApiEnvelope<T>;
}

// Convenience methods
export const api = {
  get: <T>(url: string) => apiFetch<T>(url, { method: 'GET' }),
  post: <T>(url: string, body: unknown) => apiFetch<T>(url, { method: 'POST', body }),
  put: <T>(url: string, body: unknown) => apiFetch<T>(url, { method: 'PUT', body }),
  patch: <T>(url: string, body: unknown) => apiFetch<T>(url, { method: 'PATCH', body }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
};
