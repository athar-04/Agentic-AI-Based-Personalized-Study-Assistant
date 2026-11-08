"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AuthCard, DevMailboxNotice, pendingEmail } from "@/components/auth-ui";
import { useServiceStatus } from "@/components/session";
import { ApiError, publicApi } from "@/lib/api";

const COOLDOWN_SECONDS = 60;

export default function CheckEmailPage() {
  const { status } = useServiceStatus();
  const [email, setEmail] = useState("");
  const [known, setKnown] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const e = pendingEmail.get();
    setEmail(e);
    setKnown(Boolean(e));
    // A link was just sent at signup; the server enforces the same cooldown.
    if (!e) setCooldown(0);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const r = await publicApi<{ retryAfterSeconds: number }>("POST", "/auth/resend-verification", { email: email.trim() });
      setMessage({ tone: "success", text: r.message ?? "If an account needs it, a new link is on its way." });
      setCooldown(r.data?.retryAfterSeconds ?? COOLDOWN_SECONDS);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't send. Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthCard
      title="Check your email"
      description={
        known ? (
          <>We sent a verification link to <strong className="text-foreground">{email}</strong>.</>
        ) : (
          "Enter your email and we'll send a fresh verification link."
        )
      }
      footer={
        <p>
          Verified already?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck aria-hidden="true" className="h-7 w-7" />
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Open the link to activate your account. It works once and expires in 24 hours. You can&apos;t sign in until it&apos;s done.
      </p>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <form onSubmit={(e) => void resend(e)} className="space-y-3">
        {!known && (
          <Field id="email" label="Email" required>
            {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
        )}
        <Button type="submit" variant="outline" className="w-full" disabled={sending || cooldown > 0 || !email.trim()}>
          {sending && <Spinner className="mr-2" />}
          {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
        </Button>
      </form>

      {status?.devMailbox && <DevMailboxNotice />}
    </AuthCard>
  );
}
