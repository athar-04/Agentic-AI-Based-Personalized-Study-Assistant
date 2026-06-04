import { prisma } from '../lib/prisma';
import { redisClient, setCache, getCache, deleteCache } from '../lib/redis';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@agentic/auth';
import {
  AuthResponseDto,
  AuthTokensDto,
  RegisterInput,
  ConflictError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from '@agentic/shared';
import { REDIS_KEYS } from '@agentic/shared';
import axios from 'axios';

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResponseDto> {
    const { email, username, password, firstName, lastName } = input;

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      if (existing.email === email) throw new ConflictError('Email already in use');
      throw new ConflictError('Username already taken');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        preferences: {
          create: {}, // defaults
        },
        analytics: {
          create: {}, // initialize analytics record
        },
      },
      include: { preferences: true },
    });

    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);

    // Cache user data
    await setCache(REDIS_KEYS.USER_CACHE(user.id), this.sanitizeUser(user), 3600);

    return { user: this.sanitizeUser(user), tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token is invalid or expired');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      throw new AuthenticationError('User account is inactive');
    }

    // Rotate refresh token
    await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { isRevoked: true } });

    return this.generateAndStoreTokens(user.id, user.email, user.role);
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });
  }

  async googleLogin(code: string): Promise<AuthResponseDto> {
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenRes.data;

    // Get user info
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: googleId, email, given_name, family_name, picture } = userRes.data;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      user = await prisma.user.create({
        data: {
          googleId,
          email,
          username: `${username}_${Date.now()}`,
          firstName: given_name || 'User',
          lastName: family_name || '',
          avatarUrl: picture,
          isEmailVerified: true,
          preferences: { create: {} },
          analytics: { create: {} },
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: picture ?? user.avatarUrl },
      });
    }

    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);
    return { user: this.sanitizeUser(user), tokens };
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await redisClient.get(`verify:${token}`);
    if (!userId) throw new ValidationError('Invalid or expired verification token');
    await prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
    await redisClient.del(`verify:${token}`);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Silent fail for security
    const token = crypto.randomUUID();
    await redisClient.setex(`reset:${token}`, 3600, user.id);
    // TODO: Send email with reset link — integrate SendGrid/Nodemailer
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await redisClient.get(`reset:${token}`);
    if (!userId) throw new ValidationError('Invalid or expired reset token');
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });
    await redisClient.del(`reset:${token}`);
  }

  private async generateAndStoreTokens(userId: string, email: string, role: string): Promise<AuthTokensDto> {
    const payload = { userId, email, role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: { userId, token: refreshToken, expiresAt },
    });

    return { accessToken, refreshToken, expiresIn: 900 }; // 15 min
  }

  private sanitizeUser(user: any) {
    const { passwordHash, googleId, ...safe } = user;
    return { ...safe, createdAt: user.createdAt?.toISOString() };
  }
}
