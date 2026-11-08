"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Gauge, Pause, Play, RefreshCw, ShieldAlert, Timer, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, ErrorState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { LineChart } from "@/components/charts";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { api } from "@/lib/api";
import type { AdminTraffic } from "@/lib/types";

const AREA_LABEL: Record<string, string> = {
  auth: "Sign-in & accounts",
  study: "Study (plans, sessions, quizzes)",
  users: "Profiles & preferences",
  admin: "Admin console",
  ai: "AI tutor & generators",
  analytics: "Analytics",
  status: "Status checks",
  other: "Other",
};

function uptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export default function TrafficPage() {
  const [live, setLive] = useState(true);
  const traffic = useQuery({
    queryKey: ["admin", "traffic"],
    queryFn: () => api<AdminTraffic>("GET", "/admin/traffic").then((r) => r.data),
    // Refreshes while the tab is visible; React Query pauses it in background tabs.
    refetchInterval: live ? 10_000 : false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traffic"
        description="Requests through the API gateway: counts only, no IP addresses or personal data. Counters reset when the gateway restarts."
        actions={
          <>
            <Button variant="outline" className="gap-2" aria-pressed={live} onClick={() => setLive((l) => !l)}>
              {live ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
              {live ? "Pause live updates" : "Resume live updates"}
            </Button>
            <Button variant="outline" size="icon" aria-label="Refresh now" onClick={() => void traffic.refetch()}>
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${traffic.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {traffic.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : traffic.isError ? (
        <ErrorState title="We couldn't load traffic" error={traffic.error} onRetry={() => void traffic.refetch()} />
      ) : !traffic.data.available ? (
        <Alert tone="info" title="Traffic metrics are unavailable">{traffic.data.reason}</Alert>
      ) : (
        <TrafficView data={traffic.data} live={live} />
      )}
    </div>
  );
}

function TrafficView({ data, live }: { data: Extract<AdminTraffic, { available: true }>; live: boolean }) {
  const errorRate = data.totals.requests ? Math.round((data.totals.errors / data.totals.requests) * 1000) / 10 : 0;
  const lastHourTotal = data.lastHour.reduce((s, m) => s + m.requests, 0);
  const points = data.lastHour.map((m) => {
    const d = new Date(m.minute);
    return {
      label: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      detail: `${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${m.errors} error${m.errors === 1 ? "" : "s"}`,
      value: m.requests,
    };
  });

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-success" : "bg-muted-foreground"}`} aria-hidden="true" />
        {live ? "Live, refreshing every 10 seconds" : "Paused"} · gateway up for {uptime(data.uptimeSeconds)}
      </p>

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Waves} label="Requests since start" value={data.totals.requests} />
        <Tile icon={AlertTriangle} label="Error rate" value={errorRate} suffix="%" />
        <Tile icon={Gauge} label="Rate-limited requests" value={data.totals.rateLimited} />
        <Tile icon={ShieldAlert} label="Failed sign-ins (student / admin)" value={data.totals.failedSignIns} extra={` / ${data.totals.failedAdminSignIns}`} />
      </Stagger>

      <Card className="card-glow">
        <CardContent className="p-5">
          <LineChart title="Requests per minute, last hour" points={points} unit="requests" summary={<><AnimatedNumber value={lastHourTotal} /> <span className="text-sm font-medium text-muted-foreground">in the last hour</span></>} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">By area</h2></CardHeader>
          <CardContent>
            {data.byArea.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests recorded yet.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <caption className="sr-only">Requests by area since the gateway started</caption>
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 font-medium">Area</th>
                      <th scope="col" className="py-2 text-right font-medium">Requests</th>
                      <th scope="col" className="py-2 text-right font-medium">Errors</th>
                      <th scope="col" className="py-2 text-right font-medium">Avg time</th>
                      <th scope="col" className="w-1/4 py-2"><span className="sr-only">Share of requests</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.byArea.map((a) => (
                      <tr key={a.area}>
                        <td className="py-2 font-medium">{AREA_LABEL[a.area] ?? a.area}</td>
                        <td className="py-2 text-right tabular-nums">{a.requests}</td>
                        <td className="py-2 text-right tabular-nums">{a.errors}</td>
                        <td className="py-2 text-right tabular-nums">{a.avgMs} ms</td>
                        <td className="py-2 pl-4">
                          <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                            <div className="h-1.5 origin-left rounded-full bg-chart chart-grow-x" style={{ width: `${(a.requests / data.totals.requests) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Responses</h2></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {(["2xx", "3xx", "4xx", "5xx"] as const).map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{{ "2xx": "Success (2xx)", "3xx": "Redirect (3xx)", "4xx": "Client error (4xx)", "5xx": "Server error (5xx)" }[k]}</dt>
                  <dd className="font-medium tabular-nums">{data.totals.byStatus[k]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              The error rate leaves out the expected 401s from visitors checking for a session they don&apos;t have.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer aria-hidden="true" className="h-3.5 w-3.5" />
              Since {new Date(data.startedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, suffix = "", extra }: { icon: typeof Waves; label: string; value: number; suffix?: string; extra?: string }) {
  return (
    <StaggerItem>
      <Card className="card-glow h-full">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
            {label}
          </div>
          <p className="font-display text-3xl font-bold">
            <AnimatedNumber value={value} format={(n) => `${suffix === "%" ? n.toFixed(1) : Math.round(n)}${suffix}`} />
            {extra && <span className="text-xl text-muted-foreground">{extra}</span>}
          </p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
