"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Brain,
  CalendarCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { RequireSession, useSession } from "@/components/session";
import { PageTransition } from "@/components/motion";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/plans", label: "Study plans", icon: CalendarCheck },
  { href: "/practice", label: "Practice", icon: BookOpen },
  { href: "/revision", label: "Revision", icon: RotateCcw },
  { href: "/tutor", label: "AI tutor", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun aria-hidden="true" className="h-5 w-5" /> : <Moon aria-hidden="true" className="h-5 w-5" />}
    </Button>
  );
}

function NavLinks({ items, onNavigate, layoutGroup }: { items: NavItem[]; onNavigate?: () => void; layoutGroup: string }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "relative isolate flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                active ? "text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              {/* The highlight glides between items instead of jumping. */}
              {active && (
                <motion.span
                  layoutId={`nav-pill-${layoutGroup}`}
                  className="absolute inset-0 -z-10 rounded-md bg-accent"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon aria-hidden="true" className="h-4 w-4" />
              {/* Icon-only between lg and xl so the header never overflows; the name stays for screen readers. */}
              <span className="lg:sr-only xl:not-sr-only">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Shared frame for the student app and the admin console. */
export function Shell({
  nav,
  brandHref,
  brandLabel,
  badge,
  extraLinks,
  signOutTo = "/auth/login?signedOut=1",
  children,
}: {
  nav: NavItem[];
  brandHref: string;
  brandLabel: string;
  badge?: React.ReactNode;
  extraLinks?: React.ReactNode;
  signOutTo?: string;
  children: React.ReactNode;
}) {
  const { user, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const mainRef = React.useRef<HTMLElement>(null);

  // On navigation (not first load), close the mobile menu and move focus to the new page's
  // content so screen-reader users hear the page that just opened.
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.replace(signOutTo);
  };

  return (
    <div className="app-aurora min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href={brandHref} className="flex min-h-11 items-center gap-2 rounded-md font-display text-lg font-bold">
            <GraduationCap aria-hidden="true" className="h-7 w-7 text-primary" />
            <span>{brandLabel}</span>
          </Link>
          {badge}
          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <NavLinks items={nav} layoutGroup="desktop" />
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {extraLinks}
            <ThemeToggle />
            <span className="hidden max-w-[12rem] truncate px-2 text-sm text-muted-foreground xl:inline" title={user?.email}>
              {user?.firstName} {user?.lastName}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()} className="hidden gap-2 sm:inline-flex">
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Sign out
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Main" className="border-t px-4 py-3 lg:hidden">
            <NavLinks items={nav} onNavigate={() => setMenuOpen(false)} layoutGroup="mobile" />
            <Button variant="ghost" className="mt-2 w-full justify-start gap-2 sm:hidden" onClick={() => void handleSignOut()}>
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Sign out
            </Button>
          </nav>
        )}
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-6 focus:outline-none sm:px-6 sm:pt-8 lg:pb-8">
        <PageTransition routeKey={pathname}>{children}</PageTransition>
      </main>
      <MobileTabBar items={nav.slice(0, 5)} />
    </div>
  );
}

/**
 * Phones: the main sections as a bottom tab bar, reachable with one thumb. Anything beyond five
 * items (and sign-out) stays in the menu. Hidden from large screens, which have the top nav.
 */
function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length < 2) return null;
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon aria-hidden="true" className="h-5 w-5" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <StudentFrame>{children}</StudentFrame>
    </RequireSession>
  );
}

function StudentFrame({ children }: { children: React.ReactNode }) {
  const { user, scope } = useSession();
  return (
    <Shell
      nav={STUDENT_NAV}
      brandHref="/dashboard"
      brandLabel="Agentic Study"
      extraLinks={
        user?.role === "ADMIN" ? (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={scope === "admin" ? "/admin" : "/admin/login"}>
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Admin console</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          </Button>
        ) : null
      }
    >
      {children}
    </Shell>
  );
}
