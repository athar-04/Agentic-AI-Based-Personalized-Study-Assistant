"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when a page crashes while rendering. The error's own message is not shown: it can carry
 * internals. The digest identifies the matching server log line without revealing anything.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error", error.digest ?? "");
  }, [error]);

  return (
    <main id="main" role="alert" className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle aria-hidden="true" className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold">Something went wrong on this page</h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Your work is saved on the server; nothing was lost. Try again, and if it keeps happening, reload the page.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
