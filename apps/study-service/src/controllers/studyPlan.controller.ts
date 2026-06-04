import { Request, Response, NextFunction } from 'express';
import { StudyPlanService } from '../services/studyPlan.service';
import { successResponse, paginatedResponse } from '@agentic/shared';

const svc = new StudyPlanService();

export class StudyPlanController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await svc.createPlan(req.userId!, req.body);
      res.status(201).json(successResponse(plan, 'Study plan created'));
    } catch (e) { next(e); }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20, status } = req.query as any;
      const { plans, total } = await svc.listPlans(req.userId!, +page, +limit, status);
      res.json(paginatedResponse(plans, total, +page, +limit));
    } catch (e) { next(e); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await svc.getPlanById(req.params.id as string, req.userId!);
      res.json(successResponse(plan));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await svc.updatePlan(req.params.id as string, req.userId!, req.body);
      res.json(successResponse(plan, 'Study plan updated'));
    } catch (e) { next(e); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await svc.deletePlan(req.params.id as string, req.userId!);
      res.json(successResponse(null, 'Study plan deleted'));
    } catch (e) { next(e); }
  };

  generateWithAI = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await svc.generateAIPlan(req.userId!, req.body);
      res.status(201).json(successResponse(plan, 'AI study plan generated'));
    } catch (e) { next(e); }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await svc.updateStatus(req.params.id as string, req.userId!, req.body.status);
      res.json(successResponse(plan, 'Status updated'));
    } catch (e) { next(e); }
  };

  getProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await svc.getPlanProgress(req.params.id as string, req.userId!);
      res.json(successResponse(progress));
    } catch (e) { next(e); }
  };
}

