import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { successResponse } from '@agentic/shared';

const svc = new AnalyticsService();

export class AnalyticsController {
  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await svc.getDashboard(req.params.userId as string, req.userId!);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  getWeakTopics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await svc.getWeakTopics(req.params.userId as string, req.userId!);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  getHeatmap = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { days = 90 } = req.query as any;
      const data = await svc.getStudyHeatmap(req.params.userId as string, req.userId!, +days);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  getReadinessScore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await svc.getReadinessScore(req.params.userId as string, req.userId!);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  getPerformanceTrends = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { period = '30d' } = req.query as any;
      const data = await svc.getPerformanceTrends(req.params.userId as string, req.userId!, period);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  getStreak = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await svc.getStreak(req.params.userId as string, req.userId!);
      res.json(successResponse(data));
    } catch (e) { next(e); }
  };

  recalculate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await svc.recalculateAnalytics(req.params.userId as string);
      res.json(successResponse(null, 'Analytics recalculated'));
    } catch (e) { next(e); }
  };
}

