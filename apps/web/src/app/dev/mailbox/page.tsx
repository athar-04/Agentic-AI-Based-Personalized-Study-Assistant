"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/feedback";
import { ThemeToggle } from "@/components/app-shell";
import { publicApi } from "@/lib/api";

interface CapturedMail {
  id: string;
  to: string;
  subject: string;
  text: string;
  actionUrl?: string;
  createdAt: string;
}

/**
 * Local-development mailbox. The server only serves it with MAIL_TRANSPORT=capture outside
 * production, to loopback clients. Nothing here was delivered to a real inbox.
 */
export default function DevMailboxPage() {
  const [mail, setMail] = useState<CapturedMail[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(() => {
    setError(null);
    publicApi<{ messages: CapturedMail[] }>("GET", "/dev/mailbox")
      .then((r) => setMail(r.data.messages))
      .catch((err: unknown) => {
        if ((err as { status?: number }).status === 404) setUnavailable(true);
        else setError(err);
      });
  }, []);

  useEffect(load, [load]);

  // Only same-origin app links are opened from here.
  const localPath = (url?: string) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.origin === window.location.origin ? `${u.pathname}${u.hash}` : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="flex items-center justify-between p-4">
        <Link href="/" className="font-display font-bold">Agentic Study</Link>
        <ThemeToggle />
      </div>
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 pb-12">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Development mailbox</h1>
          <p className="text-muted-foreground">Emails the app would have sent while running locally.</p>
        </div>
        <Alert tone="warning" title="Captured, not delivered">
          These messages were held by the local server instead of being emailed. Real delivery needs SMTP settings and has not been
          tested in this prototype. This page is disabled in production.
        </Alert>

        {unavailable ? (
          <Alert tone="info">The development mailbox is turned off for this server.</Alert>
        ) : error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !mail ? (
          <LoadingBlock label="Loading captured emails…" />
        ) : (
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={load} className="gap-2">
                <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
              </Button>
            </div>
            {mail.length === 0 ? (
              <EmptyState icon={Inbox} title="No emails yet">Sign up or request a reset link, then refresh.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {mail.map((m) => {
                  const path = localPath(m.actionUrl);
                  return (
                    <li key={m.id}>
                      <Card>
                        <CardContent className="space-y-3 p-5">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                            <h2 className="font-semibold">{m.subject}</h2>
                            <time dateTime={m.createdAt} className="text-sm text-muted-foreground">
                              {new Date(m.createdAt).toLocaleString()}
                            </time>
                          </div>
                          <p className="text-sm text-muted-foreground">To: {m.to}</p>
                          {path && (
                            <Button asChild size="sm">
                              {/* A plain anchor: a full navigation, so the fragment token is read fresh by the page. */}
                              <a href={path}>Open link from this email</a>
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
