import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireActiveUser } from '../middleware/requireActiveUser';
import { requireAdminSession } from '../middleware/requireAdminSession';
import { validateBody } from '../middleware/validate';
import { adminRoleSchema, preferencesUpdateSchema, profileUpdateSchema } from '@agentic/shared';

export const userRouter = Router();
const ctrl = new UserController();

// All routes: valid JWT, and the persisted account must still be active.
userRouter.use(requireAuth, requireActiveUser);

userRouter.get('/me', ctrl.getMe);
userRouter.put('/me', validateBody(profileUpdateSchema), ctrl.updateMe);
userRouter.delete('/me', ctrl.deleteMe);
userRouter.put('/me/avatar', ctrl.updateAvatar);
userRouter.get('/me/preferences', ctrl.getPreferences);
userRouter.put('/me/preferences', validateBody(preferencesUpdateSchema), ctrl.updatePreferences);
userRouter.get('/me/notifications', ctrl.getNotifications);
userRouter.put('/me/notifications/:id/read', ctrl.markNotificationRead);

// Legacy admin endpoints, kept for API compatibility. They share the guarded AdminService
// (persisted role check, self-lockout and last-admin protection, audit) with /admin.
userRouter.get('/', requireAdminSession, ctrl.listUsers);
userRouter.get('/:id', requireAdminSession, ctrl.getUserById);
userRouter.put('/:id/role', requireAdminSession, validateBody(adminRoleSchema), ctrl.updateUserRole);
userRouter.delete('/:id', requireAdminSession, ctrl.deleteUser);
