// Promote an existing, verified account to the first admin on the LOCAL dev database.
//   npm run admin:bootstrap -- you@example.com
// Needs `npm run dev:local` running (it owns the database). See
// apps/user-service/scripts/bootstrap-admin.ts for the safety checks.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DEV_DB, ROOT, assertDisposableTarget, databaseUrl, describeTarget, loadDevSecrets } from './local-env.mjs';

const email = process.argv[2];
// Strict shape check: the address is passed through a shell on Windows.
if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
  console.error('Usage: npm run admin:bootstrap -- you@example.com');
  process.exit(1);
}
const url = databaseUrl(DEV_DB, loadDevSecrets().pgPassword);
assertDisposableTarget(url);
console.log(`Target: ${describeTarget(DEV_DB)}`);

const r = spawnSync('npx', ['tsx', 'scripts/bootstrap-admin.ts', email], {
  cwd: join(ROOT, 'apps', 'user-service'),
  env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: url },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
