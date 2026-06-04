import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service';
import { successResponse, paginatedResponse } from '@agentic/shared';

const svc = new SessionService();

export class SessionController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20, planId, status } = req.query as any;
      const { sessions, total } = await svc.listSessions(req.userId!, +page, +limit, planId, status);
      res.json(paginatedResponse(sessions, total, +page, +limit));
    } catch (e) { next(e); }
  };

  getUpcoming = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await svc.getUpcomingSessions(req.userId!);
      res.json(successResponse(sessions));
    } catch (e) { next(e); }
  };

  getToday = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await svc.getTodaySessions(req.userId!);
      res.json(successResponse(sessions));
    } catch (e) { next(e); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.getSessionById(req.params.id as string, req.userId!);
      res.json(successResponse(session));
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.createSession(req.userId!, req.body);
      res.status(201).json(successResponse(session, 'Session created'));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.updateSession(req.params.id as string, req.userId!, req.body);
      res.json(successResponse(session, 'Session updated'));
    } catch (e) { next(e); }
  };

  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.startSession(req.params.id as string, req.userId!);
      res.json(successResponse(session, 'Session started'));
    } catch (e) { next(e); }
  };

  complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.completeSession(req.params.id as string, req.userId!, req.body);
      res.json(successResponse(session, 'Session completed'));
    } catch (e) { next(e); }
  };

  reschedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await svc.rescheduleSession(req.params.id as string, req.userId!, req.body.newDate);
      res.json(successResponse(session, 'Session rescheduled'));
    } catch (e) { next(e); }
  };
}

