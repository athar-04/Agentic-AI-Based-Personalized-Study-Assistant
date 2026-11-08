import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Runs after requireAuth. The JWT proves identity, but its role claim can be up to 15 minutes
 * stale, so authorization reads the persisted role and account status instead. A demoted or
 * deactivated user loses access on their next request, not when their token expires.
 */
export async function requireActiveUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.userId
      ? await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true, isActive: true } })
      : null;
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'This account is not active',
        code: 'ACCOUNT_INACTIVE',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    req.userRole = user.role;
    next();
  } catch (err) {
    next(err);
  }
}
