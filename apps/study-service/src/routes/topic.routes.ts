import { Router } from 'express';
import { TopicController } from '../controllers/topic.controller';

export const topicRouter = Router();
const ctrl = new TopicController();

topicRouter.get('/plan/:planId', ctrl.listByPlan);
topicRouter.post('/plan/:planId', ctrl.create);
topicRouter.put('/:id', ctrl.update);
topicRouter.delete('/:id', ctrl.remove);
topicRouter.put('/:id/complete', ctrl.markComplete);
topicRouter.put('/:id/reorder', ctrl.reorder);
