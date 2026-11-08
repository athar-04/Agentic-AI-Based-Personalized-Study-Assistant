"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AuthCard, DevMailboxNotice } from "@/components/auth-ui";
import { useServiceStatus } from "@/components/session";
import { ApiError, publicApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const { status } = useServiceStatus();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await publicApi("POST", "/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link href="/auth/login" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success" title="Check your inbox">
          If an account exists for {email.trim()}, a reset link is on its way. It works once and expires in 1 hour.
        </Alert>
      ) : (
        <>
          {error && <Alert tone="error">{error}</Alert>}
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Field id="email" label="Email" required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending && <Spinner className="mr-2" />}
              Send reset link
            </Button>
          </form>
        </>
      )}
      {status?.devMailbox && <DevMailboxNotice />}
    </AuthCard>
  );
}
