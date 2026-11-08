import { Request, Response, NextFunction } from 'express';

export const CSRF_HEADER = 'X-CSRF-Protection';

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * Guards endpoints authenticated by the refresh cookie (refresh, logout) — the only ones a
 * browser would authenticate automatically. Three independent layers:
 *  1. the cookie is SameSite=Strict, so cross-site requests do not carry it;
 *  2. a custom header is required: a cross-origin page cannot set it without a CORS preflight,
 *     which the gateway only grants to ALLOWED_ORIGINS;
 *  3. Origin (or Referer) must be an allowed origin.
 * Bearer-token endpoints need none of this: an attacker's page cannot attach the header.
 */
export function requireCsrfSafeRequest(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('Origin') ?? originOf(req.get('Referer'));
  if (req.get(CSRF_HEADER) !== '1' || !origin || !allowedOrigins().includes(origin)) {
    res.status(403).json({
      success: false,
      error: 'Request rejected by CSRF protection',
      code: 'CSRF_REJECTED',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}
