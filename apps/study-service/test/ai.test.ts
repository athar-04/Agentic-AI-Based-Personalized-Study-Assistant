import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startTestDatabase } = require('../../../scripts/dev/test-db.mjs');

/**
 * A fake OpenAI-compatible provider, so these tests need no key, no network and cost nothing.
 * It records what it was asked and answers according to `mode`.
 */
let mode: 'ok' | 'badJsonOnce' | 'reject' | 'cutoff' | 'thinking' = 'ok';
let badJsonServed = false;
const seen: { model: string; messages: { role: string; content: string }[]; auth?: string; json: boolean; effort?: string }[] = [];

function fakeReply(body: { messages: { role: string; content: string }[]; response_format?: unknown }): string {
  const system = body.messages[0]?.content ?? '';
  if (system.includes('multiple-choice')) {
    if (mode === 'badJsonOnce' && !badJsonServed) {
      badJsonServed = true;
      return 'Sure! Here are some questions...';
    }
    const n = Number(/Write (\d+) questions/.exec(body.messages[1].content)?.[1] ?? 3);
    return JSON.stringify({
      questions: Array.from({ length: n }, (_, i) => ({
        question: `Question ${i + 1} about the topic?`,
        options: [`Right ${i}`, `Wrong A${i}`, `Wrong B${i}`, `Wrong C${i}`],
        correctIndex: 0,
        explanation: `Because Right ${i} is right.`,
      })),
    });
  }
  if (system.includes('design study plans')) {
    return '```json\n' + JSON.stringify({ topics: ['Basics', 'Core ideas', 'Applications', 'Review'].map((t) => ({ title: t, estimatedHours: 2, bloomLevel: 'UNDERSTAND' })) }) + '\n```';
  }
  return `Tutor answer. Context seen: ${system.includes('currently studying') ? 'yes' : 'no'}. History: ${body.messages.length - 2}.`;
}

const fake: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw);
    seen.push({ model: body.model, messages: body.messages, auth: req.headers.authorization, json: Boolean(body.response_format), effort: body.reasoning_effort });
    if (body.model === 'busy-model') {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":{"message":"high demand"}}');
      return;
    }
    if (body.model === 'missing-model') {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":{"message":"not found"}}');
      return;
    }
    // Never answers; the client must give up on it and move on.
    if (body.model === 'slow-model') {
      setTimeout(() => res.destroy(), 3_000);
      return;
    }
    // Like Gemma: refuses reasoning_effort outright.
    if (body.model === 'no-effort-model' && body.reasoning_effort) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":{"message":"reasoning not supported"}}');
      return;
    }
    if (mode === 'reject') {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":{"message":"bad key"}}');
      return;
    }
    // Like Gemma: private reasoning inline before the answer, split awkwardly across pieces.
    const reply = mode === 'thinking' ? `<thought>secret working ${'x'.repeat(40)}</thought>

${fakeReply(body)}` : fakeReply(body);
    if (body.stream) {
      // Server-sent events, a few words per event, like real providers.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const words = mode === 'thinking' ? reply.match(/.{1,4}/gs) ?? [] : reply.split(/(?<= )/);
      const send = (t: string) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      if (mode === 'cutoff') {
        words.slice(0, 2).forEach(send);
        setTimeout(() => res.destroy(), 20);
        return;
      }
      words.forEach(send);
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
  });
});

let db: { url: string; stop(): Promise<void> };
let server: Server;
let base: string;
let prisma: typeof import('../src/lib/prisma').prisma;
let auth: typeof import('@agentic/auth');
let resetAiHealth: () => void;

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  db = await startTestDatabase(54333);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: db.url,
    JWT_SECRET: randomBytes(32).toString('hex'),
    REDIS_URL: 'memory',
    AI_BASE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`,
    AI_MODEL: 'fake-model',
    AI_API_KEY: 'test-key-not-real',
  });
  const { app } = await import('../src/app');
  ({ prisma } = await import('../src/lib/prisma'));
  auth = await import('@agentic/auth');
  ({ resetAiHealth } = await import('../src/lib/ai'));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  fake.close();
  await prisma?.$disconnect();
  await db?.stop();
});

async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/** Reads a newline-delimited JSON stream to the end. */
async function stream(path: string, token: string, body: unknown) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const text = await r.text();
  const isStream = (r.headers.get('content-type') ?? '').includes('ndjson');
  const events = isStream ? text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { status: r.status, events, body: isStream ? null : JSON.parse(text), text: events.map((e) => e.delta ?? '').join('') };
}

async function student() {
  const id = randomBytes(4).toString('hex');
  const user = await prisma.user.create({ data: { email: `a${id}@example.test`, username: `a${id}`, firstName: 'A', lastName: 'B', isEmailVerified: true } });
  return { user, token: auth.generateAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}

async function topicFor(token: string) {
  const plan = (await call('POST', '/study/plans', token, { title: 'Bio', subject: 'Biology', startDate: new Date().toISOString() })).body.data;
  return (await call('POST', `/study/topics/plan/${plan.id}`, token, { title: 'Photosynthesis' })).body.data;
}

describe('AI tutor', () => {
  test('answers through the configured provider, with the key sent only as a bearer header', async () => {
    mode = 'ok';
    const { token } = await student();
    const r = await call('POST', '/study/ai/tutor', token, { message: 'What is osmosis?', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] });
    assert.equal(r.status, 200);
    assert.match(r.body.data.reply, /Tutor answer\. Context seen: no\. History: 2\./);
    const last = seen[seen.length - 1];
    assert.equal(last.auth, 'Bearer test-key-not-real');
    assert.equal(last.messages[last.messages.length - 1].content, 'What is osmosis?');
  });

  test("includes the student's own topic as context, and refuses someone else's topic", async () => {
    mode = 'ok';
    const a = await student();
    const b = await student();
    const topic = await topicFor(a.token);
    const ok = await call('POST', '/study/ai/tutor', a.token, { message: 'Explain it', topicId: topic.id });
    assert.match(ok.body.data.reply, /Context seen: yes/);
    assert.equal((await call('POST', '/study/ai/tutor', b.token, { message: 'Explain it', topicId: topic.id })).status, 403);
  });

  test('empty questions are rejected; health reports the provider without the key', async () => {
    const { token } = await student();
    assert.equal((await call('POST', '/study/ai/tutor', token, { message: '  ' })).status, 400);
    const h = await call('GET', '/health');
    assert.deepEqual(h.body.ai, { configured: true, provider: '127.0.0.1', model: 'fake-model' });
    assert.ok(!JSON.stringify(h.body).includes('test-key-not-real'));
  });
});

describe('AI topic quizzes', () => {
  test("a quiz on the student's topic: answers withheld, graded on the server, saved as AI", async () => {
    mode = 'ok';
    const { token } = await student();
    const topic = await topicFor(token);
    const g = await call('POST', '/study/ai/quiz', token, { topicId: topic.id, questionCount: 4, difficulty: 'BEGINNER' });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    assert.equal(g.body.data.questions.length, 4);
    assert.equal(g.body.data.source, 'AI');
    assert.equal(g.body.data.topic, 'Photosynthesis');
    assert.ok(!JSON.stringify(g.body).match(/correctAnswer|explanation|correctIndex/), 'answers leaked');
    const prompt = seen[seen.length - 1].messages[1].content;
    assert.match(prompt, /"Photosynthesis" \(subject: Biology\)/);

    // Fetch it again through the generic route, then answer: right, wrong, right, unanswered.
    const quiz = (await call('GET', `/study/quizzes/${g.body.data.id}`, token)).body.data;
    const answers = quiz.questions.slice(0, 3).map((q: { id: string; options: string[] }, i: number) => ({
      questionId: q.id,
      answer: i === 1 ? q.options.find((o) => o.startsWith('Wrong'))! : q.options.find((o) => o.startsWith('Right'))!,
    }));
    const r = await call('POST', `/study/quizzes/${quiz.id}/attempts`, token, { answers });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.score, 2);
    assert.equal(r.body.data.maxScore, 4);

    const o = (await call('GET', '/study/overview', token)).body.data;
    assert.equal(o.recentQuizzes[0].source, 'AI');
  });

  test('options are shuffled so the right answer is not always first', async () => {
    mode = 'ok';
    const { token } = await student();
    const g = await call('POST', '/study/ai/quiz', token, { topic: 'Cell division', questionCount: 10 });
    const firstIsRight = g.body.data.questions.filter((q: { options: string[] }) => q.options[0].startsWith('Right')).length;
    assert.ok(firstIsRight < 10, 'every correct answer stayed in position 1');
  });

  test("another student can't open or answer someone's AI quiz", async () => {
    mode = 'ok';
    const a = await student();
    const b = await student();
    const g = await call('POST', '/study/ai/quiz', a.token, { topic: 'Genetics', questionCount: 3 });
    assert.equal((await call('GET', `/study/quizzes/${g.body.data.id}`, b.token)).status, 404);
    const q = g.body.data.questions[0];
    assert.equal((await call('POST', `/study/quizzes/${g.body.data.id}/attempts`, b.token, { answers: [{ questionId: q.id, answer: q.options[0] }] })).status, 404);
  });

  test('malformed model output is retried once and then succeeds', async () => {
    mode = 'badJsonOnce';
    badJsonServed = false;
    const { token } = await student();
    const before = seen.length;
    const g = await call('POST', '/study/ai/quiz', token, { topic: 'Enzymes', questionCount: 3 });
    assert.equal(g.status, 201);
    assert.equal(seen.length - before, 2);
  });

  test('a quiz needs a topic', async () => {
    const { token } = await student();
    assert.equal((await call('POST', '/study/ai/quiz', token, { questionCount: 3 })).status, 400);
  });
});

describe('AI plan drafting and provider errors', () => {
  test('drafts topics for a new plan (code-fenced JSON is tolerated)', async () => {
    mode = 'ok';
    const { token } = await student();
    const r = await call('POST', '/study/plans/generate-ai', token, { subject: 'Chemistry' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.totalTopics, 4);
    assert.equal(r.body.data.aiGenerated, true);
  });

  test('a rejected key becomes a clear 503, not a crash', async () => {
    mode = 'reject';
    const { token } = await student();
    const r = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_KEY_REJECTED');
    mode = 'ok';
  });

  test('a busy primary model falls back to AI_FALLBACK_MODEL; without a fallback the student sees "busy"', async () => {
    mode = 'ok';
    const { token } = await student();
    process.env.AI_MODEL = 'busy-model';
    process.env.AI_FALLBACK_MODEL = 'fake-model';
    const ok = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    delete process.env.AI_FALLBACK_MODEL;
    const busy = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    process.env.AI_MODEL = 'fake-model';
    assert.equal(ok.status, 200);
    assert.equal(busy.status, 503);
    assert.equal(busy.body.code, 'AI_BUSY');
  });

  test('without configuration the AI routes say so', async () => {
    const saved = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    const { token } = await student();
    const r = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    process.env.AI_API_KEY = saved;
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
  });
});

describe('AI tutor streaming', () => {
  test('streams the answer in pieces that join to the full reply, then says done', async () => {
    mode = 'ok';
    const { token } = await student();
    const r = await stream('/study/ai/tutor/stream', token, { message: 'What is osmosis?', history: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 200);
    assert.ok(r.events.filter((e) => e.delta).length > 1, 'expected more than one piece');
    assert.match(r.text, /^Tutor answer\. Context seen: no\. History: 1\.$/);
    assert.deepEqual(r.events.at(-1), { done: true });
  });

  test('topic ownership and validation fail as plain JSON before anything streams', async () => {
    const a = await student();
    const b = await student();
    const topic = await topicFor(a.token);
    const ok = await stream('/study/ai/tutor/stream', a.token, { message: 'Explain it', topicId: topic.id });
    assert.match(ok.text, /Context seen: yes/);
    const other = await stream('/study/ai/tutor/stream', b.token, { message: 'Explain it', topicId: topic.id });
    assert.equal(other.status, 403);
    assert.equal(other.events.length, 0);
    assert.equal((await stream('/study/ai/tutor/stream', a.token, { message: ' ' })).status, 400);
    const anon = await fetch(base + '/study/ai/tutor/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"hi"}' });
    assert.equal(anon.status, 401);
  });

  test('a busy primary model falls back before the first word', async () => {
    mode = 'ok';
    const { token } = await student();
    process.env.AI_MODEL = 'busy-model';
    process.env.AI_FALLBACK_MODEL = 'fake-model';
    const r = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    delete process.env.AI_FALLBACK_MODEL;
    process.env.AI_MODEL = 'fake-model';
    assert.match(r.text, /Tutor answer/);
    assert.deepEqual(r.events.at(-1), { done: true });
  });

  test('provider errors arrive as a final error event with a plain message', async () => {
    mode = 'reject';
    const { token } = await student();
    const r = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    mode = 'ok';
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].error.code, 'AI_KEY_REJECTED');
  });

  test('an answer cut off midway keeps what arrived and ends with an error, not done', async () => {
    mode = 'cutoff';
    const { token } = await student();
    const r = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    mode = 'ok';
    assert.ok(r.text.length > 0);
    assert.ok(r.events.at(-1).error, JSON.stringify(r.events.at(-1)));
    assert.ok(!r.events.some((e) => e.done));
  });
});

describe('AI resilience when the provider struggles', () => {
  const env = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const restore = () => {
    env({ AI_MODEL: 'fake-model', AI_FALLBACK_MODEL: undefined, AI_REASONING_EFFORT: undefined, AI_MODEL_TIMEOUT_MS: undefined, AI_HEDGE_MS: undefined });
    mode = 'ok';
    resetAiHealth();
  };

  test('several fallbacks are tried in order until one answers', async () => {
    restore();
    const { token } = await student();
    env({ AI_MODEL: 'busy-model', AI_FALLBACK_MODEL: 'missing-model, fake-model' });
    seen.length = 0;
    const r = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    const order = seen.map((x) => x.model);
    restore();
    assert.equal(r.status, 200);
    assert.deepEqual(order, ['busy-model', 'missing-model', 'fake-model']);
  });

  test('a model that just failed is tried last for a while, so the next question is not held up by it', async () => {
    restore();
    const { token } = await student();
    env({ AI_MODEL: 'busy-model', AI_FALLBACK_MODEL: 'fake-model' });
    await call('POST', '/study/ai/tutor', token, { message: 'first' });
    seen.length = 0;
    const r = await call('POST', '/study/ai/tutor', token, { message: 'second' });
    const order = seen.map((x) => x.model);
    restore();
    assert.equal(r.status, 200);
    assert.deepEqual(order, ['fake-model'], 'the busy model should not be asked first again');
  });

  test('a model that never answers is abandoned after its time, and the next one answers', async () => {
    restore();
    const { token } = await student();
    env({ AI_MODEL: 'slow-model', AI_FALLBACK_MODEL: 'fake-model', AI_MODEL_TIMEOUT_MS: '400' });
    const started = Date.now();
    const plain = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    resetAiHealth();
    const streamed = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    const took = Date.now() - started;
    restore();
    assert.equal(plain.status, 200);
    assert.match(streamed.text, /Tutor answer/);
    assert.ok(took < 2_500, `took ${took} ms`);
  });

  test('a slow model gets company: the next one is asked alongside it and the first answer wins', async () => {
    restore();
    const { token } = await student();
    // slow-model would hold on for its full 20 s; the hedge asks fake-model after 150 ms.
    env({ AI_MODEL: 'slow-model', AI_FALLBACK_MODEL: 'fake-model', AI_HEDGE_MS: '150' });
    seen.length = 0;
    const started = Date.now();
    const plain = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    const plainMs = Date.now() - started;
    resetAiHealth();
    const t2 = Date.now();
    const streamed = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    const streamMs = Date.now() - t2;
    const asked = seen.map((x) => x.model);
    restore();
    assert.equal(plain.status, 200);
    assert.match(plain.body.data.reply, /Tutor answer/);
    assert.ok(plainMs < 1_500, `plain answer took ${plainMs} ms`);
    assert.match(streamed.text, /^Tutor answer/);
    assert.deepEqual(streamed.events.at(-1), { done: true });
    assert.ok(streamMs < 1_500, `streamed answer took ${streamMs} ms`);
    assert.deepEqual(asked, ['slow-model', 'fake-model', 'slow-model', 'fake-model']);
  });

  test('a healthy main model answers alone: no hedge request is sent', async () => {
    restore();
    const { token } = await student();
    env({ AI_FALLBACK_MODEL: 'busy-model' });
    seen.length = 0;
    await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    const asked = seen.map((x) => x.model);
    restore();
    assert.deepEqual(asked, ['fake-model', 'fake-model']);
  });

  test('a model that refuses reasoning_effort is asked again without it, and remembered', async () => {
    restore();
    const { token } = await student();
    env({ AI_MODEL: 'no-effort-model', AI_REASONING_EFFORT: 'low' });
    seen.length = 0;
    const first = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    const second = await call('POST', '/study/ai/tutor', token, { message: 'again' });
    const efforts = seen.map((x) => x.effort ?? 'none');
    restore();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(efforts, ['low', 'none', 'none']);
  });

  test('private <thought> reasoning never reaches the student, streamed or not', async () => {
    restore();
    const { token } = await student();
    mode = 'thinking';
    const plain = await call('POST', '/study/ai/tutor', token, { message: 'hi' });
    const streamed = await stream('/study/ai/tutor/stream', token, { message: 'hi' });
    const quiz = await call('POST', '/study/ai/quiz', token, { topic: 'Cells', questionCount: 3 });
    restore();
    assert.match(plain.body.data.reply, /^Tutor answer/);
    assert.match(streamed.text, /^Tutor answer/);
    assert.ok(!streamed.text.includes('secret') && !plain.body.data.reply.includes('secret'));
    assert.equal(quiz.status, 201, JSON.stringify(quiz.body));
  });
});
