// One command for the local prototype, no Docker needed:
//   npm run dev:local    web app in dev mode: hot reload, but each page compiles on first visit
//   npm run demo:local   everything built and run as in production (compiled services, optimised
//                        web build): what to use when presenting, and the rehearsal before deploying
// Starts the disposable Postgres (.local/pg), applies migrations, then runs user-, study- and
// analytics-service, the gateway and the web app with generated local secrets.
// The AI orchestrator is NOT started (it calls a paid model API); the UI says AI is offline.
// Nothing here reads your .env: explicit environment variables take precedence over dotenv.
import { spawn, spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_DB, ROOT, assertDisposableTarget, databaseUrl, describeTarget, loadAiEnv, loadDevSecrets } from './local-env.mjs';
import { migrateDeploy, startDisposablePostgres } from './db.mjs';

// --prod only changes the web app. The services stay in development mode on purpose: the in-memory
// Redis and the captured-mail inbox refuse to run under NODE_ENV=production.
const PROD = process.argv.includes('--prod');
const GATEWAY = 'http://127.0.0.1:4000';
const webEnv = PROD ? { API_GATEWAY_URL: GATEWAY, NODE_ENV: 'production' } : { API_GATEWAY_URL: GATEWAY };

// The browser opens http://localhost:3000 (the session cookie is tied to that name) and tries the
// first address "localhost" resolves to. On Windows that is ::1; a server on 127.0.0.1 only makes
// every new connection fail over IPv6 first and cost ~200 ms. Bind where localhost points: still
// loopback only.
const WEB_HOST = (await lookup('localhost').catch(() => ({ address: '127.0.0.1' }))).address;

const secrets = loadDevSecrets();
const ai = loadAiEnv();
const url = databaseUrl(DEV_DB, secrets.pgPassword);
assertDisposableTarget(url);

const shared = {
  NODE_ENV: 'development',
  // Loopback only: nothing in this dev stack (least of all the captured-mail inbox) is reachable from the LAN.
  HOST: '127.0.0.1',
  DATABASE_URL: url,
  JWT_SECRET: secrets.jwtSecret,
  JWT_REFRESH_SECRET: secrets.jwtRefreshSecret,
  INTERNAL_METRICS_TOKEN: secrets.internalMetricsToken,
  API_GATEWAY_INTERNAL_URL: 'http://127.0.0.1:4000',
  REDIS_URL: 'memory',
  MAIL_TRANSPORT: 'capture',
  DEV_MAILBOX: 'true',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  APP_URL: 'http://localhost:3000',
  COOKIE_SECURE: 'false',
  USER_SERVICE_URL: 'http://127.0.0.1:4001',
  STUDY_SERVICE_URL: 'http://127.0.0.1:4002',
  ANALYTICS_SERVICE_URL: 'http://127.0.0.1:4003',
  AI_ORCHESTRATOR_URL: 'http://127.0.0.1:8000',
  REVISION_AGENT_URL: 'http://127.0.0.1:8004',
  ANALYZER_AGENT_URL: 'http://127.0.0.1:8005',
  // Roomier limits for a live demo from one machine; production defaults are unchanged.
  RATE_LIMIT_MAX_REQUESTS: '2000',
  AUTH_RATE_LIMIT_MAX: '50',
  EMAIL_RATE_LIMIT_MAX: '20',
};

// --prod runs each service from its compiled JavaScript, as the containers do, so a problem in the
// build output (rather than the TypeScript source) shows up here instead of in production.
// Compiled services run on this same Node binary directly: through npx, "node" would be looked up
// as an npm package of that name.
const serviceCmd = (svc) => (PROD ? [process.execPath, `dist/apps/${svc}/src/index.js`] : ['npx', 'tsx', 'src/index.ts']);

const services = [
  { name: 'user', cwd: 'apps/user-service', cmd: serviceCmd('user-service'), env: { PORT: '4001' } },
  { name: 'study', cwd: 'apps/study-service', cmd: serviceCmd('study-service'), env: { PORT: '4002', ...ai } },
  // Optional: nothing on screen depends on it, so its exit must not take the demo down with it.
  { name: 'analytics', cwd: 'apps/analytics-service', cmd: serviceCmd('analytics-service'), env: { PORT: '4003' }, optional: true },
  { name: 'gateway', cwd: 'apps/api-gateway', cmd: serviceCmd('api-gateway'), env: { PORT: '4000' } },
  // --prod serves the standalone build exactly as the Docker image does (node server.js).
  { name: 'web', cwd: 'apps/web', cmd: PROD ? [process.execPath, join('.next', 'standalone', 'apps', 'web', 'server.js')] : ['npx', 'next', 'dev', '-H', WEB_HOST, '-p', '3000'], env: { ...webEnv, PORT: '3000', HOSTNAME: WEB_HOST } },
];

const children = [];
let pg;
let stopping = false;

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping…');
  children.forEach(killTree);
  if (pg) await pg.stop().catch(() => {});
  process.exit(code);
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));

console.log(`Database: ${describeTarget(DEV_DB)}`);
pg = await startDisposablePostgres(DEV_DB, secrets.pgPassword);
migrateDeploy(url);

if (PROD) {
  console.log('Building the services…');
  for (const ws of ['packages/shared', 'packages/auth', 'apps/user-service', 'apps/study-service', 'apps/analytics-service', 'apps/api-gateway']) {
    const r = spawnSync('npm', ['run', 'build', `--workspace=${ws}`], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) {
      console.error(`Build of ${ws} failed; nothing started.`);
      await stop(1);
    }
  }
  console.log('Building the web app (about a minute)…');
  const build = spawnSync('npx', ['next', 'build'], {
    cwd: join(ROOT, 'apps/web'),
    env: { ...process.env, ...webEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) {
    console.error('Web build failed; nothing started.');
    await stop(1);
  }
  // As in Dockerfile.web: the standalone server serves static files only from beside itself.
  const web = join(ROOT, 'apps', 'web');
  const standaloneWeb = join(web, '.next', 'standalone', 'apps', 'web');
  cpSync(join(web, '.next', 'static'), join(standaloneWeb, '.next', 'static'), { recursive: true });
  if (existsSync(join(web, 'public'))) cpSync(join(web, 'public'), join(standaloneWeb, 'public'), { recursive: true });
}

for (const s of services) {
  const [command, ...args] = s.cmd;
  const child = spawn(command, args, {
    cwd: join(ROOT, s.cwd),
    env: { ...process.env, ...shared, ...s.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // npx is a .cmd script on Windows and needs a shell; the Node binary must not get one, as its
    // path ("C:\Program Files\...") contains a space.
    shell: process.platform === 'win32' && command === 'npx',
  });
  const prefix = `[${s.name}]`.padEnd(12);
  const relay = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) out.write(`${prefix}${line}\n`);
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping && s.optional) {
      console.error(`${prefix}exited with code ${code}; carrying on without it.`);
      return;
    }
    if (!stopping) {
      console.error(`${prefix}exited with code ${code}; stopping everything.`);
      void stop(1);
    }
  });
  children.push(child);
}

const aiLine = ai.AI_API_KEY && ai.AI_BASE_URL && ai.AI_MODEL
  ? `AI tutor / quizzes: ${new URL(ai.AI_BASE_URL).hostname}, model ${ai.AI_MODEL} (from .local/ai.env)`
  : 'AI tutor / quizzes: offline. Add a key to .local/ai.env (see scripts/dev/ai.env.example), then restart.';
console.log(`
Local prototype starting. When the web line says "Ready", open:
  http://localhost:3000            (use "localhost", not 127.0.0.1, so the session cookie matches)
  http://localhost:3000/dev/mailbox  captured emails — NOT delivered to real inboxes
${aiLine}
First admin: sign up and verify, then in another terminal run
  npm run admin:bootstrap -- you@example.com
Admin console: http://localhost:3000/admin/login (separate sign-in, admins only)
Press Ctrl+C to stop everything.
`);
