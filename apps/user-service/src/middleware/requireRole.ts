import { Request, Response, NextFunction } from 'express';
import { AuthorizationError } from '@agentic/shared';

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      const error = new AuthorizationError(`Requires role: ${roles.join(' or ')}`);
      res.status(403).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}
