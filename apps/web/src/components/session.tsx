"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, SessionScope, SessionUser, getSessionScope, getSessionUser, logout as apiLogout, onSessionChange, publicApi, refreshSession } from "@/lib/api";
import { ErrorState, LoadingBlock } from "@/components/ui/feedback";

type Status = "loading" | "authenticated" | "anonymous" | "error";

interface SessionValue {
  status: Status;
  user: SessionUser | null;
  scope: SessionScope;
  error: unknown;
  retry: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(getSessionUser());
  const [scope, setScope] = React.useState<SessionScope>(getSessionScope());
  const [status, setStatus] = React.useState<Status>(user ? "authenticated" : "loading");
  const [error, setError] = React.useState<unknown>(null);

  const restore = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    refreshSession()
      .then((u) => setStatus(u ? "authenticated" : "anonymous"))
      .catch((err: unknown) => {
        setError(err);
        setStatus("error");
      });
  }, []);

  React.useEffect(() => {
    const off = onSessionChange((u) => {
      setUser(u);
      setScope(getSessionScope());
      setStatus(u ? "authenticated" : "anonymous");
    });
    if (!getSessionUser()) restore();
    return off;
  }, [restore]);

  const signOut = React.useCallback(async () => {
    await apiLogout().catch(() => undefined);
  }, []);

  const value = React.useMemo(() => ({ status, user, scope, error, retry: restore, signOut }), [status, user, scope, error, restore, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/**
 * Client-side gate for signed-in pages. This is navigation convenience only: every API endpoint
 * enforces authentication and roles on the server, whatever this component renders.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status, error, retry } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === "anonymous") router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "authenticated") return <>{children}</>;
  if (status === "error") {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState title="We couldn't restore your session" error={error} onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg p-6">
      <LoadingBlock label={status === "anonymous" ? "Redirecting to sign in…" : "Checking your session…"} />
    </div>
  );
}

// ─── Service status (is the AI service up? is the dev mailbox on?) ───

export interface ServiceStatus {
  ai: { available: boolean };
  devMailbox: boolean;
}

let statusCache: Promise<ServiceStatus> | null = null;

export function useServiceStatus(): { status: ServiceStatus | null; recheck: () => void } {
  const [status, setStatus] = React.useState<ServiceStatus | null>(null);
  const load = React.useCallback((force = false) => {
    if (force) statusCache = null;
    statusCache ??= publicApi<ServiceStatus>("GET", "/status").then((r) => r.data);
    statusCache
      .then(setStatus)
      .catch(() => {
        statusCache = null;
        setStatus({ ai: { available: false }, devMailbox: false });
      });
  }, []);
  React.useEffect(() => load(), [load]);
  return { status, recheck: () => load(true) };
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}
