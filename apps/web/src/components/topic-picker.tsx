"use client";

import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { StudyPlan } from "@/lib/types";

export interface TopicOption {
  id: string;
  title: string;
  planTitle: string;
  subject: string;
}

/** The student's own plan topics, for "quiz me on…" and "I'm studying…". */
export function useMyTopics() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: () => api<StudyPlan[]>("GET", "/study/plans?limit=50").then((r) => r.data),
    select: (plans): { plans: StudyPlan[]; topics: TopicOption[] } => ({
      plans,
      topics: plans.flatMap((p) => p.topics.map((t) => ({ id: t.id, title: t.title, planTitle: p.title, subject: p.subject }))),
    }),
  });
}

/** Native select grouped by plan: keyboard and screen-reader friendly out of the box. */
export function TopicSelect({
  value,
  onChange,
  plans,
  emptyLabel,
  ...props
}: {
  value: string;
  onChange: (id: string) => void;
  plans: StudyPlan[];
  emptyLabel: string;
  id: string;
  "aria-describedby"?: string;
}) {
  return (
    <Select {...props} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {plans
        .filter((p) => p.topics.length)
        .map((p) => (
          <optgroup key={p.id} label={`${p.title} (${p.subject})`}>
            {p.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.isCompleted ? " ✓" : ""}
              </option>
            ))}
          </optgroup>
        ))}
    </Select>
  );
}
