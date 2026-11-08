"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry, Role } from "@/lib/types";

export const ROLE_LABEL: Record<Role, string> = { STUDENT: "Student", INSTRUCTOR: "Instructor", ADMIN: "Admin" };

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={role === "ADMIN" ? "warning" : role === "INSTRUCTOR" ? "primary" : "neutral"}>{ROLE_LABEL[role]}</Badge>;
}

export function StatusBadge({ isActive, isEmailVerified }: { isActive: boolean; isEmailVerified: boolean }) {
  if (!isActive) return <Badge tone="danger">Deactivated</Badge>;
  if (!isEmailVerified) return <Badge tone="neutral">Unverified email</Badge>;
  return <Badge tone="success">Active</Badge>;
}

function describe(e: AuditEntry): string {
  switch (e.action) {
    case "USER_ROLE_CHANGED":
      return e.changes?.role ? `changed role from ${ROLE_LABEL[e.changes.role.from]} to ${ROLE_LABEL[e.changes.role.to]}` : "changed role";
    case "USER_DEACTIVATED":
      return "deactivated the account";
    case "USER_REACTIVATED":
      return "reactivated the account";
    case "USER_DELETED":
      return "permanently deleted the account";
    case "ADMIN_BOOTSTRAPPED":
      return "made this account the first admin";
    case "ADMIN_SIGNED_IN":
      return "signed in to the admin console";
    case "USER_DATA_VIEWED":
      return "viewed the account details";
    case "SESSIONS_REVOKED":
      return "signed the account out everywhere";
    case "PASSWORD_RESET_SENT":
      return "sent a password reset link";
    case "VERIFICATION_SENT":
      return "sent a verification link";
    case "EMAIL_VERIFIED_BY_ADMIN":
      return "marked the email as verified";
    default:
      return e.action;
  }
}

export function AuditList({ entries, showTarget = true }: { entries: AuditEntry[]; showTarget?: boolean }) {
  return (
    <ul className="divide-y rounded-md border">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-medium">{e.actor.email ?? e.actor.label ?? "A deleted admin account"}</span> {describe(e)}
            {showTarget && e.target && e.target.id !== e.actor.id && (
              <>
                {" for "}
                {e.target.email ? (
                  <Link href={`/admin/users/${e.target.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{e.target.email}</Link>
                ) : (
                  <span className="text-muted-foreground">a deleted account</span>
                )}
              </>
            )}
          </p>
          <time dateTime={e.createdAt} className="shrink-0 text-muted-foreground">{formatDateTime(e.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}
