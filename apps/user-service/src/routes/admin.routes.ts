import { Router, Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { requireAuth } from '../middleware/requireAuth';
import { requireActiveUser } from '../middleware/requireActiveUser';
import { requireAdminSession } from '../middleware/requireAdminSession';
import { validateBody } from '../middleware/validate';
import {
  adminRoleSchema,
  adminStatusSchema,
  adminUserQuerySchema,
  auditQuerySchema,
  paginatedResponse,
  successResponse,
  ValidationError,
} from '@agentic/shared';
import { z } from 'zod';

export const adminRouter = Router();
const svc = new AdminService();
const uuid = z.string().uuid();

// Every admin route: valid JWT, the persisted account is active and an ADMIN, and the session
// came from the admin sign-in. Hiding the admin UI is not the control; this is.
adminRouter.use(requireAuth, requireActiveUser, requireAdminSession);

function idParam(req: Request): string {
  const parsed = uuid.safeParse(req.params.id);
  if (!parsed.success) throw new ValidationError('Invalid user id');
  return parsed.data;
}

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

adminRouter.get('/overview', handle(async (_req, res) => {
  res.json(successResponse(await svc.overview()));
}));

adminRouter.get('/users', handle(async (req, res) => {
  const parsed = adminUserQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError('Invalid query parameters');
  const { users, total } = await svc.listUsers(parsed.data);
  res.json(paginatedResponse(users, total, parsed.data.page, parsed.data.limit));
}));

adminRouter.get('/users/:id', handle(async (req, res) => {
  res.json(successResponse(await svc.getUserForAdmin(req.userId!, idParam(req))));
}));

adminRouter.post('/users/:id/revoke-sessions', handle(async (req, res) => {
  const revoked = await svc.revokeSessions(req.userId!, idParam(req));
  res.json(successResponse({ revoked }, revoked ? `Signed out of ${revoked} session${revoked === 1 ? '' : 's'}` : 'No active sessions'));
}));

adminRouter.post('/users/:id/send-password-reset', handle(async (req, res) => {
  await svc.sendLink(req.userId!, idParam(req), 'RESET_PASSWORD');
  res.json(successResponse(null, 'Password reset link sent'));
}));

adminRouter.post('/users/:id/send-verification', handle(async (req, res) => {
  await svc.sendLink(req.userId!, idParam(req), 'VERIFY_EMAIL');
  res.json(successResponse(null, 'Verification link sent'));
}));

adminRouter.post('/users/:id/mark-verified', handle(async (req, res) => {
  res.json(successResponse(await svc.markVerified(req.userId!, idParam(req)), 'Email marked as verified'));
}));

adminRouter.delete('/users/:id', handle(async (req, res) => {
  await svc.deleteUser(req.userId!, idParam(req));
  res.json(successResponse(null, 'Account permanently deleted'));
}));

adminRouter.get('/activity', handle(async (req, res) => {
  const days = req.query.days === '30' ? 30 : 14;
  res.json(successResponse(await svc.activity(days)));
}));

adminRouter.get('/traffic', handle(async (_req, res) => {
  res.json(successResponse(await svc.traffic()));
}));

adminRouter.patch('/users/:id/role', validateBody(adminRoleSchema), handle(async (req, res) => {
  res.json(successResponse(await svc.changeRole(req.userId!, idParam(req), req.body.role), 'Role updated'));
}));

adminRouter.patch('/users/:id/status', validateBody(adminStatusSchema), handle(async (req, res) => {
  const user = await svc.setActive(req.userId!, idParam(req), req.body.isActive);
  res.json(successResponse(user, req.body.isActive ? 'Account reactivated' : 'Account deactivated'));
}));

adminRouter.get('/audit-log', handle(async (req, res) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError('Invalid query parameters');
  const { entries, total } = await svc.listAudit(parsed.data.page, parsed.data.limit, parsed.data.targetUserId);
  res.json(paginatedResponse(entries, total, parsed.data.page, parsed.data.limit));
}));
