"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { ThemeToggle } from "@/components/app-shell";
import { StudyScene, useWideScreen } from "@/components/three/lazy-scene";
import { EASE_OUT } from "@/components/motion";
import { useSession } from "@/components/session";
import { ApiError, adminLogin, safeNextPath } from "@/lib/api";

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user, scope } = useSession();
  const wide = useWideScreen();
  const next = safeNextPath(params.get("next"), "/admin");
  const target = next.startsWith("/admin") && !next.startsWith("/admin/login") ? next : "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN" && scope === "admin") router.replace(target);
  }, [status, user, scope, router, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminLogin(email.trim(), password);
      router.replace(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in. Please try again.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Decorative scene on large screens only: phones get the form straight away. */}
      <aside className="relative hidden flex-col overflow-hidden border-r bg-[hsl(30_10%_6%)] p-10 text-white lg:flex" aria-label="Admin console">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck aria-hidden="true" className="h-6 w-6 text-amber-300" />
          Agentic Study <span className="font-normal text-white/60">· Admin</span>
        </div>
        {wide && <StudyScene variant="admin" onDark className="mt-6 min-h-[420px] flex-1" />}
        <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">
          Manage accounts, roles and access, review platform activity and live API traffic. Every change you make here is recorded in the
          audit log.
        </p>
      </aside>

      <main id="main" className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <Link href="/" className="inline-flex min-h-11 items-center font-display font-bold lg:invisible">Agentic Study</Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
          <motion.div
            className="w-full max-w-sm space-y-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT }}
          >
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-surface text-warning">
                <Lock aria-hidden="true" className="h-6 w-6" />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Admin sign in</h1>
              <p className="text-muted-foreground">Restricted area. Only administrator accounts can sign in here.</p>
            </div>

            {params.get("signedOut") === "1" && <Alert tone="success">You&apos;ve signed out of the admin console.</Alert>}
            {error && <Alert tone="error">{error}</Alert>}

            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <Field id="admin-email" label="Admin email" required>
                {(p) => <Input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field id="admin-password" label="Password" required>
                {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Spinner className="mr-2" />}
                {loading ? "Checking…" : "Sign in to the console"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              Admin sessions end after 12 hours. Looking for your study dashboard?{" "}
              <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">Student sign in</Link>
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
