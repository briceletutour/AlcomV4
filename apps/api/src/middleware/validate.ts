import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../lib/response';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validate request data against a Zod schema.
 * Validated data replaces the original on the request object.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[target]);
      // Replace with parsed (& coerced) data
      (req as unknown as Record<string, unknown>)[target] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details: Record<string, string> = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          details[path] = issue.message;
        }

        sendError(res, {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details,
          statusCode: 400,
        });
        return;
      }

      next(error);
    }
  };
}

/**
 * Convenience function for validating query parameters.
 */
export function validateQuery(schema: ZodSchema) {
  return validate(schema, 'query');
}
