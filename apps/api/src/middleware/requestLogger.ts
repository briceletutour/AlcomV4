import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Log every request with structured JSON: method, path, userId, statusCode, latencyMs
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs,
      userId: req.user?.userId || 'anonymous',
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
