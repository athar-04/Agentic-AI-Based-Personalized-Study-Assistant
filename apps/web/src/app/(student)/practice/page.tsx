"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, ErrorState, LoadingBlock, PageHeader, SampleBadge, Spinner } from "@/components/ui/feedback";
import { useServiceStatus } from "@/components/session";
import { TopicSelect, useMyTopics } from "@/components/topic-picker";
import { TakeQuiz } from "@/components/take-quiz";
import { HoverLift, Stagger, StaggerItem } from "@/components/motion";
import { ApiError, api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { PracticeSet, QuizAttemptSummary } from "@/lib/types";

type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
interface QuizRequest {
  topicId?: string;
  topic?: string;
  difficulty: Difficulty;
  questionCount: number;
}

function PracticeContent() {
  const params = useSearchParams();
  const [activeQuiz, setActiveQuiz] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<QuizRequest | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [anotherError, setAnotherError] = useState("");
  const sets = useQuery({ queryKey: ["practice-sets"], queryFn: () => api<PracticeSet[]>("GET", "/study/quizzes/sample").then((r) => r.data) });
  const attempts = useQuery({ queryKey: ["attempts"], queryFn: () => api<QuizAttemptSummary[]>("GET", "/study/quizzes/attempts?limit=10").then((r) => r.data) });

  const another = async () => {
    if (!lastRequest) return;
    setRegenerating(true);
    setAnotherError("");
    try {
      const r = await api<{ id: string }>("POST", "/study/ai/quiz", lastRequest);
      setActiveQuiz(r.data.id);
    } catch (err) {
      setAnotherError(err instanceof ApiError ? err.message : "Couldn't create a new quiz. Please try again.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Practice" description="Quiz yourself on what you're studying. Answers are graded on the server and saved to your dashboard." />

      {anotherError && <Alert tone="error">{anotherError}</Alert>}
      {activeQuiz ? (
        regenerating ? (
          <LoadingBlock label="Writing a fresh quiz…" lines={6} />
        ) : (
          <TakeQuiz key={activeQuiz} quizId={activeQuiz} onExit={() => setActiveQuiz(null)} onAnotherQuiz={lastRequest ? () => void another() : undefined} />
        )
      ) : (
        <>
          <TopicQuizGenerator
            initialTopicId={params.get("topicId") ?? ""}
            onReady={(id, req) => {
              setLastRequest(req);
              setActiveQuiz(id);
            }}
          />

          <section aria-labelledby="sets-heading" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="sets-heading" className="font-display text-xl font-semibold">Sample practice sets</h2>
              <SampleBadge>Hand-written starter questions · not AI-generated</SampleBadge>
            </div>
            {sets.isPending ? (
              <LoadingBlock label="Loading practice sets…" />
            ) : sets.isError ? (
              <ErrorState error={sets.error} onRetry={() => void sets.refetch()} />
            ) : (
              <Stagger as="ul" className="grid gap-4 md:grid-cols-3">
                {sets.data.map((s) => (
                  <StaggerItem as="li" key={s.id}>
                    <HoverLift className="h-full">
                      <Card className="card-glow flex h-full flex-col">
                        <CardHeader className="pb-2">
                          <h3 className="font-semibold">{s.title}</h3>
                          <p className="text-sm text-muted-foreground">{s.subject} · {s.questionCount} questions</p>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col justify-between gap-4">
                          <p className="text-sm text-muted-foreground">{s.description}</p>
                          <Button variant="outline" onClick={() => { setLastRequest(null); setActiveQuiz(s.id); }} className="w-full">
                            Start<span className="sr-only"> {s.title}</span>
                          </Button>
                        </CardContent>
                      </Card>
                    </HoverLift>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="font-display text-xl font-semibold">Your recent attempts</h2>
        {attempts.isPending ? (
          <LoadingBlock lines={2} />
        ) : attempts.isError ? (
          <ErrorState error={attempts.error} onRetry={() => void attempts.refetch()} />
        ) : attempts.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attempts yet. Finish a quiz and your score will appear here.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {attempts.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(a.completedAt)} · {a.source === "AI" ? "AI-generated" : "sample set"}</p>
                </div>
                <span className="font-display text-lg font-bold tabular-nums">{Math.round(a.percentage)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TopicQuizGenerator({ initialTopicId, onReady }: { initialTopicId: string; onReady: (id: string, req: QuizRequest) => void }) {
  const { status } = useServiceStatus();
  const myTopics = useMyTopics();
  const [topicId, setTopicId] = useState(initialTopicId);
  const [custom, setCustom] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasTopics = Boolean(myTopics.data?.topics.length);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const req: QuizRequest = {
      difficulty,
      questionCount: Number(count),
      ...(topicId ? { topicId } : custom.trim() ? { topic: custom.trim() } : {}),
    };
    if (!req.topicId && !req.topic) {
      setError("Choose one of your topics or type a topic.");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string }>("POST", "/study/ai/quiz", req);
      onReady(r.data.id, req);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the quiz. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ai-quiz-heading">
      <Card className="card-glow overflow-hidden">
        <div aria-hidden="true" className="h-1 bg-primary" />
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ai-quiz-heading" className="font-display text-xl font-semibold">Quiz me on a topic</h2>
            <Badge tone="primary"><Sparkles aria-hidden="true" className="h-3 w-3" />AI-generated</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Fresh multiple-choice questions on the topic you choose, with explanations after you submit.</p>
        </CardHeader>
        <CardContent>
          {!status ? (
            <LoadingBlock lines={1} />
          ) : !status.ai.available ? (
            <Alert tone="info" title="AI quizzes aren't connected yet">
              Whoever runs this server needs to add an AI provider key. The sample sets below work without it.
            </Alert>
          ) : (
            <form onSubmit={(e) => void generate(e)} className="space-y-4">
              {error && <Alert tone="error">{error}</Alert>}
              <div className="grid gap-4 md:grid-cols-2">
                {hasTopics ? (
                  <Field id="quiz-topic" label="One of your topics" hint="From your study plans.">
                    {(p) => <TopicSelect {...p} value={topicId} onChange={(v) => { setTopicId(v); if (v) setCustom(""); }} plans={myTopics.data!.plans} emptyLabel="Choose a topic…" />}
                  </Field>
                ) : (
                  <p className="self-end text-sm text-muted-foreground">
                    <Link href="/plans" className="font-medium text-primary underline-offset-4 hover:underline">Add topics to a plan</Link> to be quizzed on exactly what you study.
                  </p>
                )}
                <Field id="quiz-custom" label={hasTopics ? "Or type any topic" : "Topic"}>
                  {(p) => <Input {...p} value={custom} maxLength={120} placeholder="e.g. Newton's laws of motion" onChange={(e) => { setCustom(e.target.value); if (e.target.value) setTopicId(""); }} />}
                </Field>
                <Field id="quiz-difficulty" label="Difficulty">
                  {(p) => (
                    <Select {...p} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="ADVANCED">Advanced</option>
                      <option value="EXPERT">Expert</option>
                    </Select>
                  )}
                </Field>
                <Field id="quiz-count" label="Questions">
                  {(p) => (
                    <Select {...p} value={count} onChange={(e) => setCount(e.target.value)}>
                      {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Spinner /> : <Wand2 aria-hidden="true" className="h-4 w-4" />}
                {busy ? "Writing your quiz…" : "Generate quiz"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function PracticePage() {
  return (
    <Suspense>
      <PracticeContent />
    </Suspense>
  );
}
