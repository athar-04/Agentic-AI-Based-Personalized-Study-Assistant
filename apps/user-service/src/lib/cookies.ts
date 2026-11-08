import { Request, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';
export const OAUTH_STATE_COOKIE = 'oauth_state';

// Browser-facing paths (through the gateway), so the cookie is sent to auth endpoints only.
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const OAUTH_COOKIE_PATH = '/api/v1/auth/google';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Secure by default in production; COOKIE_SECURE overrides (plain-http localhost needs false). */
function secure(): boolean {
  const v = process.env.COOKIE_SECURE;
  return v ? v === 'true' : process.env.NODE_ENV === 'production';
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: secure(), sameSite: 'strict', path: REFRESH_COOKIE_PATH });
}

// Lax, not Strict: Google's redirect back is a cross-site top-level navigation.
export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, secure: secure(), sameSite: 'lax', path: OAUTH_COOKIE_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
