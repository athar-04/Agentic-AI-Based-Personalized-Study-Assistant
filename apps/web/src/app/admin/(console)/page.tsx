"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpenCheck, CalendarCheck, KeyRound, MailWarning, ScrollText, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { AuditList, ROLE_LABEL } from "@/components/admin-ui";
import { BarChart } from "@/components/charts";
import { AnimatedNumber, HoverLift, Stagger, StaggerItem } from "@/components/motion";
import { api } from "@/lib/api";
import type { AdminActivity, AdminOverview, DailyValue, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const toPoints = (rows: DailyValue[]) =>
  rows.map((r) => {
    const d = new Date(`${r.day}T12:00:00Z`);
    return {
      label: d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }),
      detail: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
      value: r.value,
    };
  });
const sum = (rows: DailyValue[]) => rows.reduce((s, r) => s + r.value, 0);

export default function AdminOverviewPage() {
  const [days, setDays] = useState<14 | 30>(14);
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<AdminOverview>("GET", "/admin/overview").then((r) => r.data) });
  const activity = useQuery({
    queryKey: ["admin", "activity", days],
    queryFn: () => api<AdminActivity>("GET", `/admin/activity?days=${days}`).then((r) => r.data),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin overview"
        description="Live figures from the database. Activity is grouped by UTC day."
        actions={
          <>
            <Button asChild variant="outline" className="gap-2"><Link href="/admin/traffic"><Activity aria-hidden="true" className="h-4 w-4" />Live traffic</Link></Button>
            <Button asChild className="gap-2"><Link href="/admin/users"><Users aria-hidden="true" className="h-4 w-4" />Manage users</Link></Button>
          </>
        }
      />

      {overview.isPending ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <span className="sr-only">Loading overview…</span>
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : overview.isError ? (
        <ErrorState title="We couldn't load the overview" error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <Stagger as="section" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Stat icon={Users} label="Total accounts" value={overview.data.users.total} href="/admin/users" />
          <Stat icon={UserCheck} label="Active" value={overview.data.users.active} href="/admin/users?status=active" />
          <Stat icon={UserX} label="Deactivated" value={overview.data.users.deactivated} href="/admin/users?status=deactivated" />
          <Stat icon={MailWarning} label="Email not verified" value={overview.data.users.unverified} href="/admin/users?status=unverified" />
          <Stat icon={UserPlus} label="New in the last 7 days" value={overview.data.users.newThisWeek} />
        </Stagger>
      )}

      <section aria-labelledby="activity-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="activity-heading" className="font-display text-xl font-semibold">Platform activity</h2>
          <div role="group" aria-label="Time range" className="inline-flex rounded-lg border p-1">
            {([14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn("min-h-11 rounded-md px-3 text-sm font-medium transition-colors", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              >
                Last {d} days
              </button>
            ))}
          </div>
        </div>
        {activity.isPending ? (
          <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-60" />)}</div>
        ) : activity.isError ? (
          <ErrorState title="We couldn't load activity" error={activity.error} onRetry={() => void activity.refetch()} />
        ) : (
          <>
            <Stagger className="grid gap-4 lg:grid-cols-2">
              {[
                { title: "Sign-ups", rows: activity.data.signups, unit: "accounts" },
                { title: "Active users", rows: activity.data.activeUsers, unit: "users" },
                { title: "Study minutes", rows: activity.data.studyMinutes, unit: "minutes" },
                { title: "Quiz attempts", rows: activity.data.quizAttempts, unit: "attempts" },
              ].map((c) => (
                <StaggerItem key={c.title}>
                  <Card className="card-glow h-full">
                    <CardContent className="p-5">
                      <BarChart
                        title={`${c.title}, last ${days} days`}
                        points={toPoints(c.rows)}
                        unit={c.unit}
                        summary={<><AnimatedNumber value={sum(c.rows)} /> <span className="text-sm font-medium text-muted-foreground">{c.unit}</span></>}
                      />
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
            <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Stat icon={CalendarCheck} label="Study plans" value={activity.data.totals.plans} />
              <Stat icon={BookOpenCheck} label="Completed sessions" value={activity.data.totals.completedSessions} />
              <Stat icon={BookOpenCheck} label="Quiz attempts (all time)" value={activity.data.totals.quizAttempts} />
              <Stat icon={ScrollText} label="Reviews waiting" value={activity.data.totals.pendingRevisions} />
              <Stat icon={KeyRound} label="Users signed in now" value={activity.data.totals.usersWithLiveSessions} />
            </Stagger>
          </>
        )}
      </section>

      {overview.data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">By role</h2></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(["STUDENT", "INSTRUCTOR", "ADMIN"] as Role[]).map((r) => (
                  <li key={r} className="flex items-center justify-between">
                    <Link href={`/admin/users?role=${r}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">{ROLE_LABEL[r]}s</Link>
                    <span className="tabular-nums">{overview.data.users.byRole[r] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h2 className="font-display text-lg font-semibold">Recent admin actions</h2>
              <Button asChild variant="ghost" size="sm"><Link href="/admin/audit">Full audit log</Link></Button>
            </CardHeader>
            <CardContent>
              {overview.data.recentActions.length ? (
                <AuditList entries={overview.data.recentActions} />
              ) : (
                <EmptyState icon={ScrollText} title="No admin actions yet">Changes made in the console will be recorded here.</EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: typeof Users; label: string; value: number; href?: string }) {
  const body = (
    <Card className="card-glow h-full">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
          {label}
        </div>
        <p className="font-display text-3xl font-bold"><AnimatedNumber value={value} /></p>
      </CardContent>
    </Card>
  );
  return (
    <StaggerItem>
      {href ? (
        <HoverLift className="h-full"><Link href={href} className="block h-full rounded-lg">{body}</Link></HoverLift>
      ) : (
        body
      )}
    </StaggerItem>
  );
}
