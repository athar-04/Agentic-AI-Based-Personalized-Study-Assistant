"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, LogOut, MailCheck, MailPlus, ScrollText, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AuditList, ROLE_LABEL, RoleBadge, StatusBadge } from "@/components/admin-ui";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { useSession } from "@/components/session";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatMinutes, formatRelative } from "@/lib/format";
import type { AdminUserDetail, Role } from "@/lib/types";

// Server error codes, explained in plain words.
const CODE_MESSAGES: Record<string, string> = {
  SELF_LOCKOUT: "You can't do that to your own account. Ask another admin.",
  LAST_ADMIN: "This is the last active admin. Promote someone else to admin first.",
  MUST_DEACTIVATE_FIRST: "Deactivate the account before deleting it permanently.",
  ALREADY_VERIFIED: "This email is already verified.",
};

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const user = useQuery({ queryKey: ["admin", "user", id], queryFn: () => api<AdminUserDetail>("GET", `/admin/users/${id}`).then((r) => r.data) });

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All users
      </Link>
      {user.isPending ? (
        <LoadingBlock label="Loading account…" lines={6} />
      ) : user.isError ? (
        <ErrorState
          title={user.error instanceof ApiError && user.error.status === 404 ? "User not found" : "We couldn't load this account"}
          error={user.error}
          onRetry={() => void user.refetch()}
        />
      ) : (
        <UserDetail u={user.data} />
      )}
    </div>
  );
}

type Notice = { tone: "success" | "error"; text: string } | null;

function UserDetail({ u }: { u: AdminUserDetail }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { user: me } = useSession();
  const isSelf = me?.id === u.id;
  const [role, setRole] = useState<Role>(u.role);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  useEffect(() => setRole(u.role), [u.role]);

  const run = async (fn: () => Promise<{ message?: string }>, fallback: string) => {
    setNotice(null);
    try {
      const r = await fn();
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setNotice({ tone: "success", text: r.message ?? fallback });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setNotice({ tone: "error", text: (code && CODE_MESSAGES[code]) || (err instanceof ApiError ? err.message : "That didn't work. Please try again.") });
      setRole(u.role);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={u.role} />
          <StatusBadge isActive={u.isActive} isEmailVerified={u.isEmailVerified} />
          {isSelf && <span className="text-sm text-muted-foreground">(this is you)</span>}
        </div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{u.firstName} {u.lastName}</h1>
        <p className="text-muted-foreground">{u.email} · @{u.username}</p>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Study time" value={u.study.totalMinutes} format={(n) => formatMinutes(Math.round(n))} />
        <MiniStat label="Completed sessions" value={u.study.sessions.completed} />
        <MiniStat label="Quiz attempts" value={u.activity.quizAttempts} />
        <MiniStat label="Reviews waiting" value={u.study.pendingRevisions} />
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Account</h2></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Joined" value={formatDateTime(u.createdAt)} />
              <Row label="Email verified" value={u.emailVerifiedAt ? formatDateTime(u.emailVerifiedAt) : u.isEmailVerified ? "Yes" : "Not yet"} />
              <Row label="Last sign-in" value={u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"} />
              <Row label="Active sessions" value={String(u.security.activeSessions)} />
              <Row label="Time zone" value={u.preferences?.timezone ?? "—"} />
              <Row label="Daily goal" value={u.preferences ? `${u.preferences.dailyStudyGoalMinutes} min` : "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Role</h2></CardHeader>
          <CardContent className="space-y-4">
            <Field id="role" label="Role" hint={isSelf ? "You can't change your own role." : "Changing a role signs the user out of existing sessions."}>
              {(p) => (
                <Select {...p} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
                  {(["STUDENT", "INSTRUCTOR", "ADMIN"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              )}
            </Field>
            <ConfirmDialog
              disabled={isSelf || role === u.role}
              trigger={<Button className="gap-2" disabled={isSelf || role === u.role}><ShieldCheck aria-hidden="true" className="h-4 w-4" />Save role</Button>}
              title={`Change role to ${ROLE_LABEL[role]}?`}
              description={<><strong>{u.email}</strong> will go from {ROLE_LABEL[u.role]} to {ROLE_LABEL[role]}.{role === "ADMIN" && " Admins can manage every account, including other admins."} This is recorded in the audit log.</>}
              confirmLabel="Change role"
              onConfirm={() => run(() => api("PATCH", `/admin/users/${u.id}/role`, { role }), `Role changed to ${ROLE_LABEL[role]}.`)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Account status</h2></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {u.isActive
                ? "Deactivating signs the user out everywhere and blocks sign-in. Their data is kept, and you can reactivate them later."
                : "This account can't sign in. Reactivating restores access with their existing password."}
            </p>
            {isSelf && <p className="text-sm text-muted-foreground">You can&apos;t deactivate your own account.</p>}
            {u.isActive ? (
              <ConfirmDialog
                disabled={isSelf}
                trigger={<Button variant="destructive" className="gap-2" disabled={isSelf}><UserX aria-hidden="true" className="h-4 w-4" />Deactivate account</Button>}
                title="Deactivate this account?"
                description={<><strong>{u.email}</strong> will be signed out immediately and won&apos;t be able to sign in until reactivated.</>}
                confirmLabel="Deactivate"
                destructive
                onConfirm={() => run(() => api("PATCH", `/admin/users/${u.id}/status`, { isActive: false }), "Account deactivated.")}
              />
            ) : (
              <ConfirmDialog
                trigger={<Button className="gap-2"><UserCheck aria-hidden="true" className="h-4 w-4" />Reactivate account</Button>}
                title="Reactivate this account?"
                description={<><strong>{u.email}</strong> will be able to sign in again.</>}
                confirmLabel="Reactivate"
                onConfirm={() => run(() => api("PATCH", `/admin/users/${u.id}/status`, { isActive: true }), "Account reactivated.")}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="font-display text-lg font-semibold">Security &amp; access</h2>
          <p className="text-sm text-muted-foreground">Every action here is recorded in the audit log.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ConfirmDialog
            disabled={u.security.activeSessions === 0}
            trigger={<Button variant="outline" className="gap-2" disabled={u.security.activeSessions === 0}><LogOut aria-hidden="true" className="h-4 w-4" />Sign out everywhere ({u.security.activeSessions})</Button>}
            title="Sign this account out everywhere?"
            description={<>Every active session for <strong>{u.email}</strong> ends now.{isSelf && " That includes this console session."}</>}
            confirmLabel="Sign out everywhere"
            onConfirm={() => run(() => api("POST", `/admin/users/${u.id}/revoke-sessions`), "Signed out everywhere.")}
          />
          <ConfirmDialog
            disabled={!u.isActive}
            trigger={<Button variant="outline" className="gap-2" disabled={!u.isActive}><KeyRound aria-hidden="true" className="h-4 w-4" />Send password reset link</Button>}
            title="Send a password reset link?"
            description={<>A single-use link (valid 1 hour) goes to <strong>{u.email}</strong>. Their password doesn&apos;t change unless they use it.</>}
            confirmLabel="Send link"
            onConfirm={() => run(() => api("POST", `/admin/users/${u.id}/send-password-reset`), "Password reset link sent.")}
          />
          {!u.isEmailVerified && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => void run(() => api("POST", `/admin/users/${u.id}/send-verification`), "Verification link sent.")}>
                <MailPlus aria-hidden="true" className="h-4 w-4" />Resend verification link
              </Button>
              <ConfirmDialog
                trigger={<Button variant="outline" className="gap-2"><MailCheck aria-hidden="true" className="h-4 w-4" />Mark email as verified</Button>}
                title="Mark this email as verified without the link?"
                description={<>Only do this if you&apos;ve confirmed <strong>{u.email}</strong> belongs to this person some other way. It skips the owner&apos;s proof of the address.</>}
                confirmLabel="Mark verified"
                onConfirm={() => run(() => api("POST", `/admin/users/${u.id}/mark-verified`), "Email marked as verified.")}
              />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Study plans</h2></CardHeader>
          <CardContent>
            {u.study.plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No study plans yet.</p>
            ) : (
              <ul className="space-y-3">
                {u.study.plans.map((p) => (
                  <li key={p.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{p.title} <span className="font-normal text-muted-foreground">· {p.subject}</span></span>
                      <Badge tone={p.status === "ACTIVE" ? "primary" : "neutral"}>{p.status.toLowerCase()}</Badge>
                    </div>
                    <Progress value={p.completionPercentage} className="h-1.5" aria-label={`${p.title}: ${p.completionPercentage}% complete`} />
                    <p className="text-xs text-muted-foreground">{p.completedTopics} of {p.totalTopics} topics · updated {formatRelative(p.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><h2 className="font-display text-lg font-semibold">Recent quiz scores</h2></CardHeader>
          <CardContent>
            {u.study.recentQuizzes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quiz attempts yet.</p>
            ) : (
              <ul className="divide-y">
                {u.study.recentQuizzes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{q.title}</span>
                      <span className="block text-xs text-muted-foreground">{formatRelative(q.completedAt)} · {q.source === "AI" ? "AI-generated" : "sample set"}</span>
                    </span>
                    <span className="font-display text-lg font-bold tabular-nums">{Math.round(q.percentage)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="font-display text-lg font-semibold">Admin history for this account</h2>
        {u.history.length ? <AuditList entries={u.history} showTarget={false} /> : <EmptyState icon={ScrollText} title="No admin actions yet" />}
      </section>

      {!isSelf && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <h2 className="font-display text-lg font-semibold text-destructive">Danger zone</h2>
            <p className="text-sm text-muted-foreground">
              Permanent deletion removes the account and all its study data. It can&apos;t be undone.
              {u.isActive && " Deactivate the account first."}
            </p>
          </CardHeader>
          <CardContent>
            <ConfirmDialog
              disabled={u.isActive}
              trigger={<Button variant="destructive" className="gap-2" disabled={u.isActive}><Trash2 aria-hidden="true" className="h-4 w-4" />Delete permanently</Button>}
              title="Delete this account permanently?"
              description={
                <div className="space-y-3">
                  <p>This deletes <strong>{u.email}</strong> and every plan, session, quiz attempt and review that belongs to it.</p>
                  <Field id="confirm-email" label="Type the email address to confirm">
                    {(p) => <Input {...p} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />}
                  </Field>
                </div>
              }
              confirmLabel="Delete forever"
              destructive
              onConfirm={async () => {
                if (confirmEmail.trim().toLowerCase() !== u.email) {
                  setNotice({ tone: "error", text: "The email you typed doesn't match, so nothing was deleted." });
                  return;
                }
                try {
                  await api("DELETE", `/admin/users/${u.id}`);
                  await qc.invalidateQueries({ queryKey: ["admin"] });
                  router.replace("/admin/users");
                } catch (err) {
                  const code = err instanceof ApiError ? err.code : undefined;
                  setNotice({ tone: "error", text: (code && CODE_MESSAGES[code]) || "Couldn't delete the account." });
                }
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value, format }: { label: string; value: number; format?: (n: number) => string }) {
  return (
    <StaggerItem>
      <Card className="card-glow h-full">
        <CardContent className="space-y-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold"><AnimatedNumber value={value} format={format} /></p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
