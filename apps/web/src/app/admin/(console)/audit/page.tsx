"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/feedback";
import { AuditList } from "@/components/admin-ui";
import { api } from "@/lib/api";
import type { AuditEntry, PageMeta } from "@/lib/types";

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const log = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () => api<AuditEntry[]>("GET", `/admin/audit-log?page=${page}&limit=25`).then((r) => ({ rows: r.data, meta: r.meta as PageMeta })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every role change, deactivation and reactivation. Entries record who acted, on whom, and the changed field only."
      />
      {log.isPending ? (
        <LoadingBlock label="Loading audit log…" lines={6} />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : log.data.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No admin actions yet">Changes made in the admin console will appear here.</EmptyState>
      ) : (
        <>
          <AuditList entries={log.data.rows} />
          <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={!log.data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />Newer
            </Button>
            <span className="text-sm text-muted-foreground">Page {log.data.meta.page} of {Math.max(1, log.data.meta.totalPages)}</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={!log.data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Older<ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
