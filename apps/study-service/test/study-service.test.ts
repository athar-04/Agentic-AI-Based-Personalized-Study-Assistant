import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startTestDatabase } = require('../../../scripts/dev/test-db.mjs');

let db: { url: string; stop(): Promise<void> };
let server: Server;
let base: string;
let prisma: typeof import('../src/lib/prisma').prisma;
let auth: typeof import('@agentic/auth');

before(async () => {
  db = await startTestDatabase(54332);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: db.url,
    JWT_SECRET: randomBytes(32).toString('hex'),
    REDIS_URL: 'memory',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    // Nothing listens here: the AI planner is "offline" for these tests, and no paid API is called.
    AI_ORCHESTRATOR_URL: 'http://127.0.0.1:9',
    REVISION_AGENT_URL: 'http://127.0.0.1:9',
  });
  const { app } = await import('../src/app');
  ({ prisma } = await import('../src/lib/prisma'));
  auth = await import('@agentic/auth');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await prisma?.$disconnect();
  await db?.stop();
});

async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

async function student(opts: { timezone?: string; goal?: number } = {}) {
  const id = randomBytes(4).toString('hex');
  const user = await prisma.user.create({
    data: {
      email: `s${id}@example.test`,
      username: `s${id}`,
      firstName: 'S',
      lastName: 'T',
      isEmailVerified: true,
      preferences: { create: { timezone: opts.timezone ?? 'UTC', dailyStudyGoalMinutes: opts.goal ?? 45 } },
    },
  });
  return { user, token: auth.generateAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}

async function planFor(token: string, title = 'Physics finals') {
  const r = await call('POST', '/study/plans', token, { title, subject: 'Physics', startDate: new Date().toISOString(), dailyGoalHours: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data;
}

describe('student overview', () => {
  test('a brand-new student gets zeros and empty states, never sample numbers', async () => {
    const { token } = await student({ goal: 45 });
    const r = await call('GET', '/study/overview', token);
    assert.equal(r.status, 200);
    const o = r.body.data;
    assert.deepEqual(o.goal, { dailyMinutes: 45, todayMinutes: 0 });
    assert.equal(o.week.minutes, 0);
    assert.equal(o.week.days.length, 7);
    assert.equal(o.streakDays, 0);
    assert.equal(o.activePlan, null);
    assert.equal(o.nextSession, null);
    assert.equal(o.revisionsDue, 0);
    assert.deepEqual(o.recentQuizzes, []);
  });

  test('completed sessions drive today, week and streak; the next session is shown', async () => {
    const { token } = await student();
    const plan = await planFor(token);
    const topic = (await call('POST', `/study/topics/plan/${plan.id}`, token, { title: 'Entropy' })).body.data;

    const s1 = await call('POST', '/study/sessions', token, { planId: plan.id, topicId: topic.id, title: 'Read chapter 4', scheduledAt: new Date().toISOString(), durationMinutes: 30 });
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    const done = await call('POST', `/study/sessions/${s1.body.data.id}/complete`, token, { actualMinutes: 25, markTopicComplete: true });
    assert.equal(done.status, 200);
    // Completing twice must not double-count.
    await call('POST', `/study/sessions/${s1.body.data.id}/complete`, token, { actualMinutes: 25 });

    const later = new Date(Date.now() + 2 * 3600_000).toISOString();
    await call('POST', '/study/sessions', token, { planId: plan.id, title: 'Practice problems', scheduledAt: later, durationMinutes: 45 });

    const o = (await call('GET', '/study/overview', token)).body.data;
    assert.equal(o.goal.todayMinutes, 25);
    assert.equal(o.week.minutes, 25);
    assert.equal(o.streakDays, 1);
    assert.equal(o.activePlan.title, 'Physics finals');
    assert.equal(o.activePlan.completedTopics, 1);
    assert.equal(o.activePlan.completionPercentage, 100);
    assert.equal(o.nextSession.title, 'Practice problems');
  });

  test('invalid session input is rejected', async () => {
    const { token } = await student();
    const plan = await planFor(token);
    assert.equal((await call('POST', '/study/sessions', token, { planId: plan.id, title: '', scheduledAt: 'tomorrow' })).status, 400);
    assert.equal((await call('POST', '/study/sessions', token, { planId: plan.id, title: 'x', scheduledAt: new Date().toISOString(), durationMinutes: 9999 })).status, 400);
  });
});

describe('isolation between students', () => {
  test("one student cannot read or change another student's plan, topics or revisions", async () => {
    const a = await student();
    const b = await student();
    const plan = await planFor(a.token);
    const topic = (await call('POST', `/study/topics/plan/${plan.id}`, a.token, { title: 'Waves' })).body.data;
    const rev = (await call('POST', '/study/revisions', a.token, { topicId: topic.id })).body.data;

    assert.equal((await call('GET', `/study/plans/${plan.id}`, b.token)).status, 403);
    assert.equal((await call('DELETE', `/study/plans/${plan.id}`, b.token)).status, 403);
    assert.equal((await call('POST', `/study/topics/plan/${plan.id}`, b.token, { title: 'x' })).status, 403);
    assert.equal((await call('POST', '/study/revisions', b.token, { topicId: topic.id })).status, 403);
    assert.equal((await call('POST', `/study/revisions/${rev.id}/review`, b.token, { quality: 5 })).status, 403);
    assert.equal((await call('POST', '/study/sessions', b.token, { planId: plan.id, title: 'x', scheduledAt: new Date().toISOString() })).status, 403);
    const bList = (await call('GET', '/study/revisions', b.token)).body.data;
    assert.equal(bList.length, 0);
  });

  test('a deactivated student loses access immediately, even with a valid token', async () => {
    const { user, token } = await student();
    assert.equal((await call('GET', '/study/overview', token)).status, 200);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await call('GET', '/study/overview', token)).status, 401);
  });

  test('requests without a token are rejected', async () => {
    assert.equal((await call('GET', '/study/overview')).status, 401);
  });
});

describe('revision queue', () => {
  test('completing a topic queues its first review for tomorrow; reviews follow SM-2', async () => {
    const { token } = await student();
    const plan = await planFor(token);
    const topic = (await call('POST', `/study/topics/plan/${plan.id}`, token, { title: 'Thermodynamics' })).body.data;
    assert.equal((await call('PUT', `/study/topics/${topic.id}/complete`, token)).status, 200);

    const upcoming = (await call('GET', '/study/revisions?filter=upcoming', token)).body.data;
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].title, 'Thermodynamics');
    assert.equal((await call('GET', '/study/revisions?filter=due', token)).body.data.length, 0);

    // Adding the same topic again does not duplicate it.
    const again = await call('POST', '/study/revisions', token, { topicId: topic.id });
    assert.equal(again.status, 200);

    const reviewed = await call('POST', `/study/revisions/${upcoming[0].id}/review`, token, { quality: 5 });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.data.repetitionCount, 1);
    assert.equal(reviewed.body.data.intervalDays, 1);
    const second = await call('POST', `/study/revisions/${upcoming[0].id}/review`, token, { quality: 5 });
    assert.equal(second.body.data.intervalDays, 6);
    const forgot = await call('POST', `/study/revisions/${upcoming[0].id}/review`, token, { quality: 1 });
    assert.equal(forgot.body.data.repetitionCount, 0);
    assert.equal(forgot.body.data.intervalDays, 1);

    assert.equal((await call('POST', `/study/revisions/${upcoming[0].id}/review`, token, { quality: 9 })).status, 400);
  });
});

describe('practice quizzes', () => {
  test('questions are served without answers and graded on the server', async () => {
    const { token } = await student();
    const sets = (await call('GET', '/study/quizzes/sample', token)).body.data;
    assert.ok(sets.length >= 3);
    assert.ok(sets.every((s: any) => s.source === 'SAMPLE_BANK'));

    const set = (await call('GET', `/study/quizzes/sample/${sets[0].id}`, token)).body.data;
    assert.equal(set.questions.length, 5);
    assert.ok(!JSON.stringify(set).match(/correctAnswer|explanation/), 'answers must not reach the browser before submission');

    // Answer the first two correctly (read from the DB, as a grader would) and leave the rest blank.
    const truth = await prisma.question.findMany({ where: { quizId: set.id }, orderBy: { order: 'asc' } });
    const answers = truth.slice(0, 2).map((q) => ({ questionId: q.id, answer: q.correctAnswer }));
    answers.push({ questionId: truth[2].id, answer: 'definitely wrong' });
    const r = await call('POST', `/study/quizzes/sample/${set.id}/attempts`, token, { answers });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.score, 2);
    assert.equal(r.body.data.maxScore, 5);
    assert.equal(r.body.data.percentage, 40);
    assert.equal(r.body.data.results.filter((x: any) => x.yourAnswer === null).length, 2);

    const o = (await call('GET', '/study/overview', token)).body.data;
    assert.equal(o.recentQuizzes.length, 1);
    assert.equal(o.recentQuizzes[0].percentage, 40);
    assert.equal(o.recentQuizzes[0].source, 'SAMPLE_BANK');
  });

  test('answers to questions outside the set are rejected', async () => {
    const { token } = await student();
    const sets = (await call('GET', '/study/quizzes/sample', token)).body.data;
    const other = (await call('GET', `/study/quizzes/sample/${sets[1].id}`, token)).body.data;
    const r = await call('POST', `/study/quizzes/sample/${sets[0].id}/attempts`, token, {
      answers: [{ questionId: other.questions[0].id, answer: 'x' }],
    });
    assert.equal(r.status, 400);
  });
});

describe('AI planner availability', () => {
  test('when the AI service is unreachable the request fails with 503 and no fake "AI" plan is saved', async () => {
    const { user, token } = await student();
    const r = await call('POST', '/study/plans/generate-ai', token, { subject: 'Chemistry' });
    assert.equal(r.status, 503);
    assert.equal(await prisma.studyPlan.count({ where: { userId: user.id } }), 0);
  });
});
