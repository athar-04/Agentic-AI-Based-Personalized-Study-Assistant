"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/app-shell";
import { StudyScene, useWideScreen } from "@/components/three/lazy-scene";
import { EASE_OUT } from "@/components/motion";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const wide = useWideScreen();
  return (
    <div className="app-aurora grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      {/* Decorative scene on large screens only; phones get the form straight away. */}
      <aside className="relative hidden flex-col overflow-hidden border-r bg-[hsl(30_10%_6%)] p-10 text-white lg:flex" aria-label="Agentic Study">
        <Link href="/" className="flex items-center gap-2 rounded-md font-display text-lg font-bold">
          <GraduationCap aria-hidden="true" className="h-6 w-6 text-orange-300" />
          Agentic Study
        </Link>
        {wide && <StudyScene onDark className="mt-6 min-h-[380px] flex-1" />}
        <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">
          Plans, sessions, practice and spaced repetition in one place. Your progress is only ever what you actually did.
        </p>
      </aside>
      <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md font-display font-bold lg:invisible">
          <GraduationCap aria-hidden="true" className="h-6 w-6 text-primary" />
          Agentic Study
        </Link>
        <ThemeToggle />
      </div>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center">
        <motion.div className="w-full max-w-md" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE_OUT }}>
        <Card className="w-full shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            {description && <CardDescription className="text-base">{description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
          {footer && <CardFooter className="flex flex-col gap-2 text-center text-sm text-muted-foreground">{footer}</CardFooter>}
        </Card>
        </motion.div>
      </main>
      </div>
    </div>
  );
}

/**
 * Reads a single-use token from the URL fragment (#token=…) and immediately removes it from the
 * address bar and history, so it is not left in bookmarks, screenshots or a shared screen. The
 * token stays only in memory until the user explicitly submits it.
 */
export function useFragmentToken(): { token: string | null; checked: boolean } {
  const [token, setToken] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);
  React.useEffect(() => {
    const match = window.location.hash.match(/(?:^#|&)token=([A-Za-z0-9_-]+)/);
    if (match) {
      setToken(match[1]);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setChecked(true);
  }, []);
  return { token, checked };
}

export const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "An uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p), label: "A lowercase letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
];

export function PasswordChecklist({ password, id }: { password: string; id: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={ok ? "text-success" : "text-muted-foreground"}>
            <span aria-hidden="true">{ok ? "✓" : "○"} </span>
            {r.label}
            <span className="sr-only">{ok ? " (met)" : " (not met yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Remembers the address between signup and the check-email page without putting it in the URL. */
export const pendingEmail = {
  set(email: string) {
    try {
      sessionStorage.setItem("pendingVerificationEmail", email);
    } catch {
      /* storage unavailable: the page asks for the address instead */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem("pendingVerificationEmail");
    } catch {
      /* nothing to clear */
    }
  },
  get(): string {
    try {
      return sessionStorage.getItem("pendingVerificationEmail") ?? "";
    } catch {
      return "";
    }
  },
};

export function DevMailboxNotice() {
  return (
    <p className="text-sm text-muted-foreground">
      Running locally without email delivery?{" "}
      <Link href="/dev/mailbox" className="font-medium text-primary underline-offset-4 hover:underline">
        Open the development mailbox
      </Link>{" "}
      to see captured messages. They are not sent to a real inbox.
    </p>
  );
}
