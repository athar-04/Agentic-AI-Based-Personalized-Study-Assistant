import * as React from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Tone = "info" | "success" | "warning" | "error";

const toneStyles: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: { box: "border-border bg-muted text-foreground", icon: Info },
  success: { box: "border-success/40 bg-success/10 text-foreground", icon: CheckCircle2 },
  warning: { box: "border-warning/50 bg-warning-surface text-foreground", icon: TriangleAlert },
  error: { box: "border-destructive/50 bg-destructive/10 text-foreground", icon: AlertCircle },
};

const iconTone: Record<Tone, string> = {
  info: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

/**
 * Inline status message. Errors use role="alert" (announced at once); everything else is a
 * polite live region, so it never steals focus. Meaning is carried by text and icon, not colour.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = toneStyles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", box, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0", iconTone[tone])} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Error with a retry button: every failed load offers a way forward. */
export function ErrorState({ error, onRetry, title = "Something went wrong" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "Please try again.";
  return (
    <Alert
      tone="error"
      title={title}
      action={onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button> : undefined}
    >
      {message}
    </Alert>
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const styles = {
    neutral: "bg-secondary text-secondary-foreground",
    primary: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-foreground",
    warning: "bg-warning-surface text-foreground border border-warning/50",
    danger: "bg-destructive/15 text-foreground",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", styles, className)}>
      {children}
    </span>
  );
}

/** Marks anything that is sample/demo content, so it is never mistaken for the student's own results. */
export function SampleBadge({ children = "Sample content" }: { children?: React.ReactNode }) {
  return (
    <Badge tone="warning">
      <TriangleAlert aria-hidden="true" className="h-3 w-3" />
      {children}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function LoadingBlock({ label = "Loading…", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cn("h-4 w-4 animate-spin", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
