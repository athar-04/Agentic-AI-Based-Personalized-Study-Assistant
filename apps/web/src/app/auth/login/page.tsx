"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AuthCard, pendingEmail } from "@/components/auth-ui";
import { useSession } from "@/components/session";
import { ApiError, login, publicApi, safeNextPath } from "@/lib/api";

const NOTICES: Record<string, string> = {
  verified: "Your email is verified. Sign in to get started.",
  reset: "Your password was changed. Sign in with the new one.",
  signedOut: "You've been signed out.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const next = safeNextPath(params.get("next"));
  const notice = Object.keys(NOTICES).find((k) => params.get(k) === "1");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const emailRef = useRef<HTMLInputElement>(null);

  // Already signed in (e.g. back button after login): go straight on.
  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendState("idle");
    setLoading(true);
    try {
      await login(email.trim(), password);
      pendingEmail.clear();
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong. Please try again.", 0));
      emailRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResendState("sending");
    try {
      await publicApi("POST", "/auth/resend-verification", { email: email.trim() });
      setResendState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
      setResendState("idle");
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue your study plan."
      footer={
        <p>
          New here?{" "}
          <Link href="/auth/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      {notice && <Alert tone="success">{NOTICES[notice]}</Alert>}
      {params.get("error") === "google" && <Alert tone="error">Google sign-in didn&apos;t complete. Please try again or use your email and password.</Alert>}

      {error?.code === "EMAIL_NOT_VERIFIED" ? (
        <Alert
          tone="warning"
          title="Verify your email first"
          action={
            resendState === "sent" ? (
              <p className="font-medium">If the account needs it, a new link is on its way. Check your inbox.</p>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void resend()} disabled={resendState === "sending"}>
                {resendState === "sending" && <Spinner className="mr-2" />}
                Send a new verification link
              </Button>
            )
          }
        >
          We sent a link to your email when you signed up. Open it to activate your account.
        </Alert>
      ) : error ? (
        <Alert tone="error">{error.message}</Alert>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field id="email" label="Email" required>
          {(p) => (
            <Input {...p} ref={emailRef} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field id="password" label="Password" required>
          {(p) => (
            <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Spinner className="mr-2" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
