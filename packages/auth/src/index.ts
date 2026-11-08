import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';

// ─────────────────────────────────────────────
// JWT Utilities
// ─────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  /** "admin" only for sessions started at the admin sign-in. Absent on older tokens = "user". */
  scope?: 'user' | 'admin';
  iat?: number;
  exp?: number;
}

export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_SECRET_EXPIRES_IN || '15m') as any,
    jwtid: randomUUID(),
  });
}

export function generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');
  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
    // Unique per token: otherwise two logins in the same second yield an identical
    // token and violate RefreshToken.token @unique.
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return jwt.verify(token, secret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');
  return jwt.verify(token, secret) as JwtPayload;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Password Utilities
// ─────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─────────────────────────────────────────────
// Token extraction
// ─────────────────────────────────────────────

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

// ─────────────────────────────────────────────
// Single-use email link tokens
// ─────────────────────────────────────────────

/** 32 random bytes, URL-safe. The raw value only ever travels in the email. */
export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores. A leaked table cannot be replayed as links. */
export function hashLinkToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
