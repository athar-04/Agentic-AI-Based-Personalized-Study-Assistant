import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '@agentic/auth';
import { AuthenticationError } from '@agentic/shared';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Try from gateway-forwarded header first
    const userId = req.headers['x-user-id'] as string;
    const userRole = req.headers['x-user-role'] as string;

    if (userId && userRole) {
      req.userId = userId;
      req.userRole = userRole;
      return next();
    }

    // Fallback: verify JWT directly (for direct service calls)
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw new AuthenticationError();
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Authentication required', timestamp: new Date().toISOString() });
  }
}
