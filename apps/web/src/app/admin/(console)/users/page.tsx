"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/feedback";
import { RoleBadge, StatusBadge } from "@/components/admin-ui";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/format";
import type { AdminUser, PageMeta } from "@/lib/types";

const PAGE_SIZE = 20;

function UsersList() {
  const params = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(params.get("role") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(1);

  // Debounced: one request after typing pauses, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) query.set("search", search);
  if (role) query.set("role", role);
  if (status) query.set("status", status);

  const users = useQuery({
    queryKey: ["admin", "users", query.toString()],
    queryFn: () => api<AdminUser[]>("GET", `/admin/users?${query.toString()}`).then((r) => ({ rows: r.data, meta: r.meta as PageMeta })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Search accounts, then open one to change its role or status." />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_12rem_12rem]">
          <Field id="user-search" label="Search">
            {(p) => (
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input {...p} type="search" className="pl-9" placeholder="Name, username or email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} maxLength={100} />
              </div>
            )}
          </Field>
          <Field id="role-filter" label="Role">
            {(p) => (
              <Select {...p} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
                <option value="">All roles</option>
                <option value="STUDENT">Students</option>
                <option value="INSTRUCTOR">Instructors</option>
                <option value="ADMIN">Admins</option>
              </Select>
            )}
          </Field>
          <Field id="status-filter" label="Status">
            {(p) => (
              <Select {...p} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
                <option value="unverified">Email not verified</option>
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      {users.isPending ? (
        <LoadingBlock label="Loading users…" lines={6} />
      ) : users.isError ? (
        <ErrorState title="We couldn't load users" error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.rows.length === 0 ? (
        <EmptyState icon={UserSearch} title="No users match">Try a different search or clear the filters.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {users.data.meta.total} account{users.data.meta.total === 1 ? "" : "s"}
            {users.isFetching && " · updating…"}
          </p>
          {/* Phones: one card per account instead of a sideways-scrolling table. */}
          <ul className="space-y-3 sm:hidden">
            {users.data.rows.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="card-glow block space-y-2 rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-primary">{u.firstName} {u.lastName}</p>
                      <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <StatusBadge isActive={u.isActive} isEmailVerified={u.isEmailVerified} />
                    <span>Last sign-in: {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "never"}</span>
                    <span>Joined {formatDate(u.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border sm:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Users, page {users.data.meta.page} of {users.data.meta.totalPages}</caption>
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last sign-in</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.data.rows.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {u.firstName} {u.lastName}
                      </Link>
                      <div className="text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3"><StatusBadge isActive={u.isActive} isEmailVerified={u.isEmailVerified} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={!users.data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {users.data.meta.page} of {Math.max(1, users.data.meta.totalPages)}</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={!users.data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next<ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense>
      <UsersList />
    </Suspense>
  );
}
