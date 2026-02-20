import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Safely extract a header value as a string.
 * Handles the case where headers can be string | string[] | undefined.
 */
export function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Safely extract a route parameter as a string.
 */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export interface SuccessResponseOptions<T> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    [key: string]: unknown;
  };
  statusCode?: number;
}

export interface ErrorResponseOptions {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

export function sendSuccess<T>(res: Response, options: SuccessResponseOptions<T>): void {
  const { data, meta, statusCode = 200 } = options;
  res.status(statusCode).json({
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
  });
}

export function sendError(res: Response, options: ErrorResponseOptions): void {
  const { code, message, details, statusCode = 400 } = options;
  const traceId = getHeader(res.req, 'x-request-id') || uuidv4();
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
      traceId,
    },
    timestamp: new Date().toISOString(),
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
): void {
  sendSuccess(res, {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
