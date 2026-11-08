"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Brain, CalendarPlus, CheckCircle2, Circle, ListPlus, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatDateTime, toLocalInput } from "@/lib/format";
import type { StudyPlan, StudySession, Topic } from "@/lib/types";

const SESSION_STATUS: Record<StudySession["status"], string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  MISSED: "Missed",
  RESCHEDULED: "Rescheduled",
};

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useQuery({ queryKey: ["plan", id], queryFn: () => api<StudyPlan>("GET", `/study/plans/${id}`).then((r) => r.data) });
  const sessions = useQuery({
    queryKey: ["plan-sessions", id],
    queryFn: () => api<StudySession[]>("GET", `/study/sessions?planId=${id}&limit=100`).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <Link href="/plans" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All plans
      </Link>
      {plan.isPending ? (
        <LoadingBlock label="Loading plan…" lines={5} />
      ) : plan.isError ? (
        <ErrorState
          title={plan.error instanceof ApiError && plan.error.status === 404 ? "Plan not found" : "We couldn't load this plan"}
          error={plan.error}
          onRetry={() => void plan.refetch()}
        />
      ) : (
        <PlanView plan={plan.data} sessions={sessions.data} sessionsError={sessions.error} reloadSessions={() => void sessions.refetch()} />
      )}
    </div>
  );
}

function useRefresh(planId: string) {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["plan", planId] }),
      qc.invalidateQueries({ queryKey: ["plan-sessions", planId] }),
      qc.invalidateQueries({ queryKey: ["plans"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["revisions"] }),
    ]);
  };
}

function PlanView({ plan, sessions, sessionsError, reloadSessions }: { plan: StudyPlan; sessions?: StudySession[]; sessionsError: unknown; reloadSessions: () => void }) {
  const router = useRouter();
  const refresh = useRefresh(plan.id);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice({ tone: "success", text: success });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "That didn't work. Please try again." });
    }
  };

  const setStatus = (status: StudyPlan["status"]) =>
    run(() => api("PUT", `/study/plans/${plan.id}/status`, { status }), `Plan marked ${status.toLowerCase()}.`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge tone={plan.status === "ACTIVE" ? "primary" : "neutral"}>{plan.status.charAt(0) + plan.status.slice(1).toLowerCase()}</Badge>
            {plan.aiGenerated && <Badge>Topics drafted by AI — review them</Badge>}
          </div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{plan.title}</h1>
          <p className="text-muted-foreground">
            {plan.subject} · {plan.dailyGoalHours} h/day
            {plan.examDate && ` · exam ${formatDate(plan.examDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.status === "ACTIVE" ? (
            <Button variant="outline" onClick={() => void setStatus("PAUSED")}>Pause plan</Button>
          ) : (
            <Button variant="outline" onClick={() => void setStatus("ACTIVE")}>Make active</Button>
          )}
          {plan.status !== "COMPLETED" && <Button variant="outline" onClick={() => void setStatus("COMPLETED")}>Mark completed</Button>}
          <ConfirmDialog
            trigger={<Button variant="outline" className="gap-2 text-destructive"><Trash2 aria-hidden="true" className="h-4 w-4" />Delete</Button>}
            title="Delete this plan?"
            description={<>This permanently deletes <strong>{plan.title}</strong> with its topics and sessions. It can&apos;t be undone.</>}
            confirmLabel="Delete plan"
            destructive
            onConfirm={async () => {
              try {
                await api("DELETE", `/study/plans/${plan.id}`);
                await refresh();
                router.replace("/plans");
              } catch (err) {
                setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't delete the plan." });
              }
            }}
          />
        </div>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Card>
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Topic progress</span>
            <span className="tabular-nums text-muted-foreground">{plan.completedTopics} / {plan.totalTopics} · {plan.completionPercentage}%</span>
          </div>
          <Progress value={plan.completionPercentage} className="h-2" aria-label={`${plan.completionPercentage}% of topics complete`} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopicsCard plan={plan} run={run} />
        <SessionsCard plan={plan} sessions={sessions} error={sessionsError} reload={reloadSessions} run={run} />
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, success: string) => Promise<void>;

function TopicsCard({ plan, run }: { plan: StudyPlan; run: Run }) {
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("1");
  const [adding, setAdding] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    await run(() => api("POST", `/study/topics/plan/${plan.id}`, { title: title.trim(), estimatedHours: Number(hours) || 1 }), `Added "${title.trim()}".`);
    setTitle("");
    setAdding(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="font-display text-lg font-semibold">Topics</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
          <Field id="topic-title" label="New topic">
            {(p) => <Input {...p} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Second law of thermodynamics" />}
          </Field>
          <Field id="topic-hours" label="Hours">
            {(p) => <Input {...p} type="number" min={0.5} max={50} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />}
          </Field>
          <Button type="submit" disabled={adding || !title.trim()} className="gap-2">
            {adding ? <Spinner /> : <ListPlus aria-hidden="true" className="h-4 w-4" />}Add
          </Button>
        </form>

        {plan.topics.length === 0 ? (
          <EmptyState icon={ListPlus} title="No topics yet">Add the chapters or skills this plan covers.</EmptyState>
        ) : (
          <ul className="divide-y rounded-md border">
            {plan.topics.map((t) => <TopicRow key={t.id} topic={t} run={run} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TopicRow({ topic, run }: { topic: Topic; run: Run }) {
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        {topic.isCompleted ? (
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />
        ) : (
          <Circle aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <span className={topic.isCompleted ? "text-muted-foreground line-through" : "font-medium"}>{topic.title}</span>
        <span className="sr-only">{topic.isCompleted ? "(complete)" : "(not complete)"}</span>
        <span className="ml-auto text-sm text-muted-foreground sm:ml-2">~{topic.estimatedHours} h</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {!topic.isCompleted && (
          <Button size="sm" variant="ghost" onClick={() => void run(() => api("PUT", `/study/topics/${topic.id}/complete`), `"${topic.title}" complete. First review scheduled for tomorrow.`)}>
            Mark done<span className="sr-only">: {topic.title}</span>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link href={`/practice?topicId=${topic.id}`}><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />Quiz me<span className="sr-only"> on {topic.title}</span></Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link href={`/tutor?topicId=${topic.id}`}><Brain aria-hidden="true" className="h-3.5 w-3.5" />Ask tutor<span className="sr-only"> about {topic.title}</span></Link>
        </Button>
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => void run(() => api("POST", "/study/revisions", { topicId: topic.id }), `"${topic.title}" is in your revision queue.`)}>
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Revise<span className="sr-only">: {topic.title}</span>
        </Button>
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" aria-label={`Delete topic ${topic.title}`}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
          title="Delete this topic?"
          description={<>Remove <strong>{topic.title}</strong> from the plan.</>}
          confirmLabel="Delete topic"
          destructive
          onConfirm={() => run(() => api("DELETE", `/study/topics/${topic.id}`), "Topic deleted.")}
        />
      </div>
    </li>
  );
}

function SessionsCard({ plan, sessions, error, reload, run }: { plan: StudyPlan; sessions?: StudySession[]; error: unknown; reload: () => void; run: Run }) {
  const [form, setForm] = useState(() => ({ title: "", topicId: "", when: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)), duration: "45" }));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const when = new Date(form.when);
    if (!form.title.trim() || Number.isNaN(when.getTime())) {
      setFormError("Add a title and a valid date and time.");
      return;
    }
    setSaving(true);
    await run(
      () => api("POST", "/study/sessions", {
        planId: plan.id,
        title: form.title.trim(),
        scheduledAt: when.toISOString(),
        durationMinutes: Number(form.duration) || 45,
        ...(form.topicId ? { topicId: form.topicId } : {}),
      }),
      "Session scheduled.",
    );
    setForm((f) => ({ ...f, title: "" }));
    setSaving(false);
  };

  const upcoming = (sessions ?? []).filter((s) => s.status !== "COMPLETED");
  const done = (sessions ?? []).filter((s) => s.status === "COMPLETED");

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="font-display text-lg font-semibold">Study sessions</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => void schedule(e)} className="space-y-3 rounded-md border p-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field id="session-title" label="Session title" required>
            {(p) => <Input {...p} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Practice problems, chapter 4" />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="session-when" label="Date and time" required>
              {(p) => <Input {...p} type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />}
            </Field>
            <Field id="session-duration" label="Minutes">
              {(p) => <Input {...p} type="number" min={5} max={480} step={5} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />}
            </Field>
          </div>
          {plan.topics.length > 0 && (
            <Field id="session-topic" label="Topic" hint="Optional.">
              {(p) => (
                <Select {...p} value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
                  <option value="">No specific topic</option>
                  {plan.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Spinner /> : <CalendarPlus aria-hidden="true" className="h-4 w-4" />}Schedule session
          </Button>
        </form>

        {error ? (
          <ErrorState title="We couldn't load sessions" error={error} onRetry={reload} />
        ) : !sessions ? (
          <LoadingBlock label="Loading sessions…" lines={2} />
        ) : sessions.length === 0 ? (
          <EmptyState icon={CalendarPlus} title="No sessions yet">Schedule one above; it will show on your dashboard.</EmptyState>
        ) : (
          <div className="space-y-4">
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Upcoming</h3>
                <ul className="divide-y rounded-md border">
                  {upcoming.map((s) => (
                    <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{s.title}</p>
                        <p className="text-sm text-muted-foreground">{formatDateTime(s.scheduledAt)} · {s.durationMinutes} min · {SESSION_STATUS[s.status]}</p>
                      </div>
                      <div className="flex gap-1">
                        {s.status !== "IN_PROGRESS" && (
                          <Button size="sm" variant="ghost" className="gap-1" onClick={() => void run(() => api("POST", `/study/sessions/${s.id}/start`), "Session started.")}>
                            <Play aria-hidden="true" className="h-3.5 w-3.5" />Start<span className="sr-only">: {s.title}</span>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => void run(() => api("POST", `/study/sessions/${s.id}/complete`, { markTopicComplete: Boolean(s.topicId) }), "Session completed and added to your study time.")}>
                          Complete<span className="sr-only">: {s.title}</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {done.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
                <ul className="divide-y rounded-md border">
                  {done.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <span className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />{s.title}</span>
                      <span className="text-muted-foreground">{s.actualMinutes ?? s.durationMinutes} min</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
