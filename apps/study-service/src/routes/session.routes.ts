import { Router } from 'express';
import { SessionController } from '../controllers/session.controller';

export const sessionRouter = Router();
const ctrl = new SessionController();

sessionRouter.get('/', ctrl.list);
sessionRouter.get('/upcoming', ctrl.getUpcoming);
sessionRouter.get('/today', ctrl.getToday);
sessionRouter.get('/:id', ctrl.getById);
sessionRouter.post('/', ctrl.create);
sessionRouter.put('/:id', ctrl.update);
sessionRouter.post('/:id/start', ctrl.start);
sessionRouter.post('/:id/complete', ctrl.complete);
sessionRouter.post('/:id/reschedule', ctrl.reschedule);
