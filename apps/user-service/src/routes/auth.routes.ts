import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { requireCsrfSafeRequest } from '../middleware/csrf';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
} from '@agentic/shared';

export const authRouter = Router();
const ctrl = new AuthController();

authRouter.post('/register', validateBody(registerSchema), ctrl.register);
authRouter.post('/resend-verification', validateBody(emailOnlySchema), ctrl.resendVerification);
// Tokens arrive in the body, never the path, so they stay out of access logs.
authRouter.post('/verify-email', validateBody(verifyEmailSchema), ctrl.verifyEmail);
authRouter.post('/login', validateBody(loginSchema), ctrl.login);
// Separate sign-in for the admin console; only it can start an admin-scoped session.
authRouter.post('/admin/login', validateBody(loginSchema), ctrl.adminLogin);
// Authenticated by the refresh cookie, so these two need CSRF protection.
authRouter.post('/refresh', requireCsrfSafeRequest, ctrl.refresh);
authRouter.post('/logout', requireCsrfSafeRequest, ctrl.logout);
authRouter.post('/forgot-password', validateBody(emailOnlySchema), ctrl.forgotPassword);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), ctrl.resetPassword);
authRouter.get('/google', ctrl.googleAuth);
authRouter.get('/google/callback', ctrl.googleCallback);
