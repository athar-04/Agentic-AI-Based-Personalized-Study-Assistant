// Throwaway Postgres for integration tests: a fresh cluster in a temp dir under .local/,
// migrated from scratch, and deleted when the suite stops. Never touches the dev database.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_DIR, databaseUrl, describeTarget } from './local-env.mjs';
import { migrateDeploy, startDisposablePostgres } from './db.mjs';

export async function startTestDatabase(port) {
  const db = {
    host: '127.0.0.1',
    port,
    database: 'agentic_test',
    user: 'agentic_test',
    dataDir: join(LOCAL_DIR, `pg-test-${port}-${process.pid}`),
  };
  const password = randomBytes(12).toString('hex');
  const url = databaseUrl(db, password);
  process.stdout.write(`# test database: ${describeTarget(db)}\n`);
  const pg = await startDisposablePostgres(db, password, { persistent: false });
  try {
    migrateDeploy(url);
  } catch (err) {
    await pg.stop();
    throw err;
  }
  return {
    url,
    async stop() {
      await pg.stop();
      rmSync(db.dataDir, { recursive: true, force: true });
    },
  };
}
