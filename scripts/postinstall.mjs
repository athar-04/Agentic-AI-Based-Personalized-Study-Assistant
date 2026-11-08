// Generates the Prisma client after every install. Without it, @prisma/client is an empty
// placeholder and every service fails on first start (a fresh clone, or after npm ci).
// Skips quietly where Prisma isn't installed, e.g. the web image, which installs only the web app.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  require.resolve('prisma/package.json');
  require.resolve('@prisma/client/package.json');
} catch {
  console.log('postinstall: Prisma not installed here; skipping client generation.');
  process.exit(0);
}
const r = spawnSync('npx', ['prisma', 'generate', '--schema=packages/database/prisma/schema.prisma'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
