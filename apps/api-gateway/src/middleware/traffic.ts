import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * In-memory request counters for the admin console's traffic view: totals since this gateway
 * started, per-minute counts for the last hour, and per-area breakdowns. Counts only — no IPs,
 * user ids, paths with ids, or bodies are kept. Reset when the gateway restarts.
 */

type Area = 'auth' | 'study' | 'users' | 'admin' | 'ai' | 'analytics' | 'status' | 'other';
type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

const startedAt = new Date();
const MINUTES_KEPT = 60;

const totals = {
  requests: 0,
  errors: 0,
  byStatus: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 } as Record<StatusClass, number>,
  rateLimited: 0,
  failedSignIns: 0,
  failedAdminSignIns: 0,
};
const areas = new Map<Area, { requests: number; errors: number; totalMs: number }>();
const perMinute = new Map<number, { requests: number; errors: number }>();

const AREAS = new Set<Area>(['auth', 'study', 'users', 'admin', 'ai', 'analytics', 'status']);

function areaOf(path: string): Area {
  const segment = path.match(/^\/api\/v1\/([a-z-]+)/)?.[1] as Area | undefined;
  return segment && AREAS.has(segment) ? segment : 'other';
}

export function trafficRecorder(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0];
  if (path === '/internal/traffic' || path.startsWith('/health')) {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    const cls = `${Math.min(5, Math.max(2, Math.floor(status / 100)))}xx` as StatusClass;
    // A visitor without a session checking for one gets a 401 by design; that isn't a failure.
    const isError = status >= 400 && !(status === 401 && path === '/api/v1/auth/refresh');
    totals.requests += 1;
    totals.errors += isError ? 1 : 0;
    totals.byStatus[cls] += 1;
    if (status === 429) totals.rateLimited += 1;
    if ((status === 401 || status === 403) && path === '/api/v1/auth/login') totals.failedSignIns += 1;
    if (status === 401 && path === '/api/v1/auth/admin/login') totals.failedAdminSignIns += 1;

    const area = areaOf(path);
    const a = areas.get(area) ?? { requests: 0, errors: 0, totalMs: 0 };
    a.requests += 1;
    a.errors += isError ? 1 : 0;
    a.totalMs += Date.now() - start;
    areas.set(area, a);

    const minute = Math.floor(Date.now() / 60_000);
    const m = perMinute.get(minute) ?? { requests: 0, errors: 0 };
    m.requests += 1;
    m.errors += isError ? 1 : 0;
    perMinute.set(minute, m);
    for (const key of perMinute.keys()) if (key <= minute - MINUTES_KEPT) perMinute.delete(key);
  });
  next();
}

export function trafficSnapshot() {
  const nowMinute = Math.floor(Date.now() / 60_000);
  return {
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    totals,
    lastHour: Array.from({ length: MINUTES_KEPT }, (_, i) => {
      const minute = nowMinute - (MINUTES_KEPT - 1 - i);
      const m = perMinute.get(minute) ?? { requests: 0, errors: 0 };
      return { minute: new Date(minute * 60_000).toISOString(), ...m };
    }),
    byArea: [...areas.entries()]
      .map(([area, a]) => ({ area, requests: a.requests, errors: a.errors, avgMs: a.requests ? Math.round(a.totalMs / a.requests) : 0 }))
      .sort((x, y) => y.requests - x.requests),
  };
}

function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Only for user-service, which authorises the admin first. Disabled unless INTERNAL_METRICS_TOKEN is set. */
export function internalTrafficHandler(req: Request, res: Response): void {
  const expected = process.env.INTERNAL_METRICS_TOKEN;
  if (!expected || !tokenMatches(req.get('x-internal-token'), expected)) {
    res.status(404).json({ success: false, error: 'Route not found', timestamp: new Date().toISOString() });
    return;
  }
  res.json(trafficSnapshot());
}
