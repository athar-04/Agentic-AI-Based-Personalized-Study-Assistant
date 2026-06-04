import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const userRouter = Router();
const ctrl = new UserController();

// All routes require auth
userRouter.use(requireAuth);

userRouter.get('/me', ctrl.getMe);
userRouter.put('/me', ctrl.updateMe);
userRouter.delete('/me', ctrl.deleteMe);
userRouter.put('/me/avatar', ctrl.updateAvatar);
userRouter.get('/me/preferences', ctrl.getPreferences);
userRouter.put('/me/preferences', ctrl.updatePreferences);
userRouter.get('/me/notifications', ctrl.getNotifications);
userRouter.put('/me/notifications/:id/read', ctrl.markNotificationRead);

// Admin only
userRouter.get('/', requireRole('ADMIN'), ctrl.listUsers);
userRouter.get('/:id', requireRole('ADMIN'), ctrl.getUserById);
userRouter.put('/:id/role', requireRole('ADMIN'), ctrl.updateUserRole);
userRouter.delete('/:id', requireRole('ADMIN'), ctrl.deleteUser);
