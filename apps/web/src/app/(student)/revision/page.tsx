"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { RevisionItem } from "@/lib/types";

// Recall quality on the SM-2 scale: below 3 restarts the interval.
const RATINGS = [
  { quality: 1, label: "Forgot", hint: "review again tomorrow" },
  { quality: 3, label: "Hard", hint: "shorter gap" },
  { quality: 4, label: "Good", hint: "normal gap" },
  { quality: 5, label: "Easy", hint: "longer gap" },
];

type Filter = "due" | "upcoming" | "all";

export default function RevisionPage() {
  const [filter, setFilter] = useState<Filter>("due");
  const items = useQuery({
    queryKey: ["revisions", filter],
    queryFn: () => api<RevisionItem[]>("GET", `/study/revisions?filter=${filter}`).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Revision" description="Spaced repetition: rate how well you remembered each topic and it comes back at the right time." />

      <div role="group" aria-label="Which items to show" className="inline-flex rounded-lg border p-1">
        {(["due", "upcoming", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-10 rounded-md px-4 text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
          >
            {{ due: "Due now", upcoming: "Upcoming", all: "All" }[f]}
          </button>
        ))}
      </div>

      <div>
        {items.isPending ? (
          <LoadingBlock label="Loading revision items…" />
        ) : items.isError ? (
          <ErrorState error={items.error} onRetry={() => void items.refetch()} />
        ) : items.data.length === 0 ? (
          <EmptyState
            icon={filter === "due" ? CheckCircle2 : RotateCcw}
            title={filter === "due" ? "Nothing due right now" : "Your revision queue is empty"}
            action={<Button asChild variant="outline" size="sm"><Link href="/plans">Go to your plans</Link></Button>}
          >
            Topics join the queue when you mark them done, or when you press &ldquo;Revise&rdquo; on a topic.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {items.data.map((item) => <RevisionCard key={item.id} item={item} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function RevisionCard({ item }: { item: RevisionItem }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["revisions"] }), qc.invalidateQueries({ queryKey: ["overview"] })]);

  const review = async (quality: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ intervalDays: number; nextRevisionAt: string }>("POST", `/study/revisions/${item.id}/review`, { quality });
      setMessage({ tone: "success", text: `Recorded. Next review ${formatRelative(r.data.nextRevisionAt)}.` });
      setTimeout(() => void refresh(), 1200);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't record the review." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("DELETE", `/study/revisions/${item.id}`);
      await refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't remove it." });
      setBusy(false);
    }
  };

  return (
    <li>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-sm text-muted-foreground">
                {item.plan ? <Link href={`/plans/${item.plan.id}`} className="underline-offset-4 hover:underline">{item.plan.title}</Link> : "No plan"}
                {" · "}
                {item.isDue ? "due now" : `next ${formatDateTime(item.nextRevisionAt)}`}
                {item.repetitionCount > 0 && ` · reviewed ${item.repetitionCount}×, every ${item.intervalDays} day${item.intervalDays === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {item.isDue && <Badge tone="warning">Due</Badge>}
              <Button variant="ghost" size="icon" onClick={() => void remove()} disabled={busy} aria-label={`Remove ${item.title} from revision`}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How well did you remember it?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <Button key={r.quality} variant={r.quality === 4 ? "default" : "outline"} disabled={busy} onClick={() => void review(r.quality)} className="h-auto min-h-11 flex-col gap-0 py-2">
                  <span>{r.label}</span>
                  <span className={`text-xs font-normal ${r.quality === 4 ? "opacity-90" : "text-muted-foreground"}`}>{r.hint}</span>
                </Button>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>
    </li>
  );
}
