// Browser API client.
//
// Session model: the refresh token lives only in an HttpOnly, SameSite=Strict cookie that
// JavaScript cannot read. The short-lived access token is kept in this module's memory — never
// in localStorage — and is re-obtained from /auth/refresh on page load and when it expires.

export const API_BASE = "/api/v1";

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  isEmailVerified: boolean;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  errors?: Record<string, string[]>;
  meta?: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

export type SessionScope = "user" | "admin";

let accessToken: string | null = null;
let currentUser: SessionUser | null = null;
let currentScope: SessionScope = "user";
const listeners = new Set<(u: SessionUser | null) => void>();

function setSession(token: string | null, user: SessionUser | null, scope: SessionScope = "user") {
  accessToken = token;
  currentUser = user;
  currentScope = user ? scope : "user";
  listeners.forEach((l) => l(user));
}

/** "admin" only for sessions started at the separate admin sign-in. */
export function getSessionScope(): SessionScope {
  return currentScope;
}

type SessionPayload = { user: SessionUser; accessToken: string; scope?: SessionScope };

export function onSessionChange(listener: (u: SessionUser | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionUser(): SessionUser | null {
  return currentUser;
}

function messageFrom(body: Envelope<unknown> | null, status: number): string {
  if (body?.errors) {
    const details = Object.values(body.errors).flat().join(". ");
    if (details) return details;
  }
  if (body?.error) return body.error;
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return `Request failed (${status})`;
}

// No request waits forever: a stalled connection gets a plain "try again" instead of an endless
// spinner. AI routes get longer, as the server allows them a 50-second budget.
const isAiPath = (path: string) => path.startsWith("/study/ai/") || path.includes("generate-ai");
const timeoutFor = (path: string) => (isAiPath(path) ? 80_000 : 30_000);
const TIMEOUT_MESSAGE = "The server took too long to respond. Please try again.";

async function send<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      signal: AbortSignal.timeout(timeoutFor(path)),
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") throw new ApiError(TIMEOUT_MESSAGE, 0, "TIMEOUT");
    throw new ApiError("Can't reach the server. Check that the app is running and try again.", 0, "NETWORK");
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || json?.success === false) {
    throw new ApiError(messageFrom(json, res.status), res.status, json?.code, json?.errors);
  }
  return json as Envelope<T>;
}

// ─── Session ───

// Refresh and logout are authenticated by the cookie, so they carry the CSRF header the server requires.
const CSRF = { "X-CSRF-Protection": "1" };
let refreshing: Promise<SessionUser | null> | null = null;

/** One in-flight refresh per tab; concurrent callers share it. */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await send<SessionPayload>("POST", "/auth/refresh", undefined, CSRF);
          setSession(r.data!.accessToken, r.data!.user, r.data!.scope ?? "user");
          return r.data!.user;
        } catch (err) {
          // Another tab may have rotated the cookie a moment ago; one retry picks up the new one.
          if (attempt === 0 && err instanceof ApiError && err.status === 401 && err.code !== "NO_SESSION") {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          throw err;
        }
      }
      return null;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setSession(null, null);
        return null;
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const r = await send<SessionPayload>("POST", "/auth/login", { email, password });
  setSession(r.data!.accessToken, r.data!.user, "user");
  return r.data!.user;
}

/** The separate admin sign-in. Replaces any student session in this browser with an admin one. */
export async function adminLogin(email: string, password: string): Promise<SessionUser> {
  const r = await send<SessionPayload>("POST", "/auth/admin/login", { email, password });
  setSession(r.data!.accessToken, r.data!.user, "admin");
  return r.data!.user;
}

export async function logout(): Promise<void> {
  try {
    await send("POST", "/auth/logout", undefined, CSRF);
  } finally {
    setSession(null, null);
  }
}

/** Updates the cached user after a profile change, without a new token. */
export function updateSessionUser(patch: Partial<SessionUser>) {
  if (currentUser) setSession(accessToken, { ...currentUser, ...patch }, currentScope);
}

// ─── Authenticated requests ───

/** Sends a request with the access token; on 401 refreshes once and retries. */
export interface ApiResult<T> {
  data: T;
  meta?: Envelope<T>["meta"];
  message?: string;
  /** The full response body, for endpoints that put fields beside `data` (e.g. the tutor's sessionId). */
  raw: Envelope<T> & Record<string, unknown>;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const wrap = (r: Envelope<T>): ApiResult<T> => ({ data: r.data as T, meta: r.meta, message: r.message, raw: r as ApiResult<T>["raw"] });
  try {
    return wrap(await send<T>(method, path, body));
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || path.startsWith("/auth/")) throw err;
    const user = await refreshSession();
    if (!user) throw new ApiError("Your session has ended. Please sign in again.", 401, "SESSION_EXPIRED");
    return wrap(await send<T>(method, path, body));
  }
}

/**
 * POSTs and reads a newline-delimited JSON stream, calling onEvent per line as it arrives. Same
 * token handling as api(): one refresh and retry on 401. Errors before the stream starts throw
 * ApiError; a dropped connection mid-stream throws ApiError with code "NETWORK".
 */
export async function apiStream(path: string, body: unknown, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  // Waits up to the AI budget for the answer to start; once it is streaming, the server bounds it.
  const started = new AbortController();
  const timer = setTimeout(() => started.abort(), timeoutFor(path));
  const open = () =>
    fetch(API_BASE + path, {
      method: "POST",
      signal: started.signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
  let res: Response;
  try {
    res = await open();
    if (res.status === 401) {
      const user = await refreshSession();
      if (!user) throw new ApiError("Your session has ended. Please sign in again.", 401, "SESSION_EXPIRED");
      res = await open();
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ApiError) throw err;
    if (started.signal.aborted) throw new ApiError(TIMEOUT_MESSAGE, 0, "TIMEOUT");
    throw new ApiError("Can't reach the server. Check that the app is running and try again.", 0, "NETWORK");
  }
  clearTimeout(timer);
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
    throw new ApiError(messageFrom(json, res.status), res.status, json?.code, json?.errors);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const emit = (line: string) => {
    if (!line.trim()) return;
    try {
      onEvent(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* a malformed line is skipped, not fatal */
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(emit);
    }
  } catch {
    throw new ApiError("The connection dropped before the answer finished.", 0, "NETWORK");
  }
  emit(buf + decoder.decode());
}

/** For endpoints that need no session (signup, verification, status). */
export async function publicApi<T = unknown>(method: string, path: string, body?: unknown) {
  const r = await send<T>(method, path, body);
  return { data: r.data as T, message: r.message };
}

/** Same-origin relative path only, so ?next= cannot redirect off-site. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
