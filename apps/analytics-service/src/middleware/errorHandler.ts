import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '@agentic/shared';
import { logger } from '../utils/logger';

// Prisma "known request" codes that are client errors, not server faults.
const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: 'A record with this value already exists' },
  P2003: { status: 400, message: 'Related record does not exist' },
  P2025: { status: 404, message: 'Record not found' },
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let statusCode = 500;
  let message = 'Internal server error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    if (err.isOperational) message = err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && PRISMA_STATUS[err.code]) {
    ({ status: statusCode, message } = PRISMA_STATUS[err.code]);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid request data';
  }

  if (statusCode >= 500) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error('Unhandled service error', {
      error: e.message,
      stack: e.stack,
      path: req.path,
      method: req.method,
      userId: req.userId,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
}
