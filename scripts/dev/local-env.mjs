// Shared configuration for the local, Docker-free prototype stack.
// Everything here targets a disposable embedded Postgres under .local/ — never a real database.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCAL_DIR = join(ROOT, '.local');

export const DEV_DB = {
  host: '127.0.0.1',
  port: 54329,
  database: 'agentic_dev',
  user: 'agentic',
  dataDir: join(LOCAL_DIR, 'pg'),
};

const SECRETS_FILE = join(LOCAL_DIR, 'dev-secrets.json');

/** Random per-machine secrets, generated once and kept out of git (.local/ is ignored). Never printed. */
export function loadDevSecrets() {
  mkdirSync(LOCAL_DIR, { recursive: true });
  const secrets = existsSync(SECRETS_FILE) ? JSON.parse(readFileSync(SECRETS_FILE, 'utf8')) : {};
  // Fill in anything missing (older .local folders predate some keys); existing values are kept.
  const defaults = {
    pgPassword: () => randomBytes(18).toString('hex'),
    jwtSecret: () => randomBytes(48).toString('hex'),
    jwtRefreshSecret: () => randomBytes(48).toString('hex'),
    internalMetricsToken: () => randomBytes(32).toString('hex'),
  };
  let changed = false;
  for (const [key, make] of Object.entries(defaults)) {
    if (!secrets[key]) {
      secrets[key] = make();
      changed = true;
    }
  }
  if (changed) writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

export function databaseUrl(db, password) {
  return `postgresql://${db.user}:${encodeURIComponent(password)}@${db.host}:${db.port}/${db.database}?schema=public`;
}

/** Same URL with the password masked, for showing the target before anything touches it. */
export function describeTarget(db) {
  return `postgresql://${db.user}:****@${db.host}:${db.port}/${db.database}  (data dir: ${db.dataDir})`;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Refuses anything that is not a loopback database, so a stray DATABASE_URL can never be migrated. */
export function assertDisposableTarget(url) {
  const host = new URL(url).hostname;
  if (!LOOPBACK.has(host)) {
    throw new Error(`Refusing to touch non-local database host "${host}". These scripts only manage the disposable local database.`);
  }
}

/**
 * Reads AI_* settings from .local/ai.env (the user's own file, never committed). Only AI_ keys are
 * taken; values are returned to the caller and never printed.
 */
export function loadAiEnv() {
  const file = join(LOCAL_DIR, 'ai.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(AI_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
