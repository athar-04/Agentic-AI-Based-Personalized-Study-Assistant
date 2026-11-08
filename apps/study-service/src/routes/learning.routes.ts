import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OverviewService } from '../services/overview.service';
import { RevisionService, RevisionFilter } from '../services/revision.service';
import { PracticeService } from '../services/practice.service';
import { AiService } from '../services/ai.service';
import {
  aiQuizSchema,
  tutorSchema,
  quizAttemptSchema,
  revisionCreateSchema,
  revisionReviewSchema,
  successResponse,
  AppError,
  ValidationError,
} from '@agentic/shared';

const overview = new OverviewService();
const revisions = new RevisionService();
const practice = new PracticeService();
const ai = new AiService();
const uuid = z.string().uuid();

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

export const overviewRouter = Router();
overviewRouter.get('/', handle(async (req, res) => {
  res.json(successResponse(await overview.getOverview(req.userId!)));
}));

export const revisionRouter = Router();
revisionRouter.get('/', handle(async (req, res) => {
  const filter: RevisionFilter = parse(z.enum(['due', 'upcoming', 'all']).default('all'), req.query.filter);
  res.json(successResponse(await revisions.list(req.userId!, filter)));
}));
revisionRouter.post('/', handle(async (req, res) => {
  const { topicId } = parse(revisionCreateSchema, req.body);
  const { item, created } = await revisions.addTopic(req.userId!, topicId);
  res.status(created ? 201 : 200).json(successResponse(item, created ? 'Added to revision queue' : 'Already in your revision queue'));
}));
revisionRouter.post('/:id/review', handle(async (req, res) => {
  const { quality } = parse(revisionReviewSchema, req.body);
  res.json(successResponse(await revisions.review(req.userId!, parse(uuid, req.params.id), quality), 'Review recorded'));
}));
revisionRouter.delete('/:id', handle(async (req, res) => {
  await revisions.remove(req.userId!, parse(uuid, req.params.id));
  res.json(successResponse(null, 'Removed from revision queue'));
}));

export const practiceRouter = Router();
practiceRouter.get('/sample', (_req, res) => {
  res.json(successResponse(practice.listSampleSets()));
});
practiceRouter.get('/sample/:id', handle(async (req, res) => {
  res.json(successResponse(await practice.getSampleSet(parse(uuid, req.params.id))));
}));
practiceRouter.post('/sample/:id/attempts', handle(async (req, res) => {
  const body = parse(quizAttemptSchema, req.body);
  const result = await practice.submitAttempt(req.userId!, parse(uuid, req.params.id), body.answers, body.timeTakenSeconds);
  res.status(201).json(successResponse(result, 'Attempt saved'));
}));
practiceRouter.get('/attempts', handle(async (req, res) => {
  const limit = parse(z.coerce.number().int().min(1).max(50).default(10), req.query.limit);
  res.json(successResponse(await practice.recentAttempts(req.userId!, limit)));
}));
// Any quiz the student may take: a sample set, or an AI quiz generated for them. Answers withheld.
practiceRouter.get('/:id', handle(async (req, res) => {
  res.json(successResponse(await practice.getQuizForUser(req.userId!, parse(uuid, req.params.id))));
}));
practiceRouter.post('/:id/attempts', handle(async (req, res) => {
  const body = parse(quizAttemptSchema, req.body);
  const result = await practice.submitAttempt(req.userId!, parse(uuid, req.params.id), body.answers, body.timeTakenSeconds);
  res.status(201).json(successResponse(result, 'Attempt saved'));
}));

export const aiRouter = Router();
aiRouter.post('/tutor', handle(async (req, res) => {
  const body = parse(tutorSchema, req.body);
  res.json(successResponse(await ai.tutor(req.userId!, body)));
}));
/**
 * The tutor's answer as it is written: newline-delimited JSON, {"delta": "..."} per piece, then
 * {"done": true} or {"error": {code, message}}. Validation and topic ownership fail as ordinary
 * JSON errors before anything streams. Answers are never logged: they are study content.
 */
aiRouter.post('/tutor/stream', handle(async (req, res) => {
  const body = parse(tutorSchema, req.body);
  const messages = await ai.tutorMessages(req.userId!, body);
  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    // no-transform stops compression in the proxies from holding the stream back.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const controller = new AbortController();
  // The student left or pressed stop: stop paying for tokens nobody will read.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    await ai.streamTutor(messages, (text) => res.write(JSON.stringify({ delta: text }) + '\n'), controller.signal);
    res.end(JSON.stringify({ done: true }) + '\n');
  } catch (err) {
    if (res.writableEnded || controller.signal.aborted) return;
    const known = err instanceof AppError && err.isOperational;
    res.end(JSON.stringify({ error: { code: (known && err.code) || 'AI_UNAVAILABLE', message: known ? err.message : 'The tutor couldn’t answer. Please try again.' } }) + '\n');
  }
}));
aiRouter.post('/quiz', handle(async (req, res) => {
  const body = parse(aiQuizSchema, req.body);
  res.status(201).json(successResponse(await ai.generateQuiz(req.userId!, body), 'Quiz ready'));
}));
