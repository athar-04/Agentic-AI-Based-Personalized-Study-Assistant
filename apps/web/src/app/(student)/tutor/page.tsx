"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/feedback";
import { useServiceStatus } from "@/components/session";
import { TutorChat } from "@/components/tutor-chat";

function TutorContent() {
  const { status, recheck } = useServiceStatus();
  const params = useSearchParams();
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">AI tutor</h1>
        <p className="hidden text-muted-foreground sm:block">Ask questions about what you&apos;re studying. Answers come from an AI model; check anything important.</p>
      </div>
      {!status ? (
        <LoadingBlock label="Checking the AI service…" lines={2} />
      ) : status.ai.available ? (
        <TutorChat initialTopicId={params.get("topicId") ?? ""} />
      ) : (
        <>
          <Alert tone="info" title="The AI tutor isn't connected yet">
            Whoever runs this server needs to add an AI provider key (see <code>scripts/dev/ai.env.example</code>) and restart. No answers
            are invented in the meantime.
          </Alert>
          <EmptyState icon={Brain} title="Tutor unavailable" action={<Button variant="outline" onClick={recheck}>Check again</Button>}>
            Practice sets and your revision queue work without it.
          </EmptyState>
        </>
      )}
    </div>
  );
}

export default function TutorPage() {
  return (
    <Suspense>
      <TutorContent />
    </Suspense>
  );
}
