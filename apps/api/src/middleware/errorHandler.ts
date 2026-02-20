import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { sendError } from '../lib/response';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler — catches all unhandled errors.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, {
      code: err.code,
      message: err.message,
      details: err.details,
      statusCode: err.statusCode,
    });
    return;
  }

  // Log unexpected errors
  logger.error({
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  sendError(res, {
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
    statusCode: 500,
  });
}
