"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, ErrorState, LoadingBlock, PageHeader, Spinner } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/components/session";
import { ApiError, api, updateSessionUser } from "@/lib/api";
import type { Preferences } from "@/lib/types";

type Notice = { tone: "success" | "error"; text: string } | null;

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Your profile and study preferences." />
      <ProfileCard />
      <StudyCard />
      <CloseAccountCard />
    </div>
  );
}

function ProfileCard() {
  const { user } = useSession();
  const [form, setForm] = useState({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await api("PUT", "/users/me", { firstName: form.firstName.trim(), lastName: form.lastName.trim() });
      updateSessionUser({ firstName: form.firstName.trim(), lastName: form.lastName.trim() });
      setNotice({ tone: "success", text: "Profile saved." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't save your profile." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Profile</h2></CardHeader>
      <CardContent>
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="first" label="First name" required>
              {(p) => <Input {...p} autoComplete="given-name" maxLength={50} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />}
            </Field>
            <Field id="last" label="Last name" required>
              {(p) => <Input {...p} autoComplete="family-name" maxLength={50} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />}
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">Signed in as {user?.email}</p>
          <Button type="submit" disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>{saving && <Spinner className="mr-2" />}Save profile</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StudyCard() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: () => api<Preferences>("GET", "/users/me/preferences").then((r) => r.data) });
  const [goal, setGoal] = useState("");
  const [tz, setTz] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (prefs.data) {
      setGoal(String(prefs.data.dailyStudyGoalMinutes));
      setTz(prefs.data.timezone);
    }
  }, [prefs.data]);

  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = Number(goal);
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 720) {
      setNotice({ tone: "error", text: "Daily goal must be whole minutes between 10 and 720." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await api("PUT", "/users/me/preferences", { dailyStudyGoalMinutes: minutes, timezone: tz });
      await Promise.all([qc.invalidateQueries({ queryKey: ["preferences"] }), qc.invalidateQueries({ queryKey: ["overview"] })]);
      setNotice({ tone: "success", text: "Study preferences saved." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't save your preferences." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Study preferences</h2></CardHeader>
      <CardContent>
        {prefs.isPending ? (
          <LoadingBlock lines={2} />
        ) : prefs.isError ? (
          <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />
        ) : (
          <form onSubmit={(e) => void save(e)} className="space-y-4">
            {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
            <Field id="goal" label="Daily study goal (minutes)" hint="Shown as today's goal on your dashboard.">
              {(p) => <Input {...p} type="number" min={10} max={720} step={5} value={goal} onChange={(e) => setGoal(e.target.value)} />}
            </Field>
            <Field id="tz" label="Time zone" hint="Decides when your day starts for goals and streaks.">
              {(p) => (
                <Select {...p} value={tz} onChange={(e) => setTz(e.target.value)}>
                  {!zones.includes(tz) && tz && <option value={tz}>{tz}</option>}
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </Select>
              )}
            </Field>
            {tz !== browserTz && (
              <Button type="button" variant="link" className="h-auto min-h-11 whitespace-normal p-0 text-left" onClick={() => setTz(browserTz)}>
                Use this device&apos;s time zone ({browserTz})
              </Button>
            )}
            <div>
              <Button type="submit" disabled={saving}>{saving && <Spinner className="mr-2" />}Save preferences</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CloseAccountCard() {
  const { user, signOut } = useSession();
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    setError(null);
    try {
      await api("DELETE", "/users/me");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't close your account. Please try again.");
      return;
    }
    // The server has already ended every session; this clears the one in this browser. A full page
    // load, because the signed-in pages' guard would otherwise send them to sign-in (?next=/settings).
    await signOut();
    window.location.replace("/");
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Close account</h2></CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-muted-foreground">
          You&apos;ll be signed out on every device and won&apos;t be able to sign in again. Your study data is kept until it is erased on
          request; the{" "}
          <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">privacy notice</Link> explains how
          to ask.
        </p>
        <ConfirmDialog
          destructive
          trigger={<Button variant="destructive">Close my account</Button>}
          title="Close your account?"
          description={<>You&apos;ll be signed out everywhere, and <strong>{user?.email}</strong> won&apos;t be able to sign in again.</>}
          confirmLabel="Close account"
          onConfirm={close}
        />
      </CardContent>
    </Card>
  );
}
