import { Request, Response, NextFunction } from 'express';
import { AppError } from '@agentic/shared';
import { logger } from '../utils/logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  if (statusCode >= 500) {
    logger.error('Unhandled service error', {
      error: err.message,
      stack: err.stack,
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
