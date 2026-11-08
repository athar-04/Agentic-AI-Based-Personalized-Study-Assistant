import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { AdminService } from '../services/admin.service';
import { successResponse, paginatedResponse, adminUserQuerySchema, ValidationError } from '@agentic/shared';

const userService = new UserService();
const adminService = new AdminService();

export class UserController {
  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.getUserById(req.userId!);
      res.json(successResponse(user));
    } catch (error) { next(error); }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.updateUser(req.userId!, req.body);
      res.json(successResponse(user, 'Profile updated'));
    } catch (error) { next(error); }
  };

  deleteMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.deactivateUser(req.userId!);
      res.json(successResponse(null, 'Account deactivated'));
    } catch (error) { next(error); }
  };

  updateAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const avatarUrl = req.body?.avatarUrl;
      if (typeof avatarUrl !== 'string' || !/^https:\/\/[^\s]{1,500}$/.test(avatarUrl)) {
        throw new ValidationError('avatarUrl must be an https URL');
      }
      const user = await userService.updateAvatar(req.userId!, avatarUrl);
      res.json(successResponse(user, 'Avatar updated'));
    } catch (error) { next(error); }
  };

  getPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prefs = await userService.getPreferences(req.userId!);
      res.json(successResponse(prefs));
    } catch (error) { next(error); }
  };

  updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prefs = await userService.updatePreferences(req.userId!, req.body);
      res.json(successResponse(prefs, 'Preferences updated'));
    } catch (error) { next(error); }
  };

  getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
      const { notifications, total } = await userService.getNotifications(req.userId!, page, limit);
      res.json(paginatedResponse(notifications, total, page, limit));
    } catch (error) { next(error); }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.markNotificationRead(req.userId!, req.params.id as string);
      res.json(successResponse(null, 'Notification marked as read'));
    } catch (error) { next(error); }
  };

  listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = adminUserQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('Invalid query parameters');
      const { users, total } = await adminService.listUsers(parsed.data);
      res.json(paginatedResponse(users, total, parsed.data.page, parsed.data.limit));
    } catch (error) { next(error); }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(successResponse(await adminService.getUser(req.params.id as string)));
    } catch (error) { next(error); }
  };

  updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await adminService.changeRole(req.userId!, req.params.id as string, req.body.role);
      res.json(successResponse(user, 'Role updated'));
    } catch (error) { next(error); }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await adminService.deleteUser(req.userId!, req.params.id as string);
      res.json(successResponse(null, 'User deleted'));
    } catch (error) { next(error); }
  };
}

