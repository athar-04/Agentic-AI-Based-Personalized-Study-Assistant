import Link from "next/link";
import { GraduationCap } from "lucide-react";

// Set at build time (see docs/DEPLOYMENT.md). Shown plainly when missing so it can't go unnoticed.
export const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR_NAME || "the operator of this site";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export function ContactLine() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <strong>(contact address not configured yet: set NEXT_PUBLIC_CONTACT_EMAIL)</strong>
  );
}

/** Shared shell for the privacy notice and the terms: readable width, plain type, no app chrome. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md font-display text-lg font-bold">
            <GraduationCap aria-hidden="true" className="h-6 w-6 text-primary" />
            Agentic Study
          </Link>
          <nav aria-label="Legal" className="flex gap-4 text-sm">
            <Link href="/privacy" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <p role="note" className="mb-8 rounded-md border border-warning/40 bg-warning-surface px-4 py-3 text-sm">
          <strong>Draft.</strong> This text describes how the app works today. It has not yet been reviewed by a lawyer and should be
          before the service is offered to the public.
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
          {children}
        </div>
      </main>
    </div>
  );
}
