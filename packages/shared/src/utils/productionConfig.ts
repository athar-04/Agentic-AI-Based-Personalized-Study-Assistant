/**
 * Refuses to start a service in production with settings that would be unsafe or quietly broken:
 * a placeholder JWT secret lets anyone mint admin tokens; an unset APP_URL sends every
 * verification email to localhost; an unset ALLOWED_ORIGINS fails every session refresh, so
 * users are signed out every 15 minutes. Problems name the setting, never its value.
 */

export type ServiceName = 'api-gateway' | 'user-service' | 'study-service' | 'analytics-service';

type Env = Record<string, string | undefined>;

// The values .env.example ships with, and the usual stand-ins.
const PLACEHOLDER = /your[-_]|change[-_]?(me|in[-_]production)|placeholder|example/i;

function checkSecret(env: Env, name: string, problems: string[]): void {
  const value = env[name];
  if (!value) problems.push(`${name} is not set.`);
  else if (PLACEHOLDER.test(value)) problems.push(`${name} is still the placeholder from .env.example.`);
  else if (value.length < 32) problems.push(`${name} must be at least 32 characters (openssl rand -hex 32).`);
}

function checkHttpsUrl(env: Env, name: string, problems: string[]): void {
  const value = env[name];
  if (!value) return void problems.push(`${name} is not set.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return void problems.push(`${name} is not a valid URL.`);
  }
  if (url.protocol !== 'https:') problems.push(`${name} must be an https:// URL (the session cookie is Secure).`);
}

function checkDataStores(env: Env, problems: string[]): void {
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set.');
  if (!env.REDIS_URL) problems.push('REDIS_URL is not set.');
  else if (env.REDIS_URL === 'memory') problems.push('REDIS_URL=memory is for local development only.');
}

/** Every problem with this service's production settings; empty when it is safe to start. */
export function productionConfigProblems(service: ServiceName, env: Env = process.env): string[] {
  const problems: string[] = [];
  // Every service verifies access tokens.
  checkSecret(env, 'JWT_SECRET', problems);

  if (service === 'api-gateway') {
    const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    if (!origins.length) problems.push('ALLOWED_ORIGINS is not set (your site address, e.g. https://study.example.com).');
    if (origins.includes('*')) problems.push('ALLOWED_ORIGINS must list your site, not "*".');
    if (origins.some((o) => !o.startsWith('https://'))) problems.push('ALLOWED_ORIGINS entries must be https:// addresses.');
  }

  if (service === 'user-service') {
    checkSecret(env, 'JWT_REFRESH_SECRET', problems);
    if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) problems.push('JWT_REFRESH_SECRET must differ from JWT_SECRET.');
    checkDataStores(env, problems);
    checkHttpsUrl(env, 'APP_URL', problems);
    if (!env.ALLOWED_ORIGINS) problems.push('ALLOWED_ORIGINS is not set; session refresh checks the request origin against it.');
    if ((env.MAIL_TRANSPORT ?? 'smtp') !== 'smtp') problems.push('MAIL_TRANSPORT must be smtp in production.');
    if (!env.SMTP_HOST) problems.push('SMTP_HOST is not set; sign-up verification and password-reset emails cannot be sent.');
    if (!env.MAIL_FROM) problems.push('MAIL_FROM is not set.');
    if (env.COOKIE_SECURE === 'false') problems.push('COOKIE_SECURE=false is for plain-http localhost only.');
    if (env.GOOGLE_CLIENT_ID) {
      if (!env.GOOGLE_CLIENT_SECRET) problems.push('GOOGLE_CLIENT_SECRET is not set but GOOGLE_CLIENT_ID is.');
      checkHttpsUrl(env, 'GOOGLE_CALLBACK_URL', problems);
    }
  }

  if (service === 'study-service' || service === 'analytics-service') checkDataStores(env, problems);

  return problems;
}

/** Throws (so the process exits before listening) when production settings are unsafe. */
export function assertProductionConfig(service: ServiceName, env: Env = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems = productionConfigProblems(service, env);
  if (problems.length) {
    throw new Error(`Refusing to start ${service} in production:\n  - ${problems.join('\n  - ')}\nSee docs/DEPLOYMENT.md.`);
  }
}
