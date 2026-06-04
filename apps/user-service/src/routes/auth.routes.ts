import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { registerSchema, loginSchema } from '@agentic/shared';

export const authRouter = Router();
const ctrl = new AuthController();

authRouter.post('/register', validateBody(registerSchema), ctrl.register);
authRouter.post('/login', validateBody(loginSchema), ctrl.login);
authRouter.post('/refresh', ctrl.refresh);
authRouter.post('/logout', ctrl.logout);
authRouter.get('/google', ctrl.googleAuth);
authRouter.get('/google/callback', ctrl.googleCallback);
authRouter.post('/verify-email/:token', ctrl.verifyEmail);
authRouter.post('/forgot-password', ctrl.forgotPassword);
authRouter.post('/reset-password/:token', ctrl.resetPassword);
