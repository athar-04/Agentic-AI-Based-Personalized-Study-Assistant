import { Request, Response, NextFunction } from 'express';
import { AuthService, RESEND_COOLDOWN_SECONDS } from '../services/auth.service';
import { successResponse, errorResponse } from '@agentic/shared';
import { generateLinkToken } from '@agentic/auth';
import {
  REFRESH_COOKIE,
  OAUTH_STATE_COOKIE,
  clearOAuthStateCookie,
  clearRefreshCookie,
  readCookie,
  setOAuthStateCookie,
  setRefreshCookie,
} from '../lib/cookies';
import { logger } from '../utils/logger';

const authService = new AuthService();
const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// Shown for every resend / forgot-password request, whether or not the account exists.
const GENERIC_LINK_MESSAGE = 'If an account needs it, a new link is on its way. Check your inbox.';

export class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.status(202).json(successResponse(result, 'Check your email to verify your account'));
    } catch (error) {
      next(error);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resendVerification(req.body.email);
      res.json(successResponse({ retryAfterSeconds: RESEND_COOLDOWN_SECONDS }, GENERIC_LINK_MESSAGE));
    } catch (error) {
      next(error);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.verifyEmail(req.body.token, req.body.password);
      res.json(successResponse(null, 'Email verified. You can sign in now.'));
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const { response, refreshToken } = await authService.login(email, password);
      setRefreshCookie(res, refreshToken);
      res.json(successResponse(response, 'Login successful'));
    } catch (error) {
      next(error);
    }
  };

  adminLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { response, refreshToken } = await authService.adminLogin(req.body.email, req.body.password);
      setRefreshCookie(res, refreshToken);
      res.json(successResponse(response, 'Admin session started'));
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { response, refreshToken } = await authService.refresh(readCookie(req, REFRESH_COOKIE));
      setRefreshCookie(res, refreshToken);
      res.json(successResponse(response, 'Session refreshed'));
    } catch (error) {
      // No cookie clearing here: if another tab just rotated the session, this losing request's
      // response would otherwise delete the winner's fresh cookie.
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logout(readCookie(req, REFRESH_COOKIE));
      clearRefreshCookie(res);
      res.json(successResponse(null, 'Logged out successfully'));
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.forgotPassword(req.body.email);
      res.json(successResponse({ retryAfterSeconds: RESEND_COOLDOWN_SECONDS }, GENERIC_LINK_MESSAGE));
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      clearRefreshCookie(res);
      res.json(successResponse(null, 'Password updated. Sign in with your new password.'));
    } catch (error) {
      next(error);
    }
  };

  googleAuth = (_req: Request, res: Response) => {
    const state = generateLinkToken();
    const url = authService.googleAuthUrl(state);
    if (!url) {
      res.status(501).json(errorResponse('Google sign-in is not configured'));
      return;
    }
    setOAuthStateCookie(res, state);
    res.redirect(url);
  };

  // Browser-facing: always ends in a redirect to the web app, never a JSON body with tokens.
  googleCallback = async (req: Request, res: Response) => {
    const expected = readCookie(req, OAUTH_STATE_COOKIE);
    clearOAuthStateCookie(res);
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || !AuthService.statesMatch(state, expected)) {
      res.redirect(`${appUrl()}/auth/login?error=google`);
      return;
    }
    try {
      const { refreshToken } = await authService.googleLogin(code);
      setRefreshCookie(res, refreshToken);
      res.redirect(`${appUrl()}/dashboard`);
    } catch (error) {
      logger.warn(`Google sign-in failed: ${(error as Error).message}`);
      res.redirect(`${appUrl()}/auth/login?error=google`);
    }
  };
}
