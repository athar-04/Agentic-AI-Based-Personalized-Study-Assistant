import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { successResponse, errorResponse } from '@agentic/shared';
import { logger } from '../utils/logger';

const authService = new AuthService();

export class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(successResponse(result, 'Registration successful'));
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json(successResponse(result, 'Login successful'));
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json(errorResponse('Refresh token required'));
      }
      const tokens = await authService.refreshTokens(refreshToken);
      res.json(successResponse(tokens, 'Tokens refreshed'));
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }
      res.json(successResponse(null, 'Logged out successfully'));
    } catch (error) {
      next(error);
    }
  };

  googleAuth = (_req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(501).json(errorResponse('Google OAuth not configured'));
    }
    const redirectUri = encodeURIComponent(process.env.GOOGLE_CALLBACK_URL || '');
    const scope = encodeURIComponent('email profile');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    res.redirect(url);
  };

  googleCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).json(errorResponse('No auth code'));
      const result = await authService.googleLogin(code as string);
      res.json(successResponse(result, 'Google login successful'));
    } catch (error) {
      next(error);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.verifyEmail(req.params.token as string);
      res.json(successResponse(null, 'Email verified successfully'));
    } catch (error) { next(error); }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.forgotPassword(req.body.email);
      res.json(successResponse(null, 'If the email exists, a reset link has been sent'));
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.params.token as string, req.body.password);
      res.json(successResponse(null, 'Password reset successfully'));
    } catch (error) { next(error); }
  };
}
