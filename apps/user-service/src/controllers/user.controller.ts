import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { successResponse, paginatedResponse } from '@agentic/shared';

const userService = new UserService();

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
      const user = await userService.updateAvatar(req.userId!, req.body.avatarUrl);
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
      const { page = 1, limit = 20 } = req.query as any;
      const { notifications, total } = await userService.getNotifications(req.userId!, +page, +limit);
      res.json(paginatedResponse(notifications, total, +page, +limit));
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
      const { page = 1, limit = 20, search } = req.query as any;
      const { users, total } = await userService.listUsers(+page, +limit, search);
      res.json(paginatedResponse(users, total, +page, +limit));
    } catch (error) { next(error); }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.getUserById(req.params.id as string);
      res.json(successResponse(user));
    } catch (error) { next(error); }
  };

  updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.updateUserRole(req.params.id as string, req.body.role);
      res.json(successResponse(user, 'Role updated'));
    } catch (error) { next(error); }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.deleteUser(req.params.id as string);
      res.json(successResponse(null, 'User deleted'));
    } catch (error) { next(error); }
  };
}

