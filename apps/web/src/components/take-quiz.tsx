"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Badge, ErrorState, LoadingBlock, SampleBadge, Spinner } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api";
import type { AttemptResult } from "@/lib/types";

interface QuizToTake {
  id: string;
  title: string;
  subject: string;
  source: "AI" | "SAMPLE_BANK";
  questions: { id: string; questionText: string; options: string[] }[];
}

/**
 * Takes any quiz the student may open (a sample set or an AI quiz generated for them). The browser
 * never has the answers: the server grades the attempt and returns explanations afterwards.
 */
export function TakeQuiz({ quizId, onExit, onAnotherQuiz }: { quizId: string; onExit: () => void; onAnotherQuiz?: () => void }) {
  const qc = useQueryClient();
  const quiz = useQuery({ queryKey: ["quiz", quizId], queryFn: () => api<QuizToTake>("GET", `/study/quizzes/${quizId}`).then((r) => r.data) });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(Date.now());
  const resultRef = useRef<HTMLDivElement>(null);

  if (quiz.isPending) return <LoadingBlock label="Loading questions…" lines={6} />;
  if (quiz.isError) return <ErrorState error={quiz.error} onRetry={() => void quiz.refetch()} />;

  const total = quiz.data.questions.length;
  const answered = Object.keys(answers).length;
  const label = quiz.data.source === "AI" ? <Badge tone="primary"><Sparkles aria-hidden="true" className="h-3 w-3" />AI-generated</Badge> : <SampleBadge>Sample set</SampleBadge>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const r = await api<AttemptResult>("POST", `/study/quizzes/${quizId}/attempts`, {
        answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        timeTakenSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
      setResult(r.data);
      await Promise.all([qc.invalidateQueries({ queryKey: ["attempts"] }), qc.invalidateQueries({ queryKey: ["overview"] })]);
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit. Your answers are still here; try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Card className="card-glow">
        <CardContent className="space-y-5 p-6">
          <div ref={resultRef} tabIndex={-1} className="space-y-1 focus:outline-none">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">{result.title}: your result</h2>
              {label}
            </div>
            <p className="font-display text-4xl font-bold tabular-nums">{result.score} / {result.maxScore}</p>
            <p className="text-muted-foreground">{Math.round(result.percentage)}% · graded by the server and saved to your history</p>
          </div>
          <ol className="space-y-4">
            {result.results.map((r, i) => (
              <li key={r.questionId} className="space-y-1 rounded-md border p-4">
                <p className="flex items-start gap-2 font-medium">
                  {r.isCorrect ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                  <span>{i + 1}. {r.questionText} <span className="sr-only">{r.isCorrect ? "Correct." : "Incorrect."}</span></span>
                </p>
                <p className="text-sm">Your answer: <strong>{r.yourAnswer ?? "not answered"}</strong></p>
                {!r.isCorrect && <p className="text-sm">Correct answer: <strong>{r.correctAnswer}</strong></p>}
                {r.explanation && <p className="text-sm text-muted-foreground">{r.explanation}</p>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setResult(null); setAnswers({}); startedAt.current = Date.now(); }}>Retake this quiz</Button>
            {onAnotherQuiz && <Button variant="outline" onClick={onAnotherQuiz}>New quiz on this topic</Button>}
            <Button variant="ghost" onClick={onExit}>Done</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-glow">
      <CardContent className="p-6">
        <form onSubmit={(e) => void submit(e)} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">{quiz.data.title}</h2>
              {label}
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">{answered} of {total} answered</p>
          </div>
          {quiz.data.questions.map((q, qi) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="font-medium">{qi + 1}. {q.questionText}</legend>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => {
                  const id = `${q.id}-${oi}`;
                  const checked = answers[q.id] === opt;
                  return (
                    <label
                      key={id}
                      htmlFor={id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${checked ? "border-primary bg-accent" : "hover:bg-accent"}`}
                    >
                      <input id={id} type="radio" name={q.id} value={opt} checked={checked} onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {error && <Alert tone="error">{error}</Alert>}
          {answered < total && <p className="text-sm text-muted-foreground">Unanswered questions count as incorrect.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting || answered === 0} className="gap-2">
              {submitting ? <Spinner /> : <BookOpen aria-hidden="true" className="h-4 w-4" />}Submit answers
            </Button>
            <Button type="button" variant="outline" onClick={onExit} disabled={submitting}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
