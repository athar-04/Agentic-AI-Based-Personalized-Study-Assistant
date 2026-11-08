import { prisma } from '../lib/prisma';
import { AuthorizationError, ConflictError, NotFoundError } from '@agentic/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export type RevisionFilter = 'due' | 'upcoming' | 'all';

/**
 * SM-2 spaced repetition (the scheme the schema's easeFactor/intervalDays fields were designed for).
 * quality: 0–5, where < 3 means "forgot" and restarts the interval.
 */
export function nextSchedule(item: { repetitionCount: number; intervalDays: number; easeFactor: number }, quality: number) {
  const easeFactor = Math.max(1.3, item.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  if (quality < 3) return { repetitionCount: 0, intervalDays: 1, easeFactor };
  const repetitionCount = item.repetitionCount + 1;
  const intervalDays = repetitionCount === 1 ? 1 : repetitionCount === 2 ? 6 : Math.round(item.intervalDays * easeFactor);
  return { repetitionCount, intervalDays, easeFactor };
}

export class RevisionService {
  async list(userId: string, filter: RevisionFilter) {
    const now = new Date();
    const where =
      filter === 'due' ? { userId, status: 'PENDING' as const, nextRevisionAt: { lte: now } }
      : filter === 'upcoming' ? { userId, status: 'PENDING' as const, nextRevisionAt: { gt: now } }
      : { userId };
    const items = await prisma.revisionItem.findMany({
      where,
      orderBy: { nextRevisionAt: 'asc' },
      take: 100,
      include: { topic: { select: { id: true, title: true, plan: { select: { id: true, title: true } } } } },
    });
    return items.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      nextRevisionAt: i.nextRevisionAt.toISOString(),
      lastRevisedAt: i.lastRevisedAt?.toISOString() ?? null,
      intervalDays: i.intervalDays,
      repetitionCount: i.repetitionCount,
      isDue: i.status === 'PENDING' && i.nextRevisionAt <= now,
      topic: i.topic ? { id: i.topic.id, title: i.topic.title } : null,
      plan: i.topic?.plan ?? null,
    }));
  }

  /** Idempotent per topic: a topic already in the queue is returned, not duplicated. */
  async addTopic(userId: string, topicId: string, dueInDays = 0) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { plan: { select: { userId: true } } } });
    if (!topic) throw new NotFoundError('Topic');
    if (topic.plan.userId !== userId) throw new AuthorizationError();

    const existing = await prisma.revisionItem.findFirst({ where: { userId, topicId, status: 'PENDING' } });
    if (existing) return { item: existing, created: false };
    const item = await prisma.revisionItem.create({
      data: { userId, topicId, title: topic.title, nextRevisionAt: new Date(Date.now() + dueInDays * DAY_MS) },
    });
    return { item, created: true };
  }

  /**
   * Optimistic concurrency: the update only applies if repetitionCount is unchanged since it was
   * read, so a double-submitted review cannot advance the schedule twice.
   */
  async review(userId: string, itemId: string, quality: number) {
    const item = await prisma.revisionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError('Revision item');
    if (item.userId !== userId) throw new AuthorizationError();

    const next = nextSchedule(item, quality);
    const now = new Date();
    const applied = await prisma.revisionItem.updateMany({
      where: { id: itemId, userId, repetitionCount: item.repetitionCount, lastRevisedAt: item.lastRevisedAt },
      data: { ...next, lastRevisedAt: now, nextRevisionAt: new Date(now.getTime() + next.intervalDays * DAY_MS), status: 'PENDING' },
    });
    if (applied.count !== 1) throw new ConflictError('This item was just reviewed. Refresh to see its new schedule.', 'STALE_REVIEW');
    return prisma.revisionItem.findUniqueOrThrow({ where: { id: itemId } });
  }

  async remove(userId: string, itemId: string) {
    const item = await prisma.revisionItem.findUnique({ where: { id: itemId }, select: { userId: true } });
    if (!item) throw new NotFoundError('Revision item');
    if (item.userId !== userId) throw new AuthorizationError();
    await prisma.revisionItem.delete({ where: { id: itemId } });
  }
}
