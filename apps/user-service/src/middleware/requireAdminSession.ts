import { Request, Response, NextFunction } from 'express';

/**
 * Admin routes need two things: the persisted role is ADMIN (set by requireActiveUser from the
 * database, not the token) AND the session was started at the separate admin sign-in. A normal
 * sign-in never grants admin access, even for an admin account, so a stolen or shared student
 * session can't reach the console.
 */
export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'FORBIDDEN', timestamp: new Date().toISOString() });
    return;
  }
  if (req.tokenScope !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Sign in through the admin sign-in page to use the admin console.',
      code: 'ADMIN_SIGNIN_REQUIRED',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}
