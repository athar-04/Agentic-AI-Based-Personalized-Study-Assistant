import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Test environment, set before the app (and its Prisma client) is imported.
export function configureTestEnv(databaseUrl: string) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    REDIS_URL: 'memory',
    MAIL_TRANSPORT: 'capture',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    APP_URL: 'http://localhost:3000',
    LOG_LEVEL: 'error',
  });
}

export const ORIGIN = 'http://localhost:3000';

export interface Res {
  status: number;
  body: any;
  setCookie: string[];
}

export function client(server: Server) {
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return async function call(
    method: string,
    path: string,
    opts: { body?: unknown; token?: string; cookie?: string; headers?: Record<string, string> } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.cookie) headers.Cookie = opts.cookie;
    const r = await fetch(base + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
    });
    const text = await r.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: r.status, body, setCookie: r.headers.getSetCookie() };
  };
}

/** "refresh_token=abc" from a Set-Cookie list, ready to send back as a Cookie header. */
export function cookiePair(setCookie: string[], name: string): string | undefined {
  const line = setCookie.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0];
}

export function tokenFromLink(url: string | undefined): string {
  const m = url?.match(/#token=([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error(`No fragment token in link: ${url}`);
  return m[1];
}

let n = 0;
export function newUser(prefix = 'student') {
  n += 1;
  const id = `${prefix}${n}${randomBytes(3).toString('hex')}`.toLowerCase();
  return {
    email: `${id}@example.test`,
    username: id,
    password: 'Correct-horse-9',
    firstName: 'Test',
    lastName: prefix,
  };
}
