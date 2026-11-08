"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, LoadingBlock, Spinner } from "@/components/ui/feedback";
import { AuthCard, PASSWORD_RULES, PasswordChecklist, useFragmentToken } from "@/components/auth-ui";
import { ApiError, publicApi } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { token, checked } = useFragmentToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const valid = PASSWORD_RULES.every((r) => r.test(password)) && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !valid) return;
    setSaving(true);
    setError("");
    try {
      await publicApi("POST", "/auth/reset-password", { token, password });
      router.replace("/auth/login?reset=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset your password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!checked) {
    return (
      <AuthCard title="Choose a new password">
        <LoadingBlock lines={2} />
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard title="This link can't be used">
        <Alert tone="error">This page needs the link from your password reset email. Links work once and expire after 1 hour.</Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="This signs you out on every other device.">
      {error && (
        <Alert tone="error" action={<Link href="/auth/forgot-password" className="font-medium underline">Request a new link</Link>}>
          {error}
        </Alert>
      )}
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field id="password" label="New password" required>
          {(p) => (
            <>
              <Input {...p} aria-describedby="password-rules" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <PasswordChecklist id="password-rules" password={password} />
            </>
          )}
        </Field>
        <Field id="confirm" label="Confirm new password" required error={confirm && confirm !== password ? "Passwords don't match." : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" className="w-full" disabled={saving || !valid}>
          {saving && <Spinner className="mr-2" />}
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
