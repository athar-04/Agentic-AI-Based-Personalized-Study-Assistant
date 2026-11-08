"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, LoadingBlock, Spinner } from "@/components/ui/feedback";
import { AuthCard, useFragmentToken } from "@/components/auth-ui";
import { ApiError, publicApi } from "@/lib/api";

export default function VerifyEmailPage() {
  const { token, checked } = useFragmentToken();
  const [state, setState] = useState<"ready" | "verifying" | "done" | "failed">("ready");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Nothing is sent until the user submits, so link scanners and previews can't consume the
  // single-use token. The password proves this is the person who signed up, not just someone
  // who can read the inbox.
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;
    setState("verifying");
    setPasswordError("");
    try {
      await publicApi("POST", "/auth/verify-email", { token, password });
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "PASSWORD_MISMATCH") {
        setPasswordError(err.message);
        setState("ready");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Verification failed. Please try again.");
      setState("failed");
    }
  };

  if (!checked) {
    return (
      <AuthCard title="Verify your email">
        <LoadingBlock label="Reading your link…" lines={2} />
      </AuthCard>
    );
  }

  if (state === "done") {
    return (
      <AuthCard title="Email verified">
        <Alert tone="success">Your account is active. Sign in to start studying.</Alert>
        <Button asChild className="w-full">
          <Link href="/auth/login?verified=1">Continue to sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  if (!token || state === "failed") {
    return (
      <AuthCard title="This link can't be used">
        <Alert tone="error">
          {state === "failed" ? error : "This page needs the link from your verification email."} Links work once and expire after 24 hours.
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/check-email">Get a new link</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify your email" description="Enter the password you chose when you signed up to activate your account.">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ShieldCheck aria-hidden="true" className="h-7 w-7" />
        </div>
      </div>
      <form onSubmit={(e) => void verify(e)} className="space-y-4">
        <Field id="password" label="Password" required error={passwordError} hint={passwordError ? undefined : "The one you chose at signup."}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" className="w-full" disabled={state === "verifying" || !password}>
          {state === "verifying" && <Spinner className="mr-2" />}
          {state === "verifying" ? "Verifying…" : "Verify my email"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t sign up? Close this page; nothing happens unless you submit. Forgot the password you chose?{" "}
        <Link href="/auth/register" className="font-medium text-primary underline-offset-4 hover:underline">Sign up again</Link> with the same email to set a new one.
      </p>
    </AuthCard>
  );
}
