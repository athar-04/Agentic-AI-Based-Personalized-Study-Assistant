import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { successResponse } from '@agentic/shared';
import { NotFoundError, AuthorizationError } from '@agentic/shared';

export class TopicController {
  listByPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await prisma.studyPlan.findUnique({ where: { id: req.params.planId as string }, select: { userId: true } });
      if (!plan) throw new NotFoundError('Plan');
      if (plan.userId !== req.userId) throw new AuthorizationError();
      const topics = await prisma.topic.findMany({ where: { planId: req.params.planId as string }, orderBy: { order: 'asc' } });
      res.json(successResponse(topics));
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await prisma.studyPlan.findUnique({ where: { id: req.params.planId as string }, select: { userId: true } });
      if (!plan) throw new NotFoundError('Plan');
      if (plan.userId !== req.userId) throw new AuthorizationError();
      const count = await prisma.topic.count({ where: { planId: req.params.planId as string } });
      const topic = await prisma.topic.create({
        data: { ...req.body, planId: req.params.planId as string, order: count },
      });
      await prisma.studyPlan.update({ where: { id: req.params.planId as string }, data: { totalTopics: { increment: 1 } } });
      res.status(201).json(successResponse(topic, 'Topic created'));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.update({ where: { id: req.params.id as string }, data: req.body });
      res.json(successResponse(topic, 'Topic updated'));
    } catch (e) { next(e); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.findUnique({ where: { id: req.params.id as string } });
      if (!topic) throw new NotFoundError('Topic');
      await prisma.topic.delete({ where: { id: req.params.id as string } });
      await prisma.studyPlan.update({ where: { id: topic.planId as string }, data: { totalTopics: { decrement: 1 } } });
      res.json(successResponse(null, 'Topic deleted'));
    } catch (e) { next(e); }
  };

  markComplete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.update({ where: { id: req.params.id as string }, data: { isCompleted: true } });
      await prisma.studyPlan.update({ where: { id: topic.planId as string }, data: { completedTopics: { increment: 1 } } });
      res.json(successResponse(topic, 'Topic marked complete'));
    } catch (e) { next(e); }
  };

  reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { order } = req.body;
      const topic = await prisma.topic.update({ where: { id: req.params.id as string }, data: { order } });
      res.json(successResponse(topic, 'Topic reordered'));
    } catch (e) { next(e); }
  };
}

