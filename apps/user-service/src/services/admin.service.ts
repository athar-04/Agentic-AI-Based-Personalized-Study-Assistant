import { EmailTokenPurpose, Prisma, UserRole } from '@prisma/client';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { deleteCache } from '../lib/redis';
import { AdminUserQuery, ConflictError, NotFoundError, REDIS_KEYS } from '@agentic/shared';
import { writeAudit } from './audit';
import { AuthService } from './auth.service';

const authService = new AuthService();
const DAY_MS = 24 * 60 * 60 * 1000;
// Opening the same account repeatedly within this window is recorded once.
const VIEW_AUDIT_WINDOW_MS = 10 * 60 * 1000;

// What an admin may see about an account. No password hash, Google id, tokens or study content.
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  isEmailVerified: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * Serialises every change that could reduce the number of active admins. Two admins demoting
 * each other at the same moment would otherwise both see "another admin remains" and both succeed.
 */
async function lockAdminRows(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`;
}

async function countOtherActiveAdmins(tx: Prisma.TransactionClient, excludeId: string) {
  return tx.user.count({ where: { role: 'ADMIN', isActive: true, NOT: { id: excludeId } } });
}

export class AdminService {
  async overview() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, active, unverified, newThisWeek, byRole, recentActions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isEmailVerified: false } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    return {
      users: {
        total,
        active,
        deactivated: total - active,
        unverified,
        newThisWeek,
        byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])) as Partial<Record<UserRole, number>>,
      },
      recentActions: await this.withNames(recentActions),
    };
  }

  async listUsers(q: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {};
    if (q.search) {
      where.OR = (['email', 'firstName', 'lastName', 'username'] as const).map((field) => ({
        [field]: { contains: q.search, mode: 'insensitive' as const },
      }));
    }
    if (q.role) where.role = q.role;
    if (q.status === 'active') where.isActive = true;
    if (q.status === 'deactivated') where.isActive = false;
    if (q.status === 'unverified') where.isEmailVerified = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total };
  }

  async getUser(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { ...ADMIN_USER_SELECT, _count: { select: { studyPlans: true, quizAttempts: true } } },
    });
    if (!user) throw new NotFoundError('User');
    const history = await prisma.adminAuditLog.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const { _count, ...rest } = user;
    // Counts only: an admin can see that a student is active, not what they are studying.
    return { ...rest, activity: { studyPlans: _count.studyPlans, quizAttempts: _count.quizAttempts }, history: await this.withNames(history) };
  }

  /**
   * Everything an admin may see about one account: profile, security state and a study summary.
   * Never password hashes, token values or Google ids. Viewing someone else's account is itself
   * recorded in the audit log (once per 10 minutes per admin and account).
   */
  async getUserForAdmin(actorId: string, id: string) {
    const base = await this.getUser(id);
    const now = new Date();
    const [plans, attempts, sessionCounts, minutes, pendingRevisions, activeSessions, prefs] = await Promise.all([
      prisma.studyPlan.findMany({
        where: { userId: id },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, subject: true, status: true, totalTopics: true, completedTopics: true, createdAt: true, updatedAt: true },
      }),
      prisma.quizAttempt.findMany({
        where: { userId: id },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: { id: true, percentage: true, completedAt: true, quiz: { select: { title: true, subject: true, aiGenerated: true } } },
      }),
      prisma.studySession.groupBy({ by: ['status'], where: { userId: id }, _count: { _all: true } }),
      prisma.$queryRaw<{ total: number | null }[]>`
        SELECT COALESCE(SUM(COALESCE("actualMinutes", "durationMinutes")), 0)::int AS total
        FROM study_sessions WHERE "userId" = ${id} AND status = 'COMPLETED'`,
      prisma.revisionItem.count({ where: { userId: id, status: 'PENDING' } }),
      prisma.refreshToken.count({ where: { userId: id, isRevoked: false, expiresAt: { gt: now } } }),
      prisma.userPreferences.findUnique({ where: { userId: id }, select: { timezone: true, dailyStudyGoalMinutes: true } }),
    ]);

    if (actorId !== id) {
      const recent = await prisma.adminAuditLog.findFirst({
        where: { actorId, targetUserId: id, action: 'USER_DATA_VIEWED', createdAt: { gte: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) } },
        select: { id: true },
      });
      if (!recent) await writeAudit(prisma, { actorId, action: 'USER_DATA_VIEWED', targetUserId: id });
    }

    const byStatus = Object.fromEntries(sessionCounts.map((c) => [c.status, c._count._all]));
    return {
      ...base,
      security: { activeSessions },
      preferences: prefs,
      study: {
        totalMinutes: minutes[0]?.total ?? 0,
        sessions: {
          completed: byStatus.COMPLETED ?? 0,
          scheduled: (byStatus.SCHEDULED ?? 0) + (byStatus.RESCHEDULED ?? 0) + (byStatus.IN_PROGRESS ?? 0),
          missed: byStatus.MISSED ?? 0,
        },
        pendingRevisions,
        plans: plans.map((p) => ({
          ...p,
          completionPercentage: p.totalTopics ? Math.round((p.completedTopics / p.totalTopics) * 100) : 0,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        recentQuizzes: attempts.map((a) => ({
          id: a.id,
          title: a.quiz.title,
          subject: a.quiz.subject,
          source: a.quiz.aiGenerated ? 'AI' : 'SAMPLE_BANK',
          percentage: a.percentage,
          completedAt: a.completedAt.toISOString(),
        })),
      },
    };
  }

  /** Signs the account out everywhere: every live refresh token is revoked. */
  async revokeSessions(actorId: string, targetId: string) {
    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) throw new NotFoundError('User');
      const { count } = await tx.refreshToken.updateMany({
        where: { userId: targetId, isRevoked: false, expiresAt: { gt: new Date() } },
        data: { isRevoked: true },
      });
      await writeAudit(tx, { actorId, action: 'SESSIONS_REVOKED', targetUserId: targetId });
      return count;
    });
  }

  async sendLink(actorId: string, targetId: string, purpose: EmailTokenPurpose) {
    await authService.adminIssueLink(targetId, purpose);
    await writeAudit(prisma, {
      actorId,
      action: purpose === 'RESET_PASSWORD' ? 'PASSWORD_RESET_SENT' : 'VERIFICATION_SENT',
      targetUserId: targetId,
    });
  }

  /**
   * Admin override for when the email can't be delivered. It skips the owner's proof of the
   * address, so the console asks for confirmation and the action is audited.
   */
  async markVerified(actorId: string, targetId: string) {
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundError('User');
      if (target.isEmailVerified) throw new ConflictError('This email is already verified.', 'ALREADY_VERIFIED');
      const now = new Date();
      await tx.user.update({ where: { id: targetId }, data: { isEmailVerified: true, emailVerifiedAt: now } });
      await tx.emailToken.updateMany({ where: { userId: targetId, purpose: 'VERIFY_EMAIL', usedAt: null }, data: { usedAt: now } });
      await writeAudit(tx, {
        actorId,
        action: 'EMAIL_VERIFIED_BY_ADMIN',
        targetUserId: targetId,
        changes: { isEmailVerified: { from: false, to: true } },
      });
      return target;
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(user.id));
    return this.getUser(targetId);
  }

  /** Daily platform activity (UTC days), aggregate counts only. */
  async activity(days: 14 | 30) {
    const since = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS - (days - 1) * DAY_MS);
    type Row = { day: string; n: number };
    const [signups, activeUsers, minutes, quizzes, totals] = await Promise.all([
      prisma.$queryRaw<Row[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM users WHERE "createdAt" >= ${since} GROUP BY 1`,
      // A session token is issued at sign-in and on every refresh, so distinct users per day is a
      // fair "active users" measure without tracking anything new.
      prisma.$queryRaw<Row[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(DISTINCT "userId")::int AS n
        FROM refresh_tokens WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<Row[]>`
        SELECT to_char(date_trunc('day', "completedAt"), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(COALESCE("actualMinutes", "durationMinutes")), 0)::int AS n
        FROM study_sessions WHERE status = 'COMPLETED' AND "completedAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<Row[]>`
        SELECT to_char(date_trunc('day', "completedAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM quiz_attempts WHERE "completedAt" >= ${since} GROUP BY 1`,
      Promise.all([
        prisma.studyPlan.count(),
        prisma.studySession.count({ where: { status: 'COMPLETED' } }),
        prisma.quizAttempt.count(),
        prisma.revisionItem.count({ where: { status: 'PENDING' } }),
        prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(DISTINCT "userId")::int AS n FROM refresh_tokens WHERE "isRevoked" = false AND "expiresAt" > now()`,
      ]),
    ]);
    const series = (rows: Row[]) => {
      const byDay = new Map(rows.map((r) => [r.day, r.n]));
      return Array.from({ length: days }, (_, i) => {
        const day = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        return { day, value: byDay.get(day) ?? 0 };
      });
    };
    const [plans, completedSessions, quizAttempts, pendingRevisions, signedIn] = totals;
    return {
      days,
      signups: series(signups),
      activeUsers: series(activeUsers),
      studyMinutes: series(minutes),
      quizAttempts: series(quizzes),
      totals: { plans, completedSessions, quizAttempts, pendingRevisions, usersWithLiveSessions: signedIn[0]?.n ?? 0 },
    };
  }

  /** Gateway request counters, fetched with the internal token. The admin was authorised before this runs. */
  async traffic() {
    const url = process.env.API_GATEWAY_INTERNAL_URL;
    const token = process.env.INTERNAL_METRICS_TOKEN;
    if (!url || !token) return { available: false as const, reason: 'Traffic metrics are not configured on this server.' };
    try {
      const r = await axios.get(`${url.replace(/\/$/, '')}/internal/traffic`, { headers: { 'x-internal-token': token }, timeout: 3000 });
      return { available: true as const, ...(r.data as Record<string, unknown>) };
    } catch {
      return { available: false as const, reason: "The API gateway didn't respond." };
    }
  }

  async changeRole(actorId: string, targetId: string, role: UserRole) {
    const user = await prisma.$transaction(async (tx) => {
      await lockAdminRows(tx);
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundError('User');
      if (target.role === role) return null;
      if (actorId === targetId) throw new ConflictError('You cannot change your own role.', 'SELF_LOCKOUT');
      if (target.role === 'ADMIN' && target.isActive && (await countOtherActiveAdmins(tx, targetId)) === 0) {
        throw new ConflictError('This is the last active admin. Promote someone else first.', 'LAST_ADMIN');
      }
      const updated = await tx.user.update({ where: { id: targetId }, data: { role }, select: ADMIN_USER_SELECT });
      // Existing sessions carry the old role claim; end them.
      await tx.refreshToken.updateMany({ where: { userId: targetId, isRevoked: false }, data: { isRevoked: true } });
      await writeAudit(tx, { actorId, action: 'USER_ROLE_CHANGED', targetUserId: targetId, changes: { role: { from: target.role, to: role } } });
      return updated;
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(targetId));
    return user ?? this.getUser(targetId);
  }

  async setActive(actorId: string, targetId: string, isActive: boolean) {
    const user = await prisma.$transaction(async (tx) => {
      await lockAdminRows(tx);
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundError('User');
      if (target.isActive === isActive) return null;
      if (actorId === targetId) throw new ConflictError('You cannot deactivate your own account.', 'SELF_LOCKOUT');
      if (!isActive && target.role === 'ADMIN' && (await countOtherActiveAdmins(tx, targetId)) === 0) {
        throw new ConflictError('This is the last active admin and cannot be deactivated.', 'LAST_ADMIN');
      }
      const updated = await tx.user.update({ where: { id: targetId }, data: { isActive }, select: ADMIN_USER_SELECT });
      if (!isActive) {
        await tx.refreshToken.updateMany({ where: { userId: targetId, isRevoked: false }, data: { isRevoked: true } });
      }
      await writeAudit(tx, {
        actorId,
        action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        targetUserId: targetId,
        changes: { isActive: { from: target.isActive, to: isActive } },
      });
      return updated;
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(targetId));
    return user ?? this.getUser(targetId);
  }

  /** Permanent deletion is API-only and requires the account to be deactivated first. */
  async deleteUser(actorId: string, targetId: string) {
    await prisma.$transaction(async (tx) => {
      await lockAdminRows(tx);
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundError('User');
      if (actorId === targetId) throw new ConflictError('You cannot delete your own account here.', 'SELF_LOCKOUT');
      if (target.isActive) {
        throw new ConflictError('Deactivate the account before deleting it permanently.', 'MUST_DEACTIVATE_FIRST');
      }
      await tx.user.delete({ where: { id: targetId } });
      await writeAudit(tx, { actorId, action: 'USER_DELETED', targetUserId: targetId });
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(targetId));
  }

  async listAudit(page: number, limit: number, targetUserId?: string) {
    const where = targetUserId ? { targetUserId } : {};
    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.adminAuditLog.count({ where }),
    ]);
    return { entries: await this.withNames(rows), total };
  }

  /** Resolves ids to a display email at read time; the trail itself stores ids only. */
  private async withNames(rows: Array<{ id: string; actorId: string | null; action: string; targetUserId: string | null; changes: Prisma.JsonValue; createdAt: Date }>) {
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.targetUserId]).filter((x): x is string => !!x))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
      : [];
    const emailOf = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      changes: r.changes,
      createdAt: r.createdAt.toISOString(),
      actor: r.actorId ? { id: r.actorId, email: emailOf.get(r.actorId) ?? null } : { id: null, email: null, label: 'Local setup CLI' },
      target: r.targetUserId ? { id: r.targetUserId, email: emailOf.get(r.targetUserId) ?? null } : null,
    }));
  }
}
