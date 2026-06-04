import { Router } from 'express';
import { StudyPlanController } from '../controllers/studyPlan.controller';

export const studyPlanRouter = Router();
const ctrl = new StudyPlanController();

studyPlanRouter.post('/', ctrl.create);
studyPlanRouter.get('/', ctrl.list);
studyPlanRouter.get('/:id', ctrl.getById);
studyPlanRouter.put('/:id', ctrl.update);
studyPlanRouter.delete('/:id', ctrl.remove);
studyPlanRouter.post('/:id/generate-ai', ctrl.generateWithAI);
studyPlanRouter.put('/:id/status', ctrl.updateStatus);
studyPlanRouter.get('/:id/progress', ctrl.getProgress);
