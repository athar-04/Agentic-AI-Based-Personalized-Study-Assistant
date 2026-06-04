import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';

export const analyticsRouter = Router();
const ctrl = new AnalyticsController();

analyticsRouter.get('/:userId', ctrl.getDashboard);
analyticsRouter.get('/:userId/weak-topics', ctrl.getWeakTopics);
analyticsRouter.get('/:userId/heatmap', ctrl.getHeatmap);
analyticsRouter.get('/:userId/readiness-score', ctrl.getReadinessScore);
analyticsRouter.get('/:userId/trends', ctrl.getPerformanceTrends);
analyticsRouter.get('/:userId/streak', ctrl.getStreak);
analyticsRouter.post('/:userId/recalculate', ctrl.recalculate);
