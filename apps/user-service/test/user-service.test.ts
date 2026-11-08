import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { ORIGIN, Res, client, configureTestEnv, cookiePair, newUser, tokenFromLink } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startTestDatabase } = require('../../../scripts/dev/test-db.mjs');

let db: { url: string; stop(): Promise<void> };
let server: Server;
let call: ReturnType<typeof client>;
let prisma: typeof import('../src/lib/prisma').prisma;
let mailer: typeof import('../src/lib/mailer');
let auth: typeof import('@agentic/auth');

const CSRF = { 'X-CSRF-Protection': '1', Origin: ORIGIN };

before(async () => {
  db = await startTestDatabase(54331);
  configureTestEnv(db.url);
  const { app } = await import('../src/app');
  ({ prisma } = await import('../src/lib/prisma'));
  mailer = await import('../src/lib/mailer');
  auth = await import('@agentic/auth');
  server = app.listen(0);
  call = client(server);
});

after(async () => {
  server?.close();
  await prisma?.$disconnect();
  await db?.stop();
});

function latestLinkFor(email: string): string {
  const mail = mailer.listCapturedMail().find((m) => m.to === email);
  return tokenFromLink(mail?.actionUrl);
}

async function registerAndVerify(u = newUser()) {
  assert.equal((await call('POST', '/auth/register', { body: u })).status, 202);
  assert.equal((await call('POST', '/auth/verify-email', { body: { token: latestLinkFor(u.email), password: u.password } })).status, 200);
  return u;
}

async function login(u: { email: string; password: string }): Promise<{ token: string; cookie: string; res: Res }> {
  const res = await call('POST', '/auth/login', { body: { email: u.email, password: u.password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { token: res.body.data.accessToken, cookie: cookiePair(res.setCookie, 'refresh_token')!, res };
}

/** The separate admin sign-in; only it yields an admin-scoped session. */
async function adminLogin(u: { email: string; password: string }): Promise<{ token: string; cookie: string; res: Res }> {
  const res = await call('POST', '/auth/admin/login', { body: { email: u.email, password: u.password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { token: res.body.data.accessToken, cookie: cookiePair(res.setCookie, 'refresh_token')!, res };
}

async function makeAdmin(email: string) {
  await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
}

describe('signup and email verification', () => {
  test('signup issues no session, and login is refused until the email is verified', async () => {
    const u = newUser();
    const reg = await call('POST', '/auth/register', { body: u });
    assert.equal(reg.status, 202);
    assert.deepEqual(reg.body.data, { verificationRequired: true, email: u.email });
    assert.equal(reg.setCookie.length, 0, 'no cookie may be set at signup');
    assert.ok(!JSON.stringify(reg.body).match(/token/i), 'no token in the signup response');

    const early = await call('POST', '/auth/login', { body: { email: u.email, password: u.password } });
    assert.equal(early.status, 403);
    assert.equal(early.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(early.setCookie.length, 0);
  });

  test('the link carries the token in the URL fragment, never a query string, and only a hash is stored', async () => {
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const link = mailer.listCapturedMail().find((m) => m.to === u.email)!.actionUrl!;
    assert.match(link, /^http:\/\/localhost:3000\/auth\/verify-email#token=[A-Za-z0-9_-]{43}$/);
    assert.ok(!link.includes('?'));
    const raw = tokenFromLink(link);
    const row = await prisma.emailToken.findFirst({ where: { user: { email: u.email } } });
    assert.ok(row);
    assert.notEqual(row.tokenHash, raw);
    assert.equal(row.tokenHash, auth.hashLinkToken(raw));
  });

  test('a verification token works exactly once', async () => {
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const token = latestLinkFor(u.email);
    assert.equal((await call('POST', '/auth/verify-email', { body: { token, password: u.password } })).status, 200);
    const again = await call('POST', '/auth/verify-email', { body: { token, password: u.password } });
    assert.equal(again.status, 400);
    assert.equal(again.body.code, 'TOKEN_INVALID');
    await login(u);
  });

  test('concurrent use of one token: exactly one request succeeds', async () => {
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const token = latestLinkFor(u.email);
    const results = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/auth/verify-email', { body: { token, password: u.password } })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 400).length, 7);
  });

  test('an expired token is rejected and leaves the account unverified', async () => {
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const token = latestLinkFor(u.email);
    await prisma.emailToken.updateMany({ where: { user: { email: u.email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await call('POST', '/auth/verify-email', { body: { token, password: u.password } });
    assert.equal(r.status, 400);
    assert.equal((await prisma.user.findUnique({ where: { email: u.email } }))!.isEmailVerified, false);
  });

  test('names outside Latin-1 are stored intact (UTF-8 database)', async () => {
    const u = { ...newUser(), firstName: 'ಅನಿಕ್ತಾ', lastName: 'शर्मा' };
    assert.equal((await call('POST', '/auth/register', { body: u })).status, 202);
    const row = await prisma.user.findUnique({ where: { email: u.email } });
    assert.equal(row!.firstName, 'ಅನಿಕ್ತಾ');
    assert.equal(row!.lastName, 'शर्मा');
  });

  test('malformed tokens are rejected by validation', async () => {
    assert.equal((await call('POST', '/auth/verify-email', { body: { token: 'short', password: 'x' } })).status, 400);
    assert.equal((await call('POST', '/auth/verify-email', { body: {} })).status, 400);
  });

  test('signup with an existing email gives the same answer (no account enumeration)', async () => {
    const u = await registerAndVerify();
    const again = await call('POST', '/auth/register', { body: { ...newUser(), email: u.email } });
    assert.equal(again.status, 202);
    assert.deepEqual(again.body.data, { verificationRequired: true, email: u.email });
  });

  test('resend: same answer for unknown emails, and a cooldown stops link flooding', async () => {
    const unknown = await call('POST', '/auth/resend-verification', { body: { email: 'nobody@example.test' } });
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const known = await call('POST', '/auth/resend-verification', { body: { email: u.email } });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);
    // The signup link was issued moments ago, so the cooldown means no second token yet.
    assert.equal(await prisma.emailToken.count({ where: { user: { email: u.email } } }), 1);

    // After the cooldown a new link is issued and the old one stops working.
    const oldToken = latestLinkFor(u.email);
    await prisma.emailToken.updateMany({ where: { user: { email: u.email } }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await call('POST', '/auth/resend-verification', { body: { email: u.email } });
    assert.equal(await prisma.emailToken.count({ where: { user: { email: u.email } } }), 2);
    assert.equal((await call('POST', '/auth/verify-email', { body: { token: oldToken, password: u.password } })).status, 400);
    assert.equal((await call('POST', '/auth/verify-email', { body: { token: latestLinkFor(u.email), password: u.password } })).status, 200);
  });

  test('verification needs the account password; a wrong one leaves the link usable', async () => {
    const u = newUser();
    await call('POST', '/auth/register', { body: u });
    const token = latestLinkFor(u.email);
    const wrong = await call('POST', '/auth/verify-email', { body: { token, password: 'Not-the-password-1' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'PASSWORD_MISMATCH');
    assert.equal((await call('POST', '/auth/verify-email', { body: { token, password: u.password } })).status, 200);
  });

  test("pre-registering someone else's email cannot give the attacker the verified account", async () => {
    const victim = newUser('victim');
    const attacker = { ...newUser('attacker'), email: victim.email, password: 'Attacker-pass-1' };
    assert.equal((await call('POST', '/auth/register', { body: attacker })).status, 202);
    const attackerLink = latestLinkFor(victim.email);
    // The owner signs up later with their own password (after the resend cooldown).
    await prisma.emailToken.updateMany({ where: { user: { email: victim.email } }, data: { createdAt: new Date(Date.now() - 120_000) } });
    assert.equal((await call('POST', '/auth/register', { body: { ...victim, username: `${victim.username}x` } })).status, 202);
    // Even the attacker's original link (if the owner clicked it) needs the owner's own password now.
    assert.equal((await call('POST', '/auth/verify-email', { body: { token: attackerLink, password: attacker.password } })).status, 400);
    assert.equal((await call('POST', '/auth/verify-email', { body: { token: latestLinkFor(victim.email), password: victim.password } })).status, 200);
    const r = await call('POST', '/auth/login', { body: { email: victim.email, password: attacker.password } });
    assert.equal(r.status, 401);
    await login(victim);
  });

  test('legacy password accounts that never verified cannot sign in', async () => {
    const u = newUser('legacy');
    await prisma.user.create({
      data: { email: u.email, username: u.username, firstName: 'L', lastName: 'L', passwordHash: await auth.hashPassword(u.password) },
    });
    const r = await call('POST', '/auth/login', { body: { email: u.email, password: u.password } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'EMAIL_NOT_VERIFIED');
  });
});

describe('cookie sessions and CSRF', () => {
  test('login sets an HttpOnly, SameSite=Strict refresh cookie and never returns the refresh token in the body', async () => {
    const u = await registerAndVerify();
    const { res } = await login(u);
    const cookie = res.setCookie.find((c) => c.startsWith('refresh_token='))!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\/api\/v1\/auth/);
    assert.equal(res.body.data.refreshToken, undefined);
    assert.ok(res.body.data.accessToken);
  });

  test('refresh is rejected without the CSRF header or from a foreign origin', async () => {
    const { cookie } = await login(await registerAndVerify());
    assert.equal((await call('POST', '/auth/refresh', { cookie })).status, 403);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: { 'X-CSRF-Protection': '1', Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: { 'X-CSRF-Protection': '1' } })).status, 403);
  });

  test('refresh rotates the cookie and a replayed cookie is refused', async () => {
    const { cookie } = await login(await registerAndVerify());
    const first = await call('POST', '/auth/refresh', { cookie, headers: CSRF });
    assert.equal(first.status, 200);
    const rotated = cookiePair(first.setCookie, 'refresh_token');
    assert.ok(rotated && rotated !== cookie);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: CSRF })).status, 401);
    assert.equal((await call('POST', '/auth/refresh', { cookie: rotated, headers: CSRF })).status, 200);
  });

  test('logout revokes the session', async () => {
    const { cookie } = await login(await registerAndVerify());
    assert.equal((await call('POST', '/auth/logout', { cookie, headers: CSRF })).status, 200);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: CSRF })).status, 401);
  });

  test('refresh tokens are stored hashed', async () => {
    const u = await registerAndVerify();
    const { cookie } = await login(u);
    const raw = decodeURIComponent(cookie.split('=')[1]);
    const rows = await prisma.refreshToken.findMany({ where: { user: { email: u.email } } });
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((r) => r.token !== raw));
    assert.ok(rows.some((r) => r.token === auth.hashLinkToken(raw)));
  });

  test('password reset: generic answer, single-use link, old sessions revoked', async () => {
    const u = await registerAndVerify();
    const { cookie } = await login(u);
    assert.equal((await call('POST', '/auth/forgot-password', { body: { email: u.email } })).status, 200);
    const link = mailer.listCapturedMail().find((m) => m.to === u.email && m.subject.includes('Reset'))!.actionUrl!;
    assert.match(link, /\/auth\/reset-password#token=/);
    const token = tokenFromLink(link);
    assert.equal((await call('POST', '/auth/reset-password', { body: { token, password: 'weak' } })).status, 400);
    assert.equal((await call('POST', '/auth/reset-password', { body: { token, password: 'New-password-42' } })).status, 200);
    assert.equal((await call('POST', '/auth/reset-password', { body: { token, password: 'Other-password-42' } })).status, 400);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: CSRF })).status, 401);
    await login({ email: u.email, password: 'New-password-42' });
  });
});

describe('admin authorization', () => {
  test('no token is 401; a student token is 403 on every admin endpoint', async () => {
    const { token } = await login(await registerAndVerify());
    const target = (await prisma.user.findFirst())!.id;
    const endpoints: [string, string, unknown?][] = [
      ['GET', '/admin/overview'],
      ['GET', '/admin/users'],
      ['GET', `/admin/users/${target}`],
      ['PATCH', `/admin/users/${target}/role`, { role: 'ADMIN' }],
      ['PATCH', `/admin/users/${target}/status`, { isActive: false }],
      ['GET', '/admin/audit-log'],
      ['GET', '/users'],
      ['PUT', `/users/${target}/role`, { role: 'ADMIN' }],
      ['DELETE', `/users/${target}`],
    ];
    for (const [method, path, body] of endpoints) {
      assert.equal((await call(method, path, { body })).status, 401, `${method} ${path} without token`);
      assert.equal((await call(method, path, { body, token })).status, 403, `${method} ${path} as student`);
    }
  });

  test('authorization uses the persisted role, not the JWT claim', async () => {
    const u = await registerAndVerify();
    await makeAdmin(u.email);
    const { token } = await adminLogin(u);
    assert.equal(auth.decodeToken(token)!.role, 'ADMIN');
    assert.equal((await call('GET', '/admin/overview', { token })).status, 200);
    // Demoted in the database: the still-valid token that says ADMIN must stop working at once.
    await prisma.user.update({ where: { email: u.email }, data: { role: 'STUDENT' } });
    assert.equal((await call('GET', '/admin/overview', { token })).status, 403);
  });

  test('a forged role claim does not grant access', async () => {
    const u = await registerAndVerify();
    const user = (await prisma.user.findUnique({ where: { email: u.email } }))!;
    const forged = auth.generateAccessToken({ userId: user.id, email: user.email, role: 'ADMIN' });
    assert.equal((await call('GET', '/admin/users', { token: forged })).status, 403);
  });

  test('a deactivated admin loses access immediately and cannot sign in', async () => {
    const u = await registerAndVerify();
    await makeAdmin(u.email);
    const { token } = await adminLogin(u);
    await prisma.user.update({ where: { email: u.email }, data: { isActive: false } });
    const r = await call('GET', '/admin/overview', { token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'ACCOUNT_INACTIVE');
    const again = await call('POST', '/auth/login', { body: { email: u.email, password: u.password } });
    assert.equal(again.status, 403);
    assert.equal(again.body.code, 'ACCOUNT_DEACTIVATED');
  });

  test('admins cannot demote or deactivate themselves', async () => {
    const u = await registerAndVerify();
    await makeAdmin(u.email);
    const { token } = await adminLogin(u);
    const me = (await prisma.user.findUnique({ where: { email: u.email } }))!;
    const demote = await call('PATCH', `/admin/users/${me.id}/role`, { token, body: { role: 'STUDENT' } });
    assert.equal(demote.status, 409);
    assert.equal(demote.body.code, 'SELF_LOCKOUT');
    const deactivate = await call('PATCH', `/admin/users/${me.id}/status`, { token, body: { isActive: false } });
    assert.equal(deactivate.body.code, 'SELF_LOCKOUT');
  });

  test('two admins demoting each other at once cannot leave zero admins', async () => {
    // Start from a clean slate of admins so "last admin" is meaningful.
    await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'STUDENT' } });
    const a = await registerAndVerify(newUser('adminA'));
    const b = await registerAndVerify(newUser('adminB'));
    await makeAdmin(a.email);
    await makeAdmin(b.email);
    const [ta, tb] = [(await adminLogin(a)).token, (await adminLogin(b)).token];
    const [ida, idb] = [(await prisma.user.findUnique({ where: { email: a.email } }))!.id, (await prisma.user.findUnique({ where: { email: b.email } }))!.id];
    const results = await Promise.all([
      call('PATCH', `/admin/users/${idb}/role`, { token: ta, body: { role: 'STUDENT' } }),
      call('PATCH', `/admin/users/${ida}/role`, { token: tb, body: { role: 'STUDENT' } }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.ok(statuses.includes(200), `one demotion should succeed, got ${statuses.join(',')}`);
    assert.ok(results.every((r) => r.status === 200 || r.body.code === 'LAST_ADMIN' || r.status === 403), JSON.stringify(results.map((r) => r.body)));
    assert.equal(await prisma.user.count({ where: { role: 'ADMIN', isActive: true } }), 1);
  });

  test('the last admin cannot deactivate their own account through /users/me', async () => {
    await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'STUDENT' } });
    const u = await registerAndVerify(newUser('soleadmin'));
    await makeAdmin(u.email);
    const { token } = await login(u);
    const r = await call('DELETE', '/users/me', { token });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'LAST_ADMIN');
  });

  test('role and status changes are audited with only the changed fields', async () => {
    const admin = await registerAndVerify(newUser('auditor'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const s = await registerAndVerify();
    const { cookie: studentCookie } = await login(s);
    const sid = (await prisma.user.findUnique({ where: { email: s.email } }))!.id;

    assert.equal((await call('PATCH', `/admin/users/${sid}/role`, { token, body: { role: 'INSTRUCTOR' } })).status, 200);
    // Role change ends the target's existing sessions.
    assert.equal((await call('POST', '/auth/refresh', { cookie: studentCookie, headers: CSRF })).status, 401);
    assert.equal((await call('PATCH', `/admin/users/${sid}/status`, { token, body: { isActive: false } })).status, 200);

    const rows = await prisma.adminAuditLog.findMany({ where: { targetUserId: sid }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(rows.map((r) => r.action), ['USER_ROLE_CHANGED', 'USER_DEACTIVATED']);
    assert.deepEqual(rows[0].changes, { role: { from: 'STUDENT', to: 'INSTRUCTOR' } });
    assert.deepEqual(rows[1].changes, { isActive: { from: true, to: false } });
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['action', 'actorId', 'changes', 'createdAt', 'id', 'targetUserId']);
      assert.ok(!JSON.stringify(row).match(/password|token|hash|@/i), 'no secrets or emails stored in the trail');
    }

    const log = await call('GET', `/admin/audit-log?targetUserId=${sid}`, { token });
    assert.equal(log.status, 200);
    assert.equal(log.body.data.length, 2);
  });

  test('admin user views never expose secrets', async () => {
    const admin = await registerAndVerify(newUser('viewer'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const list = await call('GET', '/admin/users?limit=5', { token });
    const detail = await call('GET', `/admin/users/${list.body.data[0].id}`, { token });
    for (const r of [list, detail]) {
      assert.equal(r.status, 200);
      assert.ok(!JSON.stringify(r.body).match(/passwordHash|googleId|refreshToken|tokenHash/));
    }
  });

  test('admin list validates and caps pagination, and supports search', async () => {
    const admin = await registerAndVerify(newUser('pager'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    assert.equal((await call('GET', '/admin/users?limit=1000', { token })).status, 400);
    assert.equal((await call('GET', '/admin/users?role=SUPERUSER', { token })).status, 400);
    const page = await call('GET', '/admin/users?limit=2&page=1', { token });
    assert.equal(page.body.data.length, 2);
    assert.equal(page.body.meta.limit, 2);
    const found = await call('GET', `/admin/users?search=${encodeURIComponent(admin.username)}`, { token });
    assert.equal(found.body.data.length, 1);
    assert.equal(found.body.data[0].email, admin.email);
  });

  test('permanent deletion requires deactivation first', async () => {
    const admin = await registerAndVerify(newUser('deleter'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const s = await registerAndVerify();
    const sid = (await prisma.user.findUnique({ where: { email: s.email } }))!.id;
    const r = await call('DELETE', `/users/${sid}`, { token });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'MUST_DEACTIVATE_FIRST');
  });

  test('invalid role values are rejected', async () => {
    const admin = await registerAndVerify(newUser('validator'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const sid = (await prisma.user.findFirst({ where: { role: 'STUDENT' } }))!.id;
    assert.equal((await call('PATCH', `/admin/users/${sid}/role`, { token, body: { role: 'ROOT' } })).status, 400);
    assert.equal((await call('PATCH', `/admin/users/not-a-uuid/role`, { token, body: { role: 'STUDENT' } })).status, 400);
  });
});

describe('separate admin sign-in and console', () => {
  test('the admin sign-in gives one generic answer for unknown, wrong-password and non-admin accounts', async () => {
    const student = await registerAndVerify();
    const admin = await registerAndVerify(newUser('gate'));
    await makeAdmin(admin.email);
    const answers = await Promise.all([
      call('POST', '/auth/admin/login', { body: { email: 'nobody@example.test', password: 'Whatever-123' } }),
      call('POST', '/auth/admin/login', { body: { email: admin.email, password: 'Wrong-password-1' } }),
      call('POST', '/auth/admin/login', { body: { email: student.email, password: student.password } }),
    ]);
    for (const r of answers) {
      assert.equal(r.status, 401);
      assert.equal(r.body.code, 'INVALID_CREDENTIALS');
      assert.equal(r.body.error, 'Invalid admin credentials');
      assert.equal(r.setCookie.length, 0);
    }
  });

  test('an admin signed in through the normal sign-in cannot use the admin API', async () => {
    const admin = await registerAndVerify(newUser('scope'));
    await makeAdmin(admin.email);
    const { token } = await login(admin);
    const r = await call('GET', '/admin/overview', { token });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'ADMIN_SIGNIN_REQUIRED');
    assert.equal((await call('GET', '/users', { token })).status, 403);
    const scoped = await adminLogin(admin);
    assert.equal(scoped.res.body.data.scope, 'admin');
    assert.equal((await call('GET', '/admin/overview', { token: scoped.token })).status, 200);
  });

  test('admin sessions are short, keep their scope on refresh, and end on demotion', async () => {
    const admin = await registerAndVerify(newUser('short'));
    await makeAdmin(admin.email);
    const { cookie } = await adminLogin(admin);
    const row = await prisma.refreshToken.findFirst({ where: { user: { email: admin.email }, isRevoked: false }, orderBy: { createdAt: 'desc' } });
    const hours = (row!.expiresAt.getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 11 && hours <= 12, `admin session lasts ${hours} h`);

    const refreshed = await call('POST', '/auth/refresh', { cookie, headers: CSRF });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.data.scope, 'admin');
    assert.equal((await call('GET', '/admin/overview', { token: refreshed.body.data.accessToken })).status, 200);

    await prisma.user.update({ where: { email: admin.email }, data: { role: 'STUDENT' } });
    const after = await call('POST', '/auth/refresh', { cookie: cookiePair(refreshed.setCookie, 'refresh_token'), headers: CSRF });
    assert.equal(after.status, 401);
  });

  test('admin sign-ins and account views are audited, views at most once per 10 minutes', async () => {
    const admin = await registerAndVerify(newUser('watcher'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const adminId = (await prisma.user.findUnique({ where: { email: admin.email } }))!.id;
    assert.equal(await prisma.adminAuditLog.count({ where: { actorId: adminId, action: 'ADMIN_SIGNED_IN' } }), 1);

    const s = await registerAndVerify();
    const sid = (await prisma.user.findUnique({ where: { email: s.email } }))!.id;
    const detail = await call('GET', `/admin/users/${sid}`, { token });
    await call('GET', `/admin/users/${sid}`, { token });
    assert.equal(detail.status, 200);
    assert.ok(detail.body.data.study && Array.isArray(detail.body.data.study.plans));
    assert.equal(typeof detail.body.data.security.activeSessions, 'number');
    assert.ok(!JSON.stringify(detail.body).match(/passwordHash|tokenHash|googleId/));
    assert.equal(await prisma.adminAuditLog.count({ where: { actorId: adminId, targetUserId: sid, action: 'USER_DATA_VIEWED' } }), 1);
  });

  test('admin controls: sign out everywhere, send links, mark verified, delete after deactivation', async () => {
    const admin = await registerAndVerify(newUser('ctl'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);

    const s = await registerAndVerify();
    const { cookie } = await login(s);
    const sid = (await prisma.user.findUnique({ where: { email: s.email } }))!.id;
    const revoked = await call('POST', `/admin/users/${sid}/revoke-sessions`, { token });
    assert.equal(revoked.status, 200);
    assert.ok(revoked.body.data.revoked >= 1);
    assert.equal((await call('POST', '/auth/refresh', { cookie, headers: CSRF })).status, 401);

    assert.equal((await call('POST', `/admin/users/${sid}/send-password-reset`, { token })).status, 200);
    assert.ok(mailer.listCapturedMail().some((m) => m.to === s.email && m.subject.includes('Reset')));
    assert.equal((await call('POST', `/admin/users/${sid}/send-verification`, { token })).body.code, 'ALREADY_VERIFIED');

    const u = newUser('unver');
    await call('POST', '/auth/register', { body: u });
    const uid = (await prisma.user.findUnique({ where: { email: u.email } }))!.id;
    const marked = await call('POST', `/admin/users/${uid}/mark-verified`, { token });
    assert.equal(marked.status, 200);
    assert.equal(marked.body.data.isEmailVerified, true);
    const row = await prisma.adminAuditLog.findFirst({ where: { targetUserId: uid, action: 'EMAIL_VERIFIED_BY_ADMIN' } });
    assert.deepEqual(row!.changes, { isEmailVerified: { from: false, to: true } });

    assert.equal((await call('DELETE', `/admin/users/${uid}`, { token })).body.code, 'MUST_DEACTIVATE_FIRST');
    await call('PATCH', `/admin/users/${uid}/status`, { token, body: { isActive: false } });
    assert.equal((await call('DELETE', `/admin/users/${uid}`, { token })).status, 200);
    assert.equal(await prisma.user.count({ where: { id: uid } }), 0);
  });

  test('activity returns one row per day of real counts; traffic reports unconfigured instead of failing', async () => {
    const admin = await registerAndVerify(newUser('stats'));
    await makeAdmin(admin.email);
    const { token } = await adminLogin(admin);
    const a = await call('GET', '/admin/activity?days=14', { token });
    assert.equal(a.status, 200);
    assert.equal(a.body.data.signups.length, 14);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(a.body.data.signups.find((d: { day: string; value: number }) => d.day === today).value >= 1);
    const t = await call('GET', '/admin/traffic', { token });
    assert.equal(t.status, 200);
    assert.equal(t.body.data.available, false);
  });
});
