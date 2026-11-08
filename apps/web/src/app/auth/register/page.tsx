"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AuthCard, PASSWORD_RULES, PasswordChecklist, pendingEmail } from "@/components/auth-ui";
import { ApiError, publicApi } from "@/lib/api";

type Form = { firstName: string; lastName: string; username: string; email: string; password: string };

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>({ firstName: "", lastName: "", username: "", email: "", password: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const fieldError = (key: string) => error?.fieldErrors?.[key]?.join(" ");
  const passwordOk = PASSWORD_RULES.every((r) => r.test(form.password));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passwordOk) {
      setError(new ApiError("Choose a password that meets every requirement below.", 400, undefined, { password: ["Password doesn't meet the requirements yet."] }));
      document.getElementById("password")?.focus();
      return;
    }
    setLoading(true);
    try {
      await publicApi("POST", "/auth/register", { ...form, email: form.email.trim() });
      // No session is created at signup. The address is passed on without putting it in the URL.
      pendingEmail.set(form.email.trim());
      router.push("/auth/check-email");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong. Please try again.", 0));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      description="We'll email you a link to confirm your address before you sign in."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {error && !error.fieldErrors && <Alert tone="error">{error.message}</Alert>}
      {error?.fieldErrors && <Alert tone="error">Please fix the highlighted fields.</Alert>}
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="firstName" label="First name" required error={fieldError("firstName")}>
            {(p) => <Input {...p} autoComplete="given-name" value={form.firstName} onChange={set("firstName")} maxLength={50} />}
          </Field>
          <Field id="lastName" label="Last name" required error={fieldError("lastName")}>
            {(p) => <Input {...p} autoComplete="family-name" value={form.lastName} onChange={set("lastName")} maxLength={50} />}
          </Field>
        </div>
        <Field id="username" label="Username" required hint="3–30 letters, numbers or underscores." error={fieldError("username") ?? (error?.code === "USERNAME_TAKEN" ? error.message : undefined)}>
          {(p) => <Input {...p} autoComplete="username" value={form.username} onChange={set("username")} minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" />}
        </Field>
        <Field id="email" label="Email" required error={fieldError("email")}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} />}
        </Field>
        <Field id="password" label="Password" required error={fieldError("password")}>
          {(p) => (
            <>
              <Input
                {...p}
                aria-describedby={[p["aria-describedby"], "password-rules"].filter(Boolean).join(" ")}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
              />
              <PasswordChecklist id="password-rules" password={form.password} />
            </>
          )}
        </Field>
        <p className="text-sm text-muted-foreground">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">terms of use</Link> and the{" "}
          <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">privacy notice</Link>.
        </p>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Spinner className="mr-2" />}
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
