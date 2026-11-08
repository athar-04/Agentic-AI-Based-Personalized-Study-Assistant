"use client";

import "./globals.css";

/**
 * Last resort when the root layout itself fails, so it renders its own <html> and has no theme,
 * fonts or providers; plain and dependable on purpose.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
          <h1 className="text-2xl font-semibold">Agentic Study couldn&apos;t load</h1>
          <p className="max-w-md text-muted-foreground">Something went wrong while starting the app. Your work is saved on the server.</p>
          {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
          <button type="button" onClick={reset} className="min-h-11 rounded-md bg-primary px-5 font-medium text-primary-foreground">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
