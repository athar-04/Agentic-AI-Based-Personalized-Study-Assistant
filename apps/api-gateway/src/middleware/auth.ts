import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '@agentic/auth';
import { AuthenticationError } from '@agentic/shared';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;

    // Forward user info to downstream services
    req.headers['x-user-id'] = payload.userId;
    req.headers['x-user-role'] = payload.role;
    req.headers['x-user-email'] = payload.email;
    req.headers['x-request-id'] = req.requestId;

    next();
  } catch {
    // Fixed message: verification errors must not describe why a token was rejected.
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'UNAUTHENTICATED',
      timestamp: new Date().toISOString(),
    });
  }
}
