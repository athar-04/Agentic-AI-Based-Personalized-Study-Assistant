/**
 * End-to-end smoke test of the RUNNING local stack (npm run dev:local), through the same
 * entry point the browser uses (http://localhost:3000/api/v1 via the Next proxy and gateway).
 *
 *   npm run smoke:local            run every check, then delete everything it created
 *   npm run smoke:local -- --keep  keep the smoke accounts (for a manual look), print their emails
 *   npm run smoke:local -- --cleanup   only delete leftover smoke accounts
 *
 * It creates throwaway accounts under @smoke.test and removes them (and every audit row about
 * them) at the end, so real accounts and data are untouched. Local database only.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@agentic/auth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const env = require('./local-env.mjs') as {
  DEV_DB: unknown;
  databaseUrl(db: unknown, pw: string): string;
  loadDevSecrets(): { pgPassword: string };
  assertDisposableTarget(url: string): void;
};

const BASE = 'http://localhost:3000/api/v1';
const ORIGIN = 'http://localhost:3000';
const DOMAIN = '@smoke.test';
const KEEP = process.argv.includes('--keep');
const CLEANUP_ONLY = process.argv.includes('--cleanup');

const url = env.databaseUrl(env.DEV_DB, env.loadDevSecrets().pgPassword);
env.assertDisposableTarget(url);
const prisma = new PrismaClient({ datasources: { db: { url } } });

// ─── tiny harness ───
let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.log(`  ✗ ${name}\n      ${(err as Error).message}`);
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function section(title: string) {
  console.log(`\n${title}`);
}

interface Res {
  status: number;
  body: any;
  cookie?: string;
}
async function call(method: string, path: string, opts: { body?: unknown; token?: string; cookie?: string; csrf?: boolean } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.csrf) Object.assign(headers, { 'X-CSRF-Protection': '1', Origin: ORIGIN });
  const r = await fetch(BASE + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const set = r.headers.getSetCookie().find((c) => c.startsWith('refresh_token='));
  return { status: r.status, body, cookie: set?.split(';')[0] };
}

async function linkFor(email: string, kind: 'verify' | 'reset'): Promise<string> {
  const r = await call('GET', '/dev/mailbox');
  expect(r.status === 200, `dev mailbox returned ${r.status}`);
  const m = (r.body.data.messages as { to: string; actionUrl?: string }[]).find(
    (x) => x.to === email && x.actionUrl?.includes(kind === 'verify' ? '/verify-email#token=' : '/reset-password#token='),
  );
  expect(m?.actionUrl, `no ${kind} email captured for ${email}`);
  return m.actionUrl.split('#token=')[1];
}

const id = randomBytes(3).toString('hex');
const student = { email: `student-${id}${DOMAIN}`, username: `smoke_student_${id}`, password: 'Smoke-Test-2026', firstName: 'Smoke', lastName: 'Student' };
const other = { email: `other-${id}${DOMAIN}`, username: `smoke_other_${id}`, password: 'Smoke-Other-2026', firstName: 'Smoke', lastName: 'Other' };
const admin = { email: `admin-${id}${DOMAIN}`, password: 'Smoke-Admin-2026' };

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const audit = await prisma.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetUserId: { in: ids } }] } });
  const del = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return { users: del.count, auditRows: audit.count };
}

async function main() {
  if (CLEANUP_ONLY) {
    console.log('Removed:', await cleanup());
    return;
  }
  const before = { users: await prisma.user.count({ where: { NOT: { email: { endsWith: DOMAIN } } } }), audit: await prisma.adminAuditLog.count() };

  // ── Platform ──
  section('Platform');
  let aiOn = false;
  await check('status endpoint answers (dev mailbox on)', async () => {
    const r = await call('GET', '/status');
    expect(r.status === 200 && r.body.data.devMailbox === true, JSON.stringify(r.body));
    aiOn = r.body.data.ai.available === true;
    console.log(`    (AI provider ${aiOn ? 'configured: live AI checks will run' : 'not configured: checking the offline behaviour'})`);
  });
  await check('web pages are served', async () => {
    for (const p of ['/', '/auth/login', '/auth/register', '/admin/login', '/dashboard', '/dev/mailbox']) {
      const r = await fetch(ORIGIN + p);
      expect(r.status === 200, `${p} returned ${r.status}`);
    }
  });

  // ── Signup and verification ──
  section('Signup and email verification');
  let verifyToken = '';
  await check('register returns 202 and no session', async () => {
    const r = await call('POST', '/auth/register', { body: student });
    expect(r.status === 202 && !r.cookie && r.body.data.verificationRequired === true, `${r.status} ${JSON.stringify(r.body)}`);
  });
  await check('sign-in is refused before verification', async () => {
    const r = await call('POST', '/auth/login', { body: { email: student.email, password: student.password } });
    expect(r.status === 403 && r.body.code === 'EMAIL_NOT_VERIFIED', `${r.status} ${r.body?.code}`);
  });
  await check('verification email is captured with a fragment link', async () => {
    verifyToken = await linkFor(student.email, 'verify');
    expect(/^[A-Za-z0-9_-]{43}$/.test(verifyToken), 'unexpected token shape');
  });
  await check('verify with the wrong password is refused, link stays usable', async () => {
    const r = await call('POST', '/auth/verify-email', { body: { token: verifyToken, password: 'Wrong-Password-1' } });
    expect(r.status === 400 && r.body.code === 'PASSWORD_MISMATCH', `${r.status} ${r.body?.code}`);
  });
  await check('verify with the right password succeeds once', async () => {
    const ok = await call('POST', '/auth/verify-email', { body: { token: verifyToken, password: student.password } });
    const again = await call('POST', '/auth/verify-email', { body: { token: verifyToken, password: student.password } });
    expect(ok.status === 200 && again.status === 400, `${ok.status} then ${again.status}`);
  });
  await check('resend for an unknown address answers generically', async () => {
    const r = await call('POST', '/auth/resend-verification', { body: { email: `nobody-${id}${DOMAIN}` } });
    expect(r.status === 200, String(r.status));
  });

  // ── Session ──
  section('Sessions, cookies and CSRF');
  let token = '';
  let cookie = '';
  await check('sign-in sets the refresh cookie and returns a user-scoped token', async () => {
    const r = await call('POST', '/auth/login', { body: { email: student.email, password: student.password } });
    expect(r.status === 200 && r.cookie && r.body.data.scope === 'user' && !r.body.data.refreshToken, `${r.status}`);
    token = r.body.data.accessToken;
    cookie = r.cookie;
  });
  await check('refresh without the CSRF header is rejected', async () => {
    const r = await call('POST', '/auth/refresh', { cookie });
    expect(r.status === 403, String(r.status));
  });
  await check('refresh with CSRF rotates the cookie', async () => {
    const r = await call('POST', '/auth/refresh', { cookie, csrf: true });
    expect(r.status === 200 && r.cookie && r.cookie !== cookie, String(r.status));
    cookie = r.cookie;
    token = r.body.data.accessToken;
  });
  await check('anonymous refresh answers NO_SESSION', async () => {
    const r = await call('POST', '/auth/refresh', { csrf: true });
    expect(r.status === 401 && r.body.code === 'NO_SESSION', `${r.status} ${r.body?.code}`);
  });

  // ── Profile ──
  section('Profile and preferences');
  let userId = '';
  await check('GET /users/me', async () => {
    const r = await call('GET', '/users/me', { token });
    expect(r.status === 200 && r.body.data.email === student.email && !('passwordHash' in r.body.data), String(r.status));
    userId = r.body.data.id;
  });
  await check('update profile name', async () => {
    const r = await call('PUT', '/users/me', { token, body: { firstName: 'Smokey' } });
    expect(r.status === 200 && r.body.data.firstName === 'Smokey', String(r.status));
  });
  await check('set daily goal and time zone', async () => {
    const r = await call('PUT', '/users/me/preferences', { token, body: { dailyStudyGoalMinutes: 90, timezone: 'Asia/Kolkata' } });
    expect(r.status === 200 && r.body.data.dailyStudyGoalMinutes === 90, String(r.status));
  });
  await check('invalid goal is rejected', async () => {
    const r = await call('PUT', '/users/me/preferences', { token, body: { dailyStudyGoalMinutes: 5 } });
    expect(r.status === 400, String(r.status));
  });
  await check('notifications list', async () => {
    const r = await call('GET', '/users/me/notifications', { token });
    expect(r.status === 200 && Array.isArray(r.body.data), String(r.status));
  });

  // ── Study ──
  section('Study plans, topics, sessions');
  let planId = '';
  let topicA = '';
  let topicB = '';
  let sessionId = '';
  await check('new account overview is empty', async () => {
    const r = await call('GET', '/study/overview', { token });
    expect(r.status === 200 && r.body.data.activePlan === null && r.body.data.week.minutes === 0 && r.body.data.goal.dailyMinutes === 90, JSON.stringify(r.body.data?.goal));
  });
  await check('create plan', async () => {
    const r = await call('POST', '/study/plans', { token, body: { title: 'Smoke physics', subject: 'Physics', startDate: new Date().toISOString(), dailyGoalHours: 1.5 } });
    expect(r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    planId = r.body.data.id;
  });
  await check('list, get, update plan', async () => {
    const list = await call('GET', '/study/plans', { token });
    const got = await call('GET', `/study/plans/${planId}`, { token });
    const upd = await call('PUT', `/study/plans/${planId}`, { token, body: { description: 'Smoke test plan' } });
    expect(list.status === 200 && list.body.data.length === 1 && got.status === 200 && upd.status === 200, `${list.status}/${got.status}/${upd.status}`);
  });
  await check('add, list, update, reorder topics', async () => {
    const a = await call('POST', `/study/topics/plan/${planId}`, { token, body: { title: 'Thermodynamics', estimatedHours: 2 } });
    const b = await call('POST', `/study/topics/plan/${planId}`, { token, body: { title: 'Waves' } });
    topicA = a.body.data.id;
    topicB = b.body.data.id;
    const list = await call('GET', `/study/topics/plan/${planId}`, { token });
    const upd = await call('PUT', `/study/topics/${topicB}`, { token, body: { title: 'Waves and optics' } });
    const reo = await call('PUT', `/study/topics/${topicB}/reorder`, { token, body: { order: 0 } });
    expect(a.status === 201 && b.status === 201 && list.body.data.length === 2 && upd.status === 200 && reo.status === 200, `${a.status}/${b.status}/${upd.status}/${reo.status}`);
  });
  await check('schedule, list, get, update, reschedule, start, complete a session', async () => {
    const at = new Date(Date.now() + 30 * 60_000).toISOString();
    const c = await call('POST', '/study/sessions', { token, body: { planId, topicId: topicA, title: 'Smoke session', scheduledAt: at, durationMinutes: 40 } });
    expect(c.status === 201, `create ${c.status} ${JSON.stringify(c.body)}`);
    sessionId = c.body.data.id;
    const up = await call('GET', '/study/sessions/upcoming', { token });
    const today = await call('GET', '/study/sessions/today', { token });
    const list = await call('GET', `/study/sessions?planId=${planId}`, { token });
    const get = await call('GET', `/study/sessions/${sessionId}`, { token });
    const upd = await call('PUT', `/study/sessions/${sessionId}`, { token, body: { notes: 'smoke' } });
    const res = await call('POST', `/study/sessions/${sessionId}/reschedule`, { token, body: { newDate: new Date(Date.now() + 60 * 60_000).toISOString() } });
    const start = await call('POST', `/study/sessions/${sessionId}/start`, { token });
    const done = await call('POST', `/study/sessions/${sessionId}/complete`, { token, body: { actualMinutes: 35, markTopicComplete: true } });
    for (const [n, r] of Object.entries({ up, today, list, get, upd, res, start, done })) expect(r.status === 200, `${n} ${r.status}`);
    expect(done.body.data.status === 'COMPLETED', 'not completed');
  });
  await check('plan progress reflects the completed topic', async () => {
    const r = await call('GET', `/study/plans/${planId}/progress`, { token });
    expect(r.status === 200 && r.body.data.completedTopics === 1 && r.body.data.totalStudyMinutes === 35, JSON.stringify(r.body.data));
  });
  await check('pause and reactivate the plan', async () => {
    const p = await call('PUT', `/study/plans/${planId}/status`, { token, body: { status: 'PAUSED' } });
    const a = await call('PUT', `/study/plans/${planId}/status`, { token, body: { status: 'ACTIVE' } });
    expect(p.status === 200 && a.status === 200, `${p.status}/${a.status}`);
  });
  await check(aiOn ? 'AI drafts topics for a new plan' : 'AI plan drafting answers 503 when no provider is set (nothing saved)', async () => {
    const r = await call('POST', '/study/plans/generate-ai', { token, body: { subject: 'Chemistry' } });
    const list = await call('GET', '/study/plans', { token });
    if (aiOn) {
      expect(r.status === 201 && r.body.data.totalTopics >= 3 && r.body.data.aiGenerated === true, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      await call('DELETE', `/study/plans/${r.body.data.id}`, { token });
    } else {
      expect(r.status === 503 && list.body.data.length === 1, `${r.status}, plans=${list.body.data.length}`);
    }
  });

  section('Revision queue');
  let revisionId = '';
  await check('completed topic queued for tomorrow; manual add works', async () => {
    const upcoming = await call('GET', '/study/revisions?filter=upcoming', { token });
    expect(upcoming.status === 200 && upcoming.body.data.some((x: any) => x.topic?.id === topicA), 'topic not queued');
    const add = await call('POST', '/study/revisions', { token, body: { topicId: topicB } });
    expect(add.status === 201, `add ${add.status}`);
    revisionId = add.body.data.id;
    const due = await call('GET', '/study/revisions?filter=due', { token });
    expect(due.body.data.some((x: any) => x.id === revisionId), 'manual item not due');
  });
  await check('review schedules the next date (SM-2)', async () => {
    const r = await call('POST', `/study/revisions/${revisionId}/review`, { token, body: { quality: 4 } });
    expect(r.status === 200 && r.body.data.intervalDays === 1 && r.body.data.repetitionCount === 1, JSON.stringify(r.body.data));
  });
  await check('remove a revision item', async () => {
    const r = await call('DELETE', `/study/revisions/${revisionId}`, { token });
    expect(r.status === 200, String(r.status));
  });

  section('Practice quizzes');
  await check('take a sample set: answers hidden, graded on the server, saved', async () => {
    const sets = await call('GET', '/study/quizzes/sample', { token });
    expect(sets.status === 200 && sets.body.data.length >= 3, 'no sets');
    const quiz = await call('GET', `/study/quizzes/sample/${sets.body.data[0].id}`, { token });
    expect(quiz.status === 200 && !JSON.stringify(quiz.body).includes('correctAnswer'), 'answers leaked');
    const answers = quiz.body.data.questions.map((q: any) => ({ questionId: q.id, answer: q.options[0] }));
    const sub = await call('POST', `/study/quizzes/sample/${quiz.body.data.id}/attempts`, { token, body: { answers } });
    expect(sub.status === 201 && sub.body.data.maxScore === 5, `${sub.status}`);
    const hist = await call('GET', '/study/quizzes/attempts', { token });
    expect(hist.body.data.length === 1, 'attempt not saved');
  });
  await check('dashboard overview shows the real activity', async () => {
    const r = await call('GET', '/study/overview', { token });
    const o = r.body.data;
    expect(o.goal.todayMinutes === 35 && o.streakDays === 1 && o.activePlan?.completedTopics === 1 && o.recentQuizzes.length === 1, JSON.stringify({ g: o.goal, s: o.streakDays }));
  });

  section('Analytics and AI services');
  await check('analytics dashboard for own account; another account is refused', async () => {
    const own = await call('GET', `/analytics/${userId}`, { token });
    const streak = await call('GET', `/analytics/${userId}/streak`, { token });
    const foreign = await call('GET', `/analytics/00000000-0000-4000-8000-000000000000`, { token });
    expect(own.status === 200 && streak.status === 200 && foreign.status === 403, `${own.status}/${streak.status}/${foreign.status}`);
  });
  if (aiOn) {
    await check('AI tutor answers a real question, with topic context', async () => {
      const r = await call('POST', '/study/ai/tutor', { token, body: { message: 'In one sentence, what is the first law of thermodynamics?', topicId: topicA } });
      expect(r.status === 200 && typeof r.body.data.reply === 'string' && r.body.data.reply.length > 20, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      console.log(`    tutor said: "${r.body.data.reply.replace(/\s+/g, ' ').slice(0, 140)}…"`);
    });
    await check('AI tutor streams its answer through both proxies (first words before the end)', async () => {
      const started = Date.now();
      const r = await fetch(BASE + '/study/ai/tutor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: 'Explain the water cycle in about five sentences.' }),
      });
      expect(r.status === 200 && (r.headers.get('content-type') ?? '').includes('ndjson'), `${r.status} ${r.headers.get('content-type')}`);
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let firstAt = 0;
      let reads = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reads++;
        if (!firstAt) firstAt = Date.now() - started;
        text += decoder.decode(value, { stream: true });
      }
      const total = Date.now() - started;
      const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const answer = events.map((e) => e.delta ?? '').join('');
      expect(events.at(-1)?.done === true && answer.length > 40, JSON.stringify(events.at(-1)).slice(0, 200));
      // A buffering proxy would deliver everything in one read at the very end.
      expect(reads > 1 && firstAt < total - 150, `reads=${reads} first=${firstAt}ms total=${total}ms`);
      console.log(`    first words after ${firstAt} ms, whole answer after ${total} ms (${reads} pieces)`);
    });
    await check('AI quiz on a plan topic: answers withheld, graded on the server', async () => {
      const g = await call('POST', '/study/ai/quiz', { token, body: { topicId: topicA, questionCount: 3, difficulty: 'BEGINNER' } });
      expect(g.status === 201 && g.body.data.questions.length >= 1 && !JSON.stringify(g.body).includes('correctAnswer'), `${g.status} ${JSON.stringify(g.body).slice(0, 200)}`);
      const answers = g.body.data.questions.map((q: any) => ({ questionId: q.id, answer: q.options[0] }));
      const sub = await call('POST', `/study/quizzes/${g.body.data.id}/attempts`, { token, body: { answers } });
      expect(sub.status === 201 && sub.body.data.maxScore === g.body.data.questions.length, `${sub.status}`);
      console.log(`    quiz: "${g.body.data.questions[0].questionText.slice(0, 100)}"`);
    });
  } else {
    await check('AI tutor and topic quizzes say "not configured" (503) instead of failing silently', async () => {
      const t = await call('POST', '/study/ai/tutor', { token, body: { message: 'hi' } });
      const q = await call('POST', '/study/ai/quiz', { token, body: { topicId: topicA } });
      expect(t.status === 503 && t.body.code === 'AI_NOT_CONFIGURED' && q.status === 503, `${t.status}/${t.body?.code}/${q.status}`);
    });
  }

  // ── Second student: isolation ──
  section('Isolation between students');
  let otherToken = '';
  let otherId = '';
  await check('second student signs up and verifies', async () => {
    await call('POST', '/auth/register', { body: other });
    const v = await call('POST', '/auth/verify-email', { body: { token: await linkFor(other.email, 'verify'), password: other.password } });
    const l = await call('POST', '/auth/login', { body: { email: other.email, password: other.password } });
    expect(v.status === 200 && l.status === 200, `${v.status}/${l.status}`);
    otherToken = l.body.data.accessToken;
    otherId = l.body.data.user.id;
  });
  await check("cannot read or change the first student's plan, topics or sessions", async () => {
    const codes = [
      (await call('GET', `/study/plans/${planId}`, { token: otherToken })).status,
      (await call('DELETE', `/study/plans/${planId}`, { token: otherToken })).status,
      (await call('PUT', `/study/topics/${topicA}`, { token: otherToken, body: { title: 'x' } })).status,
      (await call('GET', `/study/sessions/${sessionId}`, { token: otherToken })).status,
    ];
    expect(codes.every((c) => c === 403), codes.join(','));
  });

  // ── Password reset ──
  section('Password reset');
  await check('forgot → captured link → reset → old sessions end → new password works', async () => {
    const f = await call('POST', '/auth/forgot-password', { body: { email: other.email } });
    const t = await linkFor(other.email, 'reset');
    const r = await call('POST', '/auth/reset-password', { body: { token: t, password: 'Smoke-Reset-2026' } });
    const old = await call('POST', '/auth/login', { body: { email: other.email, password: other.password } });
    const fresh = await call('POST', '/auth/login', { body: { email: other.email, password: 'Smoke-Reset-2026' } });
    expect(f.status === 200 && r.status === 200 && old.status === 401 && fresh.status === 200, `${f.status}/${r.status}/${old.status}/${fresh.status}`);
    otherToken = fresh.body.data.accessToken;
  });

  // ── Admin ──
  section('Admin sign-in and authorisation');
  await prisma.user.create({
    data: {
      email: admin.email,
      username: `smoke_admin_${id}`,
      firstName: 'Smoke',
      lastName: 'Admin',
      role: 'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(admin.password),
      preferences: { create: {} },
      analytics: { create: {} },
    },
  });
  let adminToken = '';
  let adminCookie = '';
  await check('student credentials at the admin sign-in get the generic 401', async () => {
    const r = await call('POST', '/auth/admin/login', { body: { email: student.email, password: student.password } });
    expect(r.status === 401 && r.body.error === 'Invalid admin credentials', `${r.status}`);
  });
  await check('student token on admin endpoints is 403', async () => {
    const codes = [(await call('GET', '/admin/overview', { token })).status, (await call('GET', '/users', { token })).status];
    expect(codes.every((c) => c === 403), codes.join(','));
  });
  await check('admin signed in on the STUDENT page is refused by the admin API', async () => {
    const l = await call('POST', '/auth/login', { body: admin });
    const r = await call('GET', '/admin/overview', { token: l.body.data.accessToken });
    expect(r.status === 403 && r.body.code === 'ADMIN_SIGNIN_REQUIRED', `${r.status} ${r.body?.code}`);
  });
  await check('admin sign-in gives an admin-scoped session that survives refresh', async () => {
    const l = await call('POST', '/auth/admin/login', { body: admin });
    expect(l.status === 200 && l.body.data.scope === 'admin', String(l.status));
    const r = await call('POST', '/auth/refresh', { cookie: l.cookie, csrf: true });
    expect(r.status === 200 && r.body.data.scope === 'admin', String(r.status));
    adminToken = r.body.data.accessToken;
    adminCookie = r.cookie!;
  });

  section('Admin console data');
  await check('overview, activity (14 and 30 days), traffic', async () => {
    const o = await call('GET', '/admin/overview', { token: adminToken });
    const a14 = await call('GET', '/admin/activity?days=14', { token: adminToken });
    const a30 = await call('GET', '/admin/activity?days=30', { token: adminToken });
    const t = await call('GET', '/admin/traffic', { token: adminToken });
    expect(o.status === 200 && o.body.data.users.total >= 3, `overview ${o.status}`);
    expect(a14.body.data.signups.length === 14 && a30.body.data.signups.length === 30, 'activity length');
    expect(t.status === 200 && t.body.data.available === true && t.body.data.totals.requests > 0, `traffic ${JSON.stringify(t.body.data).slice(0, 120)}`);
  });
  await check('user list: search, role and status filters, pagination', async () => {
    const s = await call('GET', `/admin/users?search=${encodeURIComponent(student.username)}`, { token: adminToken });
    const r = await call('GET', '/admin/users?role=ADMIN', { token: adminToken });
    const st = await call('GET', '/admin/users?status=active&limit=2&page=1', { token: adminToken });
    const bad = await call('GET', '/admin/users?limit=1000', { token: adminToken });
    expect(s.body.data.length === 1 && r.body.data.every((u: any) => u.role === 'ADMIN') && st.body.meta.limit === 2 && bad.status === 400, 'filters');
  });
  await check('user detail includes study data and no secrets', async () => {
    const r = await call('GET', `/admin/users/${userId}`, { token: adminToken });
    expect(r.status === 200 && r.body.data.study.plans.length === 1 && r.body.data.study.recentQuizzes.length >= 1, `${r.status} plans=${r.body.data.study.plans.length} quizzes=${r.body.data.study.recentQuizzes.length}`);
    expect(!/passwordHash|tokenHash|googleId/.test(JSON.stringify(r.body)), 'secret field leaked');
  });

  section('Admin controls');
  await check('change role (student → instructor → student)', async () => {
    const a = await call('PATCH', `/admin/users/${userId}/role`, { token: adminToken, body: { role: 'INSTRUCTOR' } });
    const b = await call('PATCH', `/admin/users/${userId}/role`, { token: adminToken, body: { role: 'STUDENT' } });
    expect(a.body.data.role === 'INSTRUCTOR' && b.body.data.role === 'STUDENT', `${a.status}/${b.status}`);
  });
  await check('deactivate blocks the student immediately; reactivate restores', async () => {
    const fresh = await call('POST', '/auth/login', { body: { email: student.email, password: student.password } });
    const d = await call('PATCH', `/admin/users/${userId}/status`, { token: adminToken, body: { isActive: false } });
    const blocked = await call('GET', '/study/overview', { token: fresh.body.data.accessToken });
    const login = await call('POST', '/auth/login', { body: { email: student.email, password: student.password } });
    const re = await call('PATCH', `/admin/users/${userId}/status`, { token: adminToken, body: { isActive: true } });
    expect(d.status === 200 && blocked.status === 401 && login.body.code === 'ACCOUNT_DEACTIVATED' && re.status === 200, `${d.status}/${blocked.status}/${login.body.code}/${re.status}`);
  });
  await check('sign out everywhere, send reset link, verification link refused for verified', async () => {
    const s = await call('POST', '/auth/login', { body: { email: student.email, password: student.password } });
    const rv = await call('POST', `/admin/users/${userId}/revoke-sessions`, { token: adminToken });
    const after = await call('POST', '/auth/refresh', { cookie: s.cookie, csrf: true });
    const reset = await call('POST', `/admin/users/${userId}/send-password-reset`, { token: adminToken });
    const ver = await call('POST', `/admin/users/${userId}/send-verification`, { token: adminToken });
    expect(rv.body.data.revoked >= 1 && after.status === 401 && reset.status === 200 && ver.body.code === 'ALREADY_VERIFIED', `${rv.status}/${after.status}/${reset.status}/${ver.body?.code}`);
  });
  await check('mark an unverified account verified; then delete it (after deactivation)', async () => {
    const u = { email: `unverified-${id}${DOMAIN}`, username: `smoke_unver_${id}`, password: 'Smoke-Unver-2026', firstName: 'Smoke', lastName: 'Unverified' };
    await call('POST', '/auth/register', { body: u });
    const uid = (await prisma.user.findUniqueOrThrow({ where: { email: u.email } })).id;
    const resend = await call('POST', `/admin/users/${uid}/send-verification`, { token: adminToken });
    const mark = await call('POST', `/admin/users/${uid}/mark-verified`, { token: adminToken });
    const del1 = await call('DELETE', `/admin/users/${uid}`, { token: adminToken });
    await call('PATCH', `/admin/users/${uid}/status`, { token: adminToken, body: { isActive: false } });
    const del2 = await call('DELETE', `/admin/users/${uid}`, { token: adminToken });
    expect(resend.status === 200 && mark.body.data.isEmailVerified === true && del1.body.code === 'MUST_DEACTIVATE_FIRST' && del2.status === 200, `${resend.status}/${mark.status}/${del1.body?.code}/${del2.status}`);
  });
  await check('self-lockout is blocked', async () => {
    const me = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).id;
    const r = await call('PATCH', `/admin/users/${me}/role`, { token: adminToken, body: { role: 'STUDENT' } });
    expect(r.status === 409 && r.body.code === 'SELF_LOCKOUT', `${r.status} ${r.body?.code}`);
  });
  await check('legacy admin routes require an admin session too', async () => {
    const list = await call('GET', '/users?limit=2', { token: adminToken });
    const get = await call('GET', `/users/${otherId}`, { token: adminToken });
    expect(list.status === 200 && get.status === 200, `${list.status}/${get.status}`);
  });
  await check('audit log records sign-in, views and every control', async () => {
    const r = await call('GET', '/admin/audit-log?limit=100', { token: adminToken });
    const actions = new Set((r.body.data as any[]).map((e) => e.action));
    for (const a of ['ADMIN_SIGNED_IN', 'USER_DATA_VIEWED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'SESSIONS_REVOKED', 'PASSWORD_RESET_SENT', 'VERIFICATION_SENT', 'EMAIL_VERIFIED_BY_ADMIN', 'USER_DELETED']) {
      expect(actions.has(a), `missing ${a}`);
    }
  });
  await check('admin sign-out ends the session', async () => {
    const o = await call('POST', '/auth/logout', { cookie: adminCookie, csrf: true });
    const r = await call('POST', '/auth/refresh', { cookie: adminCookie, csrf: true });
    expect(o.status === 200 && r.status === 401, `${o.status}/${r.status}`);
  });

  section('Student self-service');
  await check('student can deactivate their own account', async () => {
    const r = await call('DELETE', '/users/me', { token: otherToken });
    expect(r.status === 200, String(r.status));
  });

  // ── Cleanup ──
  section('Cleanup');
  if (KEEP) {
    console.log(`  kept smoke accounts: ${student.email}, ${other.email}, ${admin.email} (run with --cleanup to remove)`);
  } else {
    const removed = await cleanup();
    const after = { users: await prisma.user.count(), audit: await prisma.adminAuditLog.count() };
    await check(`removed ${removed.users} smoke accounts and ${removed.auditRows} audit rows; real data unchanged`, () => {
      expect(after.users === before.users && after.audit === before.audit, `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

main()
  .catch(async (err) => {
    console.error('Smoke run aborted:', err);
    if (!KEEP) console.log('Cleanup after abort:', await cleanup().catch(() => 'failed'));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
