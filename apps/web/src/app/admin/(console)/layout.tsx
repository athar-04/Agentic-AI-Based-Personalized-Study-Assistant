"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ArrowLeft, LayoutDashboard, ScrollText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, LoadingBlock } from "@/components/ui/feedback";
import { useSession } from "@/components/session";
import { Shell, type NavItem } from "@/components/app-shell";

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/traffic", label: "Traffic", icon: Activity },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

/**
 * Only an admin-scoped session (from /admin/login) of an ADMIN account sees any of the console;
 * everyone else is sent to the admin sign-in without the console ever rendering. This is UX only:
 * every /admin API call is authorised on the server against the stored role and session scope.
 */
export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status, user, scope, error, retry } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = status === "authenticated" && user?.role === "ADMIN" && scope === "admin";
  // Distinguishes "just signed out" (show a confirmation) from "never had access".
  const wasAllowed = useRef(false);
  if (allowed) wasAllowed.current = true;

  useEffect(() => {
    if (status === "anonymous" && wasAllowed.current) {
      router.replace("/admin/login?signedOut=1");
    } else if (status === "anonymous" || (status === "authenticated" && !allowed)) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, allowed, router, pathname]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState title="We couldn't restore your session" error={error} onRetry={retry} />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <LoadingBlock label="Checking admin access…" />
      </div>
    );
  }

  return (
    <Shell
      nav={ADMIN_NAV}
      brandHref="/admin"
      brandLabel="Agentic Study"
      signOutTo="/admin/login?signedOut=1"
      badge={<Badge tone="warning" className="hidden sm:inline-flex">Admin console</Badge>}
      extraLinks={
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Student app</span>
          </Link>
        </Button>
      }
    >
      {children}
    </Shell>
  );
}
