import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

/**
 * The gateway in front of a fake upstream that records what reaches it. No database, no network:
 * these check what the gateway itself is responsible for.
 */
const seen: { method: string; url: string; headers: IncomingMessage['headers']; body: string }[] = [];
const upstream: Server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
    // A service that accepts a request and then goes silent.
    if (req.url === '/study/hang') return;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, data: { reached: req.url } }));
  });
});

const SECRET = randomBytes(32).toString('hex');
const METRICS = randomBytes(16).toString('hex');
let gateway: Server;
let base: string;

before(async () => {
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const up = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  // A port nothing listens on: the "service is down" case.
  const down = await new Promise<string>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(`http://127.0.0.1:${port}`));
    });
  });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: SECRET,
    USER_SERVICE_URL: up,
    STUDY_SERVICE_URL: up,
    ANALYTICS_SERVICE_URL: down,
    AI_ORCHESTRATOR_URL: down,
    INTERNAL_METRICS_TOKEN: METRICS,
    AUTH_RATE_LIMIT_MAX: '3',
    UPSTREAM_TIMEOUT_MS: '400',
    LOG_LEVEL: 'error',
  });
  const { buildApp } = await import('../src/app');
  gateway = buildApp().listen(0, '127.0.0.1');
  await new Promise((r) => gateway.once('listening', r));
  base = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
});

after(() => {
  gateway?.close();
  upstream.close();
});

const token = (userId: string, opts: jwt.SignOptions = {}, secret = SECRET) =>
  jwt.sign({ userId, email: `${userId}@example.test`, role: 'STUDENT', scope: 'user' }, secret, { expiresIn: '5m', ...opts });

async function call(method: string, path: string, init: { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(init.body !== undefined || init.raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status, headers: r.headers, json };
}

describe('gateway basics', () => {
  test('liveness answers without a token, and unknown routes are a JSON 404', async () => {
    assert.equal((await call('GET', '/livez')).status, 200);
    const missing = await call('GET', '/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.json.success, false);
  });

  test('security headers are set and the framework is not advertised', async () => {
    const r = await call('GET', '/livez');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  test('bodies over the limit are refused before reaching a service', async () => {
    seen.length = 0;
    const r = await call('POST', '/api/v1/auth/login', { raw: JSON.stringify({ email: 'big@example.test', pad: 'x'.repeat(600 * 1024) }) });
    assert.equal(r.status, 413);
    assert.equal(seen.length, 0);
  });
});

describe('authentication at the edge', () => {
  test('protected routes refuse a missing, forged or expired token, and nothing reaches the service', async () => {
    seen.length = 0;
    const none = await call('GET', '/api/v1/study/plans');
    const forged = await call('GET', '/api/v1/study/plans', { token: token('u1', {}, randomBytes(32).toString('hex')) });
    const expired = await call('GET', '/api/v1/study/plans', { token: token('u1', { expiresIn: -10 }) });
    const garbage = await call('GET', '/api/v1/study/plans', { token: 'not-a-jwt' });
    for (const r of [none, forged, expired, garbage]) {
      assert.equal(r.status, 401);
      assert.equal(r.json.code, 'UNAUTHENTICATED');
    }
    assert.equal(seen.length, 0);
  });

  test('a valid token reaches the service with the identity from the token, not from client headers', async () => {
    seen.length = 0;
    const r = await call('GET', '/api/v1/study/plans', { token: token('student-1'), headers: { 'x-user-id': 'someone-else', 'x-user-role': 'ADMIN' } });
    assert.equal(r.status, 200);
    assert.equal(seen[0].url, '/study/plans');
    assert.equal(seen[0].headers['x-user-id'], 'student-1');
    assert.equal(seen[0].headers['x-user-role'], 'STUDENT');
  });

  test('a spoofed identity header without a token gets nowhere', async () => {
    seen.length = 0;
    const r = await call('GET', '/api/v1/admin/users', { headers: { 'x-user-id': 'admin', 'x-user-role': 'ADMIN' } });
    assert.equal(r.status, 401);
    assert.equal(seen.length, 0);
  });

  test('JSON bodies arrive at the service intact', async () => {
    seen.length = 0;
    const body = { title: 'Physics — मूल बातें', topics: [1, 2, 3] };
    await call('POST', '/api/v1/study/plans', { token: token('student-1'), body });
    assert.deepEqual(JSON.parse(seen[0].body), body);
  });

  test('sign-in is public and forwarded to user-service', async () => {
    seen.length = 0;
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'public@example.test', password: 'x' } });
    assert.equal(r.status, 200);
    assert.equal(seen[0].url, '/auth/login');
  });
});

describe('failures and internal routes', () => {
  test('a service that is down becomes a clear 503, not a raw proxy error', async () => {
    const r = await call('GET', '/api/v1/analytics/me', { token: token('student-1') });
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'SERVICE_UNAVAILABLE');
  });

  test('a service that goes silent becomes a 503 after the timeout, not an endless wait', async () => {
    const started = Date.now();
    const r = await call('GET', '/api/v1/study/hang', { token: token('student-1') });
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'SERVICE_UNAVAILABLE');
    assert.ok(Date.now() - started < 3_000, `took ${Date.now() - started} ms`);
  });

  test('traffic counters are hidden (404) without the internal token', async () => {
    assert.equal((await call('GET', '/internal/traffic')).status, 404);
    assert.equal((await call('GET', '/internal/traffic', { headers: { 'x-internal-token': 'wrong' } })).status, 404);
    assert.equal((await call('GET', '/internal/traffic', { headers: { 'x-internal-token': METRICS } })).status, 200);
  });

  test('the dev mailbox is off unless enabled, and never served to forwarded requests', async () => {
    seen.length = 0;
    delete process.env.DEV_MAILBOX;
    assert.equal((await call('GET', '/api/v1/dev/mailbox')).status, 404);
    process.env.DEV_MAILBOX = 'true';
    const forwarded = await call('GET', '/api/v1/dev/mailbox', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    delete process.env.DEV_MAILBOX;
    assert.equal(forwarded.status, 404);
    assert.equal(seen.length, 0);
  });
});

describe('rate limits for shared networks', () => {
  test('repeated sign-in attempts lock that account, not a classmate on the same network', async () => {
    const attempt = (email: string) => call('POST', '/api/v1/auth/login', { body: { email, password: 'wrong' } });
    const alice = [];
    for (let i = 0; i < 4; i++) alice.push((await attempt('alice@example.test')).status);
    const bob = (await attempt('bob@example.test')).status;
    assert.deepEqual(alice, [200, 200, 200, 429]);
    assert.equal(bob, 200);
  });

  test('the email is matched case-insensitively, so changing case does not reset the count', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'ALICE@Example.TEST', password: 'wrong' } });
    assert.equal(r.status, 429);
    assert.equal(r.json.code, 'RATE_LIMITED');
  });
});

describe('production settings check', () => {
  const good = {
    NODE_ENV: 'production',
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    REDIS_URL: 'redis://:p@redis:6379',
    APP_URL: 'https://study.example.com',
    ALLOWED_ORIGINS: 'https://study.example.com',
    SMTP_HOST: 'smtp.example.com',
    MAIL_FROM: 'Study <no-reply@example.com>',
  };

  test('a complete configuration passes for every service', async () => {
    const { productionConfigProblems } = await import('@agentic/shared');
    for (const s of ['api-gateway', 'user-service', 'study-service', 'analytics-service'] as const) {
      assert.deepEqual(productionConfigProblems(s, good), [], s);
    }
  });

  test('placeholders and unsafe values are refused, naming the setting but never its value', async () => {
    const { assertProductionConfig } = await import('@agentic/shared');
    const placeholder = 'your-super-secret-jwt-key-change-in-production';
    const bad = { ...good, JWT_SECRET: placeholder, REDIS_URL: 'memory', APP_URL: 'http://study.example.com', COOKIE_SECURE: 'false', SMTP_HOST: '' };
    let message = '';
    try {
      assertProductionConfig('user-service', bad);
    } catch (err) {
      message = (err as Error).message;
    }
    for (const name of ['JWT_SECRET', 'REDIS_URL', 'APP_URL', 'COOKIE_SECURE', 'SMTP_HOST']) assert.match(message, new RegExp(name));
    assert.ok(!message.includes(placeholder), 'the secret value must not appear');
  });

  test('a short secret, a shared secret and a wildcard origin are each refused', async () => {
    const { productionConfigProblems } = await import('@agentic/shared');
    assert.match(productionConfigProblems('api-gateway', { ...good, JWT_SECRET: 'short' }).join(), /at least 32/);
    assert.match(productionConfigProblems('user-service', { ...good, JWT_REFRESH_SECRET: good.JWT_SECRET }).join(), /must differ/);
    assert.match(productionConfigProblems('api-gateway', { ...good, ALLOWED_ORIGINS: '*' }).join(), /not "\*"/);
  });

  test('outside production nothing is checked', async () => {
    const { assertProductionConfig } = await import('@agentic/shared');
    assert.doesNotThrow(() => assertProductionConfig('user-service', { NODE_ENV: 'development' }));
  });
});

describe('request logs', () => {
  test('one-time secrets in URLs are redacted before logging; everything else is kept', async () => {
    const { redactUrl } = await import('@agentic/shared');
    assert.equal(
      redactUrl('/api/v1/auth/google/callback?code=4%2F0AbCdEf&state=xyz123&scope=email'),
      '/api/v1/auth/google/callback?code=REDACTED&state=REDACTED&scope=email',
    );
    assert.equal(redactUrl('/api/v1/study/plans?limit=50&page=2'), '/api/v1/study/plans?limit=50&page=2');
    assert.equal(redactUrl('/x?Token=abc&flag'), '/x?Token=REDACTED&flag');
    assert.equal(redactUrl('/no-query'), '/no-query');
  });
});
