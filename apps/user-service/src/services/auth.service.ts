import { timingSafeEqual } from 'crypto';
import { EmailTokenPurpose, Prisma, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteCache } from '../lib/redis';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateLinkToken,
  hashLinkToken,
} from '@agentic/auth';
import {
  AuthResponseDto,
  RegisterInput,
  RegisterResponseDto,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  REDIS_KEYS,
} from '@agentic/shared';
import axios from 'axios';
import { accountExistsMail, passwordResetMail, sendMail, verificationMail } from '../lib/mailer';
import { writeAudit } from './audit';

const HOUR_MS = 60 * 60 * 1000;
const ACCESS_TOKEN_SECONDS = 900;
const REFRESH_TOKEN_DAYS = 7;
// Admin sessions are deliberately short: a forgotten admin tab stops working within the day.
const ADMIN_SESSION_HOURS = 12;

export type SessionScope = 'user' | 'admin';

/** Link lifetime and resend limits per purpose. Limits are per account, on top of the gateway's per-IP limit. */
const LINK_POLICY: Record<EmailTokenPurpose, { ttlMs: number; cooldownMs: number; maxPerDay: number }> = {
  VERIFY_EMAIL: { ttlMs: 24 * HOUR_MS, cooldownMs: 60 * 1000, maxPerDay: 5 },
  RESET_PASSWORD: { ttlMs: 1 * HOUR_MS, cooldownMs: 60 * 1000, maxPerDay: 5 },
};

export const RESEND_COOLDOWN_SECONDS = LINK_POLICY.VERIFY_EMAIL.cooldownMs / 1000;

/** On by default. Turning it off is an explicit operator decision, not a fallback. */
export function emailVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
}

// Compared against when the email is unknown, so a miss costs the same bcrypt time as a hit.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('timing-equaliser-not-a-real-password'));
// Built at startup rather than on first use: otherwise the first unknown-email sign-in is twice
// as slow as every later one, which is both a visible stall and a timing tell.
void getDummyHash();

export interface SessionResult {
  response: AuthResponseDto;
  /** Goes into the HttpOnly cookie, never into a response body. */
  refreshToken: string;
}

export class AuthService {
  async register(input: RegisterInput): Promise<RegisterResponseDto> {
    const { email, username, password, firstName, lastName } = input;
    const passwordHash = await hashPassword(password);

    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) {
      if (existing.email === email) {
        // Same answer as a fresh signup, so the form cannot be used to test which emails have accounts.
        // The real owner gets a new link (unverified) or a heads-up (verified).
        if (!existing.isEmailVerified) {
          // Nobody has proved this address yet, so the latest registrant's password replaces the old
          // one. Verifying then requires this password as well as the emailed link, so whoever
          // registered first (possibly not the owner) can never end up holding the verified account.
          await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, firstName, lastName } });
          await prisma.refreshToken.updateMany({ where: { userId: existing.id }, data: { isRevoked: true } });
          await this.issueLink(existing, 'VERIFY_EMAIL', { enforceLimits: true });
        } else {
          await sendMail(accountExistsMail(existing.email, existing.firstName));
        }
        return { verificationRequired: true, email };
      }
      throw new ConflictError('Username already taken', 'USERNAME_TAKEN');
    }

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        preferences: { create: {} },
        analytics: { create: {} },
      },
    });

    await this.issueLink(user, 'VERIFY_EMAIL', { enforceLimits: false });
    return { verificationRequired: true, email };
  }

  async resendVerification(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified || !user.isActive) return;
    await this.issueLink(user, 'VERIFY_EMAIL', { enforceLimits: true });
  }

  /**
   * Needs the emailed link AND the account password: the link proves the inbox, the password proves
   * this is the person who set it. Without the password, an attacker who registered someone else's
   * address first could have the owner "verify" an account whose password the attacker knows.
   *
   * Race-safe single use: the UPDATE only matches an unused, unexpired row, and Postgres row
   * locking means two concurrent requests cannot both match it. Marking the user verified
   * happens in the same transaction, so a failure leaves the token unused.
   */
  async verifyEmail(rawToken: string, password: string): Promise<void> {
    const pending = await prisma.emailToken.findUnique({
      where: { tokenHash: hashLinkToken(rawToken) },
      include: { user: { select: { passwordHash: true } } },
    });
    if (!pending || pending.purpose !== 'VERIFY_EMAIL' || pending.usedAt || pending.expiresAt <= new Date()) {
      throw new ValidationError('This link is invalid, has expired, or has already been used.', 'TOKEN_INVALID');
    }
    const hash = pending.user.passwordHash;
    if (!hash || !(await comparePassword(password, hash))) {
      throw new ValidationError("That password doesn't match the one chosen for this account.", 'PASSWORD_MISMATCH');
    }
    await prisma.$transaction(async (tx) => {
      const userId = await this.claimLink(tx, rawToken, 'VERIFY_EMAIL');
      const now = new Date();
      // Only if the password is still the one just checked (a re-registration may have replaced it).
      const verified = await tx.user.updateMany({
        where: { id: userId, passwordHash: hash },
        data: { isEmailVerified: true, emailVerifiedAt: now },
      });
      if (verified.count !== 1) {
        throw new ValidationError("That password doesn't match the one chosen for this account.", 'PASSWORD_MISMATCH');
      }
      await tx.emailToken.updateMany({ where: { userId, purpose: 'VERIFY_EMAIL', usedAt: null }, data: { usedAt: now } });
    });
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.passwordHash) {
      await comparePassword(password, await getDummyHash());
      throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!(await comparePassword(password, user.passwordHash))) {
      throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    // Status is only revealed to someone who knows the password.
    if (!user.isActive) {
      throw new AuthorizationError('This account has been deactivated. Contact an administrator.', 'ACCOUNT_DEACTIVATED');
    }
    if (emailVerificationRequired() && !user.isEmailVerified) {
      throw new AuthorizationError('Please verify your email address before signing in.', 'EMAIL_NOT_VERIFIED');
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.startSession(updated);
  }

  /**
   * The separate admin sign-in. Every failure (unknown email, wrong password, not an admin,
   * deactivated, unverified) gets the same answer after the same bcrypt work, so this page can't
   * be used to find out which accounts exist or which are admins.
   */
  async adminLogin(email: string, password: string): Promise<SessionResult> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const passwordOk = await comparePassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !user.passwordHash || !passwordOk || user.role !== 'ADMIN' || !user.isActive || !user.isEmailVerified) {
      throw new AuthenticationError('Invalid admin credentials', 'INVALID_CREDENTIALS');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await writeAudit(tx, { actorId: user.id, action: 'ADMIN_SIGNED_IN', targetUserId: user.id });
      return u;
    });
    return this.startSession(updated, 'admin');
  }

  /** Admin-triggered verification or reset link. No cooldown: an admin acts deliberately and is audited. */
  async adminIssueLink(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ValidationError('User not found');
    if (purpose === 'VERIFY_EMAIL' && user.isEmailVerified) throw new ConflictError('This email is already verified.', 'ALREADY_VERIFIED');
    if (purpose === 'RESET_PASSWORD' && (!user.passwordHash || !user.isActive)) {
      throw new ValidationError('This account has no password to reset or is deactivated.', 'RESET_NOT_POSSIBLE');
    }
    await this.issueLink(user, purpose, { enforceLimits: false });
  }

  /**
   * Rotation: the presented token is revoked atomically and a new one issued. A replayed,
   * revoked or concurrently-used token matches no row and is rejected.
   */
  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    // Distinct from an expired session: a visitor who never signed in, so clients needn't retry.
    if (!rawToken) throw new AuthenticationError('No active session', 'NO_SESSION');
    let userId: string;
    let scope: SessionScope;
    try {
      const payload = verifyRefreshToken(rawToken);
      userId = payload.userId;
      scope = payload.scope === 'admin' ? 'admin' : 'user';
    } catch {
      throw new AuthenticationError('Session expired', 'SESSION_EXPIRED');
    }

    const claimed = await prisma.refreshToken.updateMany({
      where: { token: hashLinkToken(rawToken), userId, isRevoked: false, expiresAt: { gt: new Date() } },
      data: { isRevoked: true },
    });
    if (claimed.count !== 1) throw new AuthenticationError('Session expired', 'SESSION_EXPIRED');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new AuthenticationError('Session expired', 'SESSION_EXPIRED');
    if (emailVerificationRequired() && !user.isEmailVerified) {
      throw new AuthenticationError('Session expired', 'SESSION_EXPIRED');
    }
    // An admin session ends if the account stops being an admin.
    if (scope === 'admin' && user.role !== 'ADMIN') throw new AuthenticationError('Session expired', 'SESSION_EXPIRED');
    return this.startSession(user, scope);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await prisma.refreshToken.updateMany({ where: { token: hashLinkToken(rawToken) }, data: { isRevoked: true } });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.passwordHash) return;
    await this.issueLink(user, 'RESET_PASSWORD', { enforceLimits: true });
  }

  /** Same claim pattern as verifyEmail. Receiving the link also proves the address, so it verifies it. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const userId = await prisma.$transaction(async (tx) => {
      const id = await this.claimLink(tx, rawToken, 'RESET_PASSWORD');
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          isEmailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      await tx.refreshToken.updateMany({ where: { userId: id }, data: { isRevoked: true } });
      return id;
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(userId));
  }

  googleAuthUrl(state: string): string | null {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL || '',
      response_type: 'code',
      scope: 'email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  static statesMatch(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  async googleLogin(code: string): Promise<SessionResult> {
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    });
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });
    const { id: googleId, email: rawEmail, verified_email, given_name, family_name, picture } = userRes.data;
    if (!verified_email) throw new AuthenticationError('Google has not verified this email address', 'GOOGLE_EMAIL_UNVERIFIED');
    const email = String(rawEmail).toLowerCase().trim();

    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } });
    if (!user) {
      const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);
      user = await prisma.user.create({
        data: {
          googleId,
          email,
          username: `${base}_${Date.now().toString(36)}`,
          firstName: given_name || 'User',
          lastName: family_name || '',
          avatarUrl: picture,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          preferences: { create: {} },
          analytics: { create: {} },
        },
      });
    } else if (!user.googleId) {
      // Linking by email. If the existing account never proved ownership, whoever set its
      // password may not own the address (pre-account takeover), so that password is discarded
      // and its sessions revoked. Google has just proved ownership.
      const proven = user.isEmailVerified;
      const userId = user.id;
      user = await prisma.$transaction(async (tx) => {
        if (!proven) await tx.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });
        return tx.user.update({
          where: { id: userId },
          data: {
            googleId,
            avatarUrl: user!.avatarUrl ?? picture,
            ...(proven ? {} : { passwordHash: null, isEmailVerified: true, emailVerifiedAt: new Date() }),
          },
        });
      });
    }
    if (!user.isActive) {
      throw new AuthorizationError('This account has been deactivated. Contact an administrator.', 'ACCOUNT_DEACTIVATED');
    }
    return this.startSession(user);
  }

  // ─── internals ───

  private async startSession(user: User, scope: SessionScope = 'user'): Promise<SessionResult> {
    const payload = { userId: user.id, email: user.email, role: user.role, scope };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const expiresAt = new Date(Date.now() + (scope === 'admin' ? ADMIN_SESSION_HOURS : REFRESH_TOKEN_DAYS * 24) * HOUR_MS);
    // Stored hashed, like email links: a database leak does not yield usable sessions.
    await prisma.refreshToken.create({ data: { userId: user.id, token: hashLinkToken(refreshToken), expiresAt } });
    return {
      response: { user: this.sanitizeUser(user), accessToken, expiresIn: ACCESS_TOKEN_SECONDS, scope },
      refreshToken,
    };
  }

  /**
   * Creates a link token and emails it. Older unused links of the same purpose are retired so
   * only the newest works. With enforceLimits, a cooldown and daily cap apply; hitting them is
   * silent because every caller answers generically.
   */
  private async issueLink(user: User, purpose: EmailTokenPurpose, opts: { enforceLimits: boolean }): Promise<void> {
    const policy = LINK_POLICY[purpose];
    const now = Date.now();
    if (opts.enforceLimits) {
      const recent = await prisma.emailToken.findMany({
        where: { userId: user.id, purpose, createdAt: { gte: new Date(now - 24 * HOUR_MS) } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (recent.length >= policy.maxPerDay) return;
      if (recent[0] && now - recent[0].createdAt.getTime() < policy.cooldownMs) return;
    }

    const raw = generateLinkToken();
    await prisma.$transaction([
      prisma.emailToken.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date(now) } }),
      prisma.emailToken.create({
        data: { userId: user.id, purpose, tokenHash: hashLinkToken(raw), expiresAt: new Date(now + policy.ttlMs) },
      }),
    ]);

    const mail = purpose === 'VERIFY_EMAIL'
      ? verificationMail(user.email, user.firstName, raw)
      : passwordResetMail(user.email, user.firstName, raw);
    await sendMail(mail);
  }

  /** Atomically marks the token used if, and only if, it is unused and unexpired. Returns its user. */
  private async claimLink(tx: Prisma.TransactionClient, rawToken: string, purpose: EmailTokenPurpose): Promise<string> {
    const tokenHash = hashLinkToken(rawToken);
    const now = new Date();
    const claimed = await tx.emailToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw new ValidationError('This link is invalid, has expired, or has already been used.', 'TOKEN_INVALID');
    }
    const token = await tx.emailToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    return token.userId;
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
