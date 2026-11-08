import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { successResponse } from '@agentic/shared';
import { NotFoundError, AuthorizationError, ValidationError } from '@agentic/shared';
import { deleteCache } from '../lib/redis';
import { REDIS_KEYS } from '@agentic/shared';
import { RevisionService } from '../services/revision.service';

// Fields a client may set on a topic. Everything else (planId, isCompleted, order, id) is server-managed.
const EDITABLE_FIELDS = ['title', 'description', 'bloomLevel', 'priority', 'estimatedHours'] as const;

function pickEditable(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  return data;
}

async function assertPlanOwner(planId: string, userId: string | undefined) {
  const plan = await prisma.studyPlan.findUnique({ where: { id: planId }, select: { userId: true } });
  if (!plan) throw new NotFoundError('Plan');
  if (plan.userId !== userId) throw new AuthorizationError();
}

async function assertTopicOwner(topicId: string, userId: string | undefined) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { plan: { select: { userId: true } } },
  });
  if (!topic) throw new NotFoundError('Topic');
  if (topic.plan.userId !== userId) throw new AuthorizationError();
  return topic;
}

export class TopicController {
  listByPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.planId as string;
      await assertPlanOwner(planId, req.userId);
      const topics = await prisma.topic.findMany({ where: { planId }, orderBy: { order: 'asc' } });
      res.json(successResponse(topics));
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.planId as string;
      await assertPlanOwner(planId, req.userId);
      const data = pickEditable(req.body);
      if (typeof data.title !== 'string' || !data.title.trim()) throw new ValidationError('title is required');

      const count = await prisma.topic.count({ where: { planId } });
      const [topic] = await prisma.$transaction([
        prisma.topic.create({ data: { ...data, title: data.title, planId, order: count } }),
        prisma.studyPlan.update({ where: { id: planId }, data: { totalTopics: { increment: 1 } } }),
      ]);
      await deleteCache(REDIS_KEYS.PLAN_CACHE(planId));
      res.status(201).json(successResponse(topic, 'Topic created'));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await assertTopicOwner(req.params.id as string, req.userId);
      const topic = await prisma.topic.update({ where: { id: existing.id }, data: pickEditable(req.body) });
      await deleteCache(REDIS_KEYS.PLAN_CACHE(existing.planId));
      res.json(successResponse(topic, 'Topic updated'));
    } catch (e) { next(e); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await assertTopicOwner(req.params.id as string, req.userId);
      await prisma.$transaction([
        prisma.topic.delete({ where: { id: topic.id } }),
        prisma.studyPlan.update({
          where: { id: topic.planId },
          data: {
            totalTopics: { decrement: 1 },
            ...(topic.isCompleted ? { completedTopics: { decrement: 1 } } : {}),
          },
        }),
      ]);
      await deleteCache(REDIS_KEYS.PLAN_CACHE(topic.planId));
      res.json(successResponse(null, 'Topic deleted'));
    } catch (e) { next(e); }
  };

  markComplete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await assertTopicOwner(req.params.id as string, req.userId);
      if (existing.isCompleted) {
        // Idempotent: don't double-count completedTopics.
        const { plan: _plan, ...topic } = existing;
        res.json(successResponse(topic, 'Topic already complete'));
        return;
      }
      const [topic] = await prisma.$transaction([
        prisma.topic.update({ where: { id: existing.id }, data: { isCompleted: true } }),
        prisma.studyPlan.update({ where: { id: existing.planId }, data: { completedTopics: { increment: 1 } } }),
      ]);
      await deleteCache(REDIS_KEYS.PLAN_CACHE(existing.planId));
      // Completing a topic schedules its first review for tomorrow.
      await new RevisionService().addTopic(req.userId!, existing.id, 1);
      res.json(successResponse(topic, 'Topic marked complete'));
    } catch (e) { next(e); }
  };

  reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await assertTopicOwner(req.params.id as string, req.userId);
      const order = Number(req.body.order);
      if (!Number.isInteger(order) || order < 0) throw new ValidationError('order must be a non-negative integer');
      const topic = await prisma.topic.update({ where: { id: existing.id }, data: { order } });
      await deleteCache(REDIS_KEYS.PLAN_CACHE(existing.planId));
      res.json(successResponse(topic, 'Topic reordered'));
    } catch (e) { next(e); }
  };
}
