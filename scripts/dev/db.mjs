// Disposable local Postgres for development and tests.
//   node scripts/dev/db.mjs info      show the exact target, touch nothing
//   node scripts/dev/db.mjs migrate   start it (creating it on first run) and apply migrations
//   node scripts/dev/db.mjs new-migration <name>   draft a migration from schema changes (--create-only)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { DEV_DB, ROOT, assertDisposableTarget, databaseUrl, describeTarget, loadDevSecrets } from './local-env.mjs';

const SCHEMA = join(ROOT, 'packages', 'database', 'prisma', 'schema.prisma');

/** Starts an embedded cluster for `db`, creating the data dir and database on first use. */
export async function startDisposablePostgres(db, password, { persistent = true } = {}) {
  const pg = new EmbeddedPostgres({
    databaseDir: db.dataDir,
    user: db.user,
    password,
    port: db.port,
    persistent,
    authMethod: 'scram-sha-256',
    // Without this, Windows clusters inherit the system code page (WIN1252) and reject any
    // text outside Latin-1, such as many students' names.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  const fresh = !existsSync(join(db.dataDir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(db.database);
  return pg;
}

export function migrateDeploy(url) {
  assertDisposableTarget(url);
  const r = spawnSync('npx', ['prisma', 'migrate', 'deploy', '--schema', SCHEMA], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error('prisma migrate deploy failed');
}

async function main() {
  const cmd = process.argv[2] ?? 'info';
  console.log(`Target: ${describeTarget(DEV_DB)}`);
  if (cmd === 'info') return;

  const { pgPassword } = loadDevSecrets();
  const url = databaseUrl(DEV_DB, pgPassword);
  assertDisposableTarget(url);

  if (cmd === 'migrate') {
    const pg = await startDisposablePostgres(DEV_DB, pgPassword);
    try {
      migrateDeploy(url);
    } finally {
      await pg.stop();
    }
    return;
  }
  if (cmd === 'new-migration') {
    const name = process.argv[3];
    if (!name) throw new Error('Usage: new-migration <name>');
    const pg = await startDisposablePostgres(DEV_DB, pgPassword);
    try {
      migrateDeploy(url);
      const r = spawnSync('npx', ['prisma', 'migrate', 'dev', '--create-only', '--name', name, '--schema', SCHEMA], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      if (r.status !== 0) throw new Error('prisma migrate dev --create-only failed');
    } finally {
      await pg.stop();
    }
    return;
  }
  throw new Error(`Unknown command "${cmd}" (use: info | migrate | new-migration <name>)`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
