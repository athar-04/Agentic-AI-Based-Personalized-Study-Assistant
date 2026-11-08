"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, CalendarPlus, Clock, Flame, Pencil, Play, RotateCcw, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, PageHeader, Skeleton, Spinner } from "@/components/ui/feedback";
import { useServiceStatus, useSession } from "@/components/session";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatMinutes, formatRelative } from "@/lib/format";
import type { Overview, StudySession } from "@/lib/types";
import { Stagger, StaggerItem } from "@/components/motion";

export default function DashboardPage() {
  const { user } = useSession();
  const { status } = useServiceStatus();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("GET", "/study/overview").then((r) => r.data) });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user?.firstName ?? "there"}`}
        description="Your progress below comes from the sessions, quizzes and reviews you record."
        actions={
          <>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/practice"><BookOpen aria-hidden="true" className="h-4 w-4" />Practice quiz</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/plans"><CalendarPlus aria-hidden="true" className="h-4 w-4" />Plan a session</Link>
            </Button>
          </>
        }
      />

      {status && !status.ai.available && (
        <Alert tone="info" title="AI features are offline in this environment">
          The AI tutor and AI-generated quizzes need the AI service, which isn&apos;t running here. Plans, sessions, practice sets and
          revision all work without it.
        </Alert>
      )}

      {overview.isPending ? (
        <DashboardSkeleton />
      ) : overview.isError ? (
        <ErrorState title="We couldn't load your dashboard" error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <DashboardContent data={overview.data} />
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <span className="sr-only">Loading your dashboard…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className={i < 4 ? "h-32" : "h-56 md:col-span-1 xl:col-span-2"} />
      ))}
    </div>
  );
}

function DashboardContent({ data }: { data: Overview }) {
  const newStudent = data.planCount === 0 && data.totalCompletedSessions === 0 && data.recentQuizzes.length === 0;
  return (
    <div className="space-y-6">
      {newStudent && (
        <Alert
          tone="info"
          title="Welcome! Your dashboard fills in as you study"
          action={
            <Button asChild size="sm">
              <Link href="/plans">Create your first study plan</Link>
            </Button>
          }
        >
          Start with a plan and a scheduled session, or take a practice set. Nothing below is filled with sample numbers.
        </Alert>
      )}

      <h2 id="stats-heading" className="sr-only">Progress summary</h2>
      <Stagger as="section" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem><GoalCard goal={data.goal} /></StaggerItem>
        <StaggerItem><StatCard icon={Clock} label="Study time, last 7 days" value={formatMinutes(data.week.minutes)} hint={`${data.totalCompletedSessions} completed session${data.totalCompletedSessions === 1 ? "" : "s"} in total`} /></StaggerItem>
        <StaggerItem><StatCard icon={Flame} label="Study streak" value={`${data.streakDays} day${data.streakDays === 1 ? "" : "s"}`} hint={data.streakDays ? "Days in a row with a completed session" : "Complete a session today to start one"} /></StaggerItem>
        <StaggerItem>
          <StatCard
            icon={RotateCcw}
            label="Reviews due"
            value={String(data.revisionsDue)}
            hint={data.revisionsDue ? "Topics ready to revisit now" : "Nothing due right now"}
            href={data.revisionsDue ? "/revision" : undefined}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NextSessionCard session={data.nextSession} />
          <ActivePlanCard plan={data.activePlan} />
        </div>
        <div className="space-y-6">
          <WeekCard days={data.week.days} timeZone={data.timeZone} />
          <RecentQuizzesCard quizzes={data.recentQuizzes} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, href }: { icon: typeof Clock; label: string; value: string; hint: string; href?: string }) {
  return (
    <Card className="card-glow h-full">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
          {label}
        </div>
        <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">
          {href ? <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">{hint}</Link> : hint}
        </p>
      </CardContent>
    </Card>
  );
}

function GoalCard({ goal }: { goal: Overview["goal"] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal.dailyMinutes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pct = Math.min(100, Math.round((goal.todayMinutes / Math.max(goal.dailyMinutes, 1)) * 100));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 720) {
      setError("Enter whole minutes between 10 and 720.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("PUT", "/users/me/preferences", { dailyStudyGoalMinutes: minutes });
      await qc.invalidateQueries({ queryKey: ["overview"] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-glow h-full">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target aria-hidden="true" className="h-4 w-4 text-primary" />
            Today&apos;s goal
          </div>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-11 gap-1 px-3" onClick={() => { setValue(String(goal.dailyMinutes)); setEditing(true); }}>
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              Edit<span className="sr-only"> daily study goal</span>
            </Button>
          )}
        </div>
        {editing ? (
          <form onSubmit={(e) => void save(e)} className="space-y-2">
            <Field id="goal-minutes" label="Daily goal (minutes)" error={error}>
              {(p) => <Input {...p} type="number" min={10} max={720} step={5} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving && <Spinner className="mr-2" />}Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-display text-2xl font-bold tabular-nums">
              {goal.todayMinutes} <span className="text-base font-medium text-muted-foreground">/ {goal.dailyMinutes} min</span>
            </p>
            <Progress value={pct} className="h-2" aria-label={`Today's goal ${pct}% complete`} />
            <p className="text-sm text-muted-foreground">{pct >= 100 ? "Goal reached today. Nice work." : `${goal.dailyMinutes - goal.todayMinutes} min to go`}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NextSessionCard({ session }: { session: StudySession | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (action: "start" | "complete") => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api("POST", `/study/sessions/${session.id}/${action}`, action === "complete" ? {} : undefined);
      await qc.invalidateQueries({ queryKey: ["overview"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <CalendarCheck aria-hidden="true" className="h-5 w-5 text-primary" />
          Next session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {!session ? (
          <EmptyState
            icon={CalendarPlus}
            title="No session scheduled"
            action={<Button asChild size="sm"><Link href="/plans">Schedule a session</Link></Button>}
          >
            Open a study plan and add a session to see it here.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-lg font-semibold">{session.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(session.scheduledAt)} · {session.durationMinutes} min
                {session.status === "IN_PROGRESS" && <Badge tone="primary" className="ml-2">In progress</Badge>}
              </p>
            </div>
            <div className="flex gap-2">
              {session.status !== "IN_PROGRESS" && (
                <Button variant="outline" onClick={() => void act("start")} disabled={busy} className="gap-2">
                  <Play aria-hidden="true" className="h-4 w-4" />Start
                </Button>
              )}
              <Button onClick={() => void act("complete")} disabled={busy} className="gap-2">
                {busy && <Spinner />}Mark complete
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivePlanCard({ plan }: { plan: Overview["activePlan"] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="font-display text-lg">Active study plan</CardTitle>
        {plan && <Badge tone="primary">{plan.completionPercentage}% complete</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!plan ? (
          <EmptyState icon={CalendarCheck} title="No active plan" action={<Button asChild size="sm"><Link href="/plans">Create a plan</Link></Button>}>
            Plans break a subject into topics you can schedule and tick off.
          </EmptyState>
        ) : (
          <>
            <div className="space-y-1">
              <Link href={`/plans/${plan.id}`} className="inline-flex min-h-11 items-center text-lg font-semibold underline-offset-4 hover:underline">{plan.title}</Link>
              <p className="text-sm text-muted-foreground">
                {plan.subject} · {plan.completedTopics} of {plan.totalTopics} topics done
                {plan.examDate && ` · exam ${formatRelative(plan.examDate)}`}
              </p>
            </div>
            <Progress value={plan.completionPercentage} className="h-2" aria-label={`${plan.title}: ${plan.completionPercentage}% of topics complete`} />
            {plan.totalTopics === 0 ? (
              <p className="text-sm text-muted-foreground">This plan has no topics yet. <Link href={`/plans/${plan.id}`} className="font-medium text-primary underline-offset-4 hover:underline">Add some</Link>.</p>
            ) : plan.nextTopics.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Up next</h3>
                <ul className="space-y-2">
                  {plan.nextTopics.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-md border p-3">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent text-sm font-bold text-accent-foreground">{i + 1}</span>
                      <span className="flex-1 font-medium">{t.title}</span>
                      <span className="text-sm text-muted-foreground">~{t.estimatedHours} h</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm font-medium text-success">Every topic in this plan is complete.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WeekCard({ days, timeZone }: { days: Overview["week"]["days"]; timeZone: string }) {
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg">This week</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Bars are decorative; the list below them carries every value for screen readers. */}
        <div aria-hidden="true" className="flex h-32 items-end gap-2">
          {days.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end rounded bg-muted">
                <div className="w-full rounded bg-primary" style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes ? 4 : 0 }} />
              </div>
              <span className="text-xs text-muted-foreground">{label(d.date)}</span>
            </div>
          ))}
        </div>
        <ul className="sr-only">
          {days.map((d) => <li key={d.date}>{label(d.date)} {d.date}: {d.minutes} minutes</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Minutes from completed sessions, by day ({timeZone}).</p>
      </CardContent>
    </Card>
  );
}

function RecentQuizzesCard({ quizzes }: { quizzes: Overview["recentQuizzes"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <Trophy aria-hidden="true" className="h-5 w-5 text-primary" />
          Recent quiz scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!quizzes.length ? (
          <EmptyState icon={BookOpen} title="No quizzes yet" action={<Button asChild size="sm" variant="outline"><Link href="/practice">Take a practice set</Link></Button>}>
            Your own scores appear here after you submit a quiz.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {quizzes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{q.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(q.completedAt)} · {q.source === "SAMPLE_BANK" ? "sample practice set" : "AI-generated"}
                  </p>
                </div>
                <span className="font-display text-lg font-bold tabular-nums">{Math.round(q.percentage)}%</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
