import { prisma } from '../lib/prisma';
import { NotFoundError, AuthorizationError, ValidationError, sessionCreateSchema } from '@agentic/shared';
import { RevisionService } from './revision.service';
import { redisClient } from '../lib/redis';
import { REDIS_CHANNELS } from '@agentic/shared';
import axios from 'axios';

export class SessionService {
  async createSession(userId: string, data: unknown) {
    const parsed = sessionCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const { planId, topicId, title, scheduledAt, durationMinutes } = parsed.data;

    // Verify plan ownership
    const plan = await prisma.studyPlan.findUnique({ where: { id: planId }, select: { userId: true } });
    if (!plan) throw new NotFoundError('Study plan');
    if (plan.userId !== userId) throw new AuthorizationError();
    if (topicId) {
      const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { planId: true } });
      if (!topic || topic.planId !== planId) throw new ValidationError('topicId must belong to the same plan');
    }

    const session = await prisma.studySession.create({
      data: { planId, topicId, userId, title, scheduledAt: new Date(scheduledAt), durationMinutes },
    });
    return this.formatSession(session);
  }

  async listSessions(userId: string, page: number, limit: number, planId?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (planId) where.planId = planId;
    if (status) where.status = status;

    const [sessions, total] = await Promise.all([
      prisma.studySession.findMany({ where, skip, take: limit, orderBy: { scheduledAt: 'asc' } }),
      prisma.studySession.count({ where }),
    ]);
    return { sessions: sessions.map((x) => this.formatSession(x)), total };
  }

  async getUpcomingSessions(userId: string) {
    const sessions = await prisma.studySession.findMany({
      where: { userId, status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    });
    return sessions.map((x) => this.formatSession(x));
  }

  async getTodaySessions(userId: string) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const sessions = await prisma.studySession.findMany({
      where: { userId, scheduledAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { scheduledAt: 'asc' },
    });
    return sessions.map((x) => this.formatSession(x));
  }

  async getSessionById(sessionId: string, userId: string) {
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session');
    if (session.userId !== userId) throw new AuthorizationError();
    return this.formatSession(session);
  }

  async updateSession(sessionId: string, userId: string, data: any) {
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session');
    if (session.userId !== userId) throw new AuthorizationError();

    const updated = await prisma.studySession.update({
      where: { id: sessionId },
      data: {
        title: typeof data?.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 120) : undefined,
        notes: typeof data?.notes === 'string' ? data.notes.slice(0, 2000) : undefined,
        durationMinutes: Number.isInteger(data?.durationMinutes) && data.durationMinutes >= 5 && data.durationMinutes <= 480 ? data.durationMinutes : undefined,
      },
    });
    return this.formatSession(updated);
  }

  async startSession(sessionId: string, userId: string) {
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session');
    if (session.userId !== userId) throw new AuthorizationError();

    const updated = await prisma.studySession.update({
      where: { id: sessionId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    return this.formatSession(updated);
  }

  async completeSession(sessionId: string, userId: string, data: any) {
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session');
    if (session.userId !== userId) throw new AuthorizationError();

    // Completing twice must not double-count minutes or analytics.
    if (session.status === 'COMPLETED') return this.formatSession(session);
    const actualMinutes = Number(data?.actualMinutes ?? session.durationMinutes);
    if (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 24 * 60) {
      throw new ValidationError('actualMinutes must be a whole number between 1 and 1440');
    }
    const updated = await prisma.studySession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        actualMinutes,
        notes: typeof data?.notes === 'string' ? data.notes.slice(0, 2000) : session.notes,
      },
    });

    // Update analytics via pub/sub
    await redisClient.publish(REDIS_CHANNELS.SESSION_COMPLETED, JSON.stringify({
      userId, sessionId, planId: session.planId, actualMinutes, topicId: session.topicId,
    }));

    // If topic linked, check completion
    if (session.topicId && data?.markTopicComplete) {
      // Count the topic once, even if several sessions mark it complete.
      const marked = await prisma.topic.updateMany({ where: { id: session.topicId, isCompleted: false }, data: { isCompleted: true } });
      if (marked.count === 1) {
        await prisma.studyPlan.update({ where: { id: session.planId }, data: { completedTopics: { increment: 1 } } });
        await new RevisionService().addTopic(userId, session.topicId, 1);
      }
    }

    // Trigger revision scheduling via AI
    if (session.topicId) {
      const revisionUrl = process.env.REVISION_AGENT_URL || 'http://localhost:8004';
      axios.post(`${revisionUrl}/schedule`, {
        userId, topicId: session.topicId, sessionId,
      }).catch(() => {}); // Fire and forget
    }

    return this.formatSession(updated);
  }

  async rescheduleSession(sessionId: string, userId: string, newDate: string) {
    if (typeof newDate !== 'string' || Number.isNaN(Date.parse(newDate))) throw new ValidationError('newDate must be a valid date');
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session');
    if (session.userId !== userId) throw new AuthorizationError();

    const updated = await prisma.studySession.update({
      where: { id: sessionId },
      data: { scheduledAt: new Date(newDate), status: 'RESCHEDULED' },
    });
    return this.formatSession(updated);
  }

  private formatSession(s: any) {
    return {
      ...s,
      scheduledAt: s.scheduledAt?.toISOString?.() ?? s.scheduledAt,
      startedAt: s.startedAt?.toISOString?.() ?? s.startedAt,
      completedAt: s.completedAt?.toISOString?.() ?? s.completedAt,
      createdAt: s.createdAt?.toISOString?.() ?? s.createdAt,
    };
  }
}
