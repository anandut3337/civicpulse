import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Centralised error -> HTTP mapping. Every error response uses the same
 * envelope: { success: false, error: { code, message, details? } }
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // 1. Expected, intentional errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // 2. Request validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() },
    });
    return;
  }

  // 2b. Upload errors (size / count limits)
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      success: false,
      error: { code: err.code, message: tooBig ? 'A file is too large (videos up to 50 MB, photos up to 10 MB)' : err.message },
    });
    return;
  }

  // 3. Known Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'A record with these unique values already exists' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
      return;
    }
  }

  // 4. Malformed JSON body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
    return;
  }

  // 5. Unexpected -> log in full, never leak internals
  logger.error('Unhandled error', {
    method: req.method,
    url: req.originalUrl,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProduction ? 'Something went wrong' : err instanceof Error ? err.message : 'Unknown error',
    },
  });
}
