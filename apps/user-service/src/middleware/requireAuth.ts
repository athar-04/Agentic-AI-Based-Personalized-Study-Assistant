import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '@agentic/auth';

/**
 * Always verifies the bearer JWT. The gateway's x-user-* headers are deliberately ignored:
 * this port is reachable directly, so those headers are attacker-controlled.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required', timestamp: new Date().toISOString() });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.tokenScope = payload.scope === 'admin' ? 'admin' : 'user';
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token', timestamp: new Date().toISOString() });
  }
}
