"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader, Spinner } from "@/components/ui/feedback";
import { useServiceStatus } from "@/components/session";
import { ApiError, api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { StudyPlan } from "@/lib/types";

const STATUS_LABEL: Record<StudyPlan["status"], string> = { ACTIVE: "Active", PAUSED: "Paused", COMPLETED: "Completed", ARCHIVED: "Archived" };

export default function PlansPage() {
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api<StudyPlan[]>("GET", "/study/plans?limit=50").then((r) => r.data) });
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study plans"
        description="Break a subject into topics, then schedule sessions to work through them."
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus aria-hidden="true" className="h-4 w-4" /> New plan
            </Button>
          )
        }
      />

      {creating && <CreatePlanForm onCancel={() => setCreating(false)} />}

      {plans.isPending ? (
        <LoadingBlock label="Loading your plans…" />
      ) : plans.isError ? (
        <ErrorState title="We couldn't load your plans" error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        !creating && (
          <EmptyState icon={CalendarCheck} title="No study plans yet" action={<Button onClick={() => setCreating(true)}>Create your first plan</Button>}>
            A plan holds the topics for one subject or exam.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map((p) => (
            <li key={p.id}>
              <Card className="card-glow relative h-full">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={p.status === "ACTIVE" ? "primary" : "neutral"}>{STATUS_LABEL[p.status]}</Badge>
                    {p.aiGenerated && <Badge tone="neutral"><Sparkles aria-hidden="true" className="h-3 w-3" />AI-drafted topics</Badge>}
                  </div>
                  <CardTitle className="font-display text-lg">
                    <Link href={`/plans/${p.id}`} className="underline-offset-4 after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:underline">{p.title}</Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {p.subject}
                    {p.examDate && ` · exam ${formatDate(p.examDate)}`}
                  </p>
                  <Progress value={p.completionPercentage} className="h-2" aria-label={`${p.completionPercentage}% of topics complete`} />
                  <p className="text-sm text-muted-foreground">{p.completedTopics} of {p.totalTopics} topics complete</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreatePlanForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { status } = useServiceStatus();
  const aiAvailable = Boolean(status?.ai.available);
  const [form, setForm] = useState({ title: "", subject: "", examDate: "", dailyGoalHours: "2" });
  const [busy, setBusy] = useState<"manual" | "ai" | null>(null);
  const [error, setError] = useState("");

  const submit = async (mode: "manual" | "ai") => {
    setError("");
    if (!form.subject.trim() || (mode === "manual" && !form.title.trim())) {
      setError(mode === "manual" ? "Give the plan a title and a subject." : "Enter a subject for the AI to plan.");
      return;
    }
    setBusy(mode);
    const body = {
      title: form.title.trim() || `${form.subject.trim()} study plan`,
      subject: form.subject.trim(),
      startDate: new Date().toISOString(),
      dailyGoalHours: Number(form.dailyGoalHours) || 2,
      ...(form.examDate ? { examDate: new Date(`${form.examDate}T09:00:00`).toISOString() } : {}),
    };
    try {
      const r = await api<StudyPlan>("POST", mode === "ai" ? "/study/plans/generate-ai" : "/study/plans", body);
      router.push(`/plans/${r.data.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? "The AI planner isn't available right now. Create the plan yourself; you can add topics in a minute."
          : err instanceof ApiError ? err.message : "Couldn't create the plan.",
      );
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-lg font-semibold">New study plan</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); void submit("manual"); }} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="plan-title" label="Title" required>
              {(p) => <Input {...p} value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Physics finals" />}
            </Field>
            <Field id="plan-subject" label="Subject" required>
              {(p) => <Input {...p} value={form.subject} maxLength={100} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Physics" />}
            </Field>
            <Field id="plan-exam" label="Exam date" hint="Optional.">
              {(p) => <Input {...p} type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />}
            </Field>
            <Field id="plan-hours" label="Hours per day" hint="Between 0.5 and 16.">
              {(p) => <Input {...p} type="number" min={0.5} max={16} step={0.5} value={form.dailyGoalHours} onChange={(e) => setForm({ ...form, dailyGoalHours: e.target.value })} />}
            </Field>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={busy !== null}>{busy === "manual" && <Spinner className="mr-2" />}Create plan</Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={busy !== null || !aiAvailable}
              aria-describedby="ai-plan-note"
              onClick={() => void submit("ai")}
            >
              {busy === "ai" ? <Spinner /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
              {busy === "ai" ? "Drafting topics (can take a minute)…" : "Draft topics with AI"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>Cancel</Button>
          </div>
          <p id="ai-plan-note" className="text-sm text-muted-foreground">
            {aiAvailable
              ? "AI drafting suggests topics from the subject. Review them before relying on them."
              : "AI drafting is unavailable because the AI service isn't running in this environment."}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
