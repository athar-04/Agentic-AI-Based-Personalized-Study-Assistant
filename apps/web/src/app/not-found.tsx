import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="app-aurora flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md font-display text-lg font-bold">
        <GraduationCap aria-hidden="true" className="h-6 w-6 text-primary" />
        Agentic Study
      </Link>
      <div className="space-y-3">
        <p className="font-display text-7xl font-bold text-primary" aria-hidden="true">404</p>
        <h1 className="font-display text-2xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mx-auto max-w-md text-muted-foreground">The link may be out of date, or the address may have a typo.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button asChild>
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home page</Link>
        </Button>
      </div>
    </main>
  );
}
