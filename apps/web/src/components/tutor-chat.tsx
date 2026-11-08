"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, RotateCcw, Send, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { TopicSelect, useMyTopics } from "@/components/topic-picker";
import { EASE_OUT } from "@/components/motion";
import { RichText } from "@/components/rich-text";
import { ApiError, apiStream } from "@/lib/api";

interface Message {
  role: "user" | "assistant" | "error";
  text: string;
}

const SUGGESTIONS = [
  "Explain this topic like I'm new to it",
  "Give me a worked example",
  "What are the common mistakes here?",
  "Summarise the key points in 5 bullets",
];

/**
 * Chat with the AI tutor. The conversation so far is sent with each question (last 10 turns) so
 * follow-ups make sense; choosing one of your topics tells the tutor what you're studying.
 */
export function TutorChat({ initialTopicId = "" }: { initialTopicId?: string }) {
  const myTopics = useMyTopics();
  const [topicId, setTopicId] = useState(initialTopicId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // While an answer streams in, follow it without restarting a smooth scroll on every piece.
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: loading ? "auto" : "smooth" });
  }, [messages, loading]);

  const topicTitle = myTopics.data?.topics.find((t) => t.id === topicId)?.title;

  const ask = async (question: string) => {
    const message = question.trim();
    if (!message || loading) return;
    const history = messages
      .filter((m): m is Message & { role: "user" | "assistant" } => m.role !== "error")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.text }));
    setInput("");
    setLastQuestion(message);
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setLoading(true);
    // The answer is shown as it's written: the first piece adds the tutor's bubble, later pieces extend it.
    let started = false;
    let failure: string | null = null;
    try {
      await apiStream("/study/ai/tutor/stream", { message, history, ...(topicId ? { topicId } : {}) }, (ev) => {
        if (typeof ev.delta === "string") {
          const piece = ev.delta;
          if (!started) {
            started = true;
            setMessages((prev) => [...prev, { role: "assistant", text: piece }]);
          } else {
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, text: last.text + piece };
              return next;
            });
          }
        } else if (ev.error && typeof ev.error === "object") {
          const said = (ev.error as { message?: unknown }).message;
          failure = typeof said === "string" && said ? said : "The tutor couldn't answer. Please try again.";
        }
      });
      if (!started && !failure) failure = "The tutor couldn't answer. Please try again.";
    } catch (err) {
      failure = err instanceof ApiError ? err.message : "The tutor couldn't answer. Please try again.";
    }
    if (failure) {
      const text = started ? `The answer stopped partway. ${failure}` : failure;
      setMessages((prev) => [...prev, { role: "error", text }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const retry = () => {
    // Drop the failed exchange (question, any partial answer, the error) and ask again.
    setMessages((prev) => {
      let i = prev.length;
      while (i > 0 && prev[i - 1].role !== "user") i--;
      return prev.slice(0, Math.max(0, i - 1));
    });
    void ask(lastQuestion);
  };

  // The thinking dots show only until the first words arrive.
  const waiting = loading && messages[messages.length - 1]?.role === "user";

  return (
    // Phones: fill the screen between the header and the tab bar so the message box is always visible.
    <Card className="card-glow flex h-[calc(100dvh-14.5rem)] min-h-[420px] flex-col sm:h-[min(78dvh,720px)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Brain aria-hidden="true" className="h-5 w-5 text-primary" />
            <span className="sr-only">Conversation</span>
            <Badge>AI answers · double-check important facts</Badge>
          </h2>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setMessages([])} disabled={loading}>
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />New chat
            </Button>
          )}
        </div>
        {myTopics.data && myTopics.data.topics.length > 0 && (
          <Field id="tutor-topic" label="I'm studying (optional)">
            {(p) => <TopicSelect {...p} value={topicId} onChange={setTopicId} plans={myTopics.data.plans} emptyLabel="Nothing specific" />}
          </Field>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-label="Conversation with the AI tutor">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Sparkles aria-hidden="true" className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold">Ask anything you&apos;re studying</p>
                <p className="text-sm text-muted-foreground">{topicTitle ? `Answers will relate to "${topicTitle}".` : "Pick a topic above for answers tailored to your plan."}</p>
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(topicTitle ? `${s}: ${topicTitle}` : s)}
                    className="min-h-10 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-accent-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "assistant" ? "" : "whitespace-pre-wrap"} ${
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : m.role === "error"
                        ? "border border-destructive/50 bg-destructive/10"
                        : "rounded-bl-md bg-accent text-accent-foreground"
                  }`}
                >
                  <span className="sr-only">{m.role === "user" ? "You: " : m.role === "error" ? "Error: " : "Tutor: "}</span>
                  {m.role === "assistant" ? <RichText text={m.text} /> : m.text}
                  {m.role === "error" && i === messages.length - 1 && (
                    <div className="pt-2">
                      <Button size="sm" variant="outline" onClick={retry}>Try again</Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {waiting && (
            <div className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground" role="status">
              <span className="sr-only">The tutor is thinking…</span>
              {[0, 1, 2].map((d) => (
                <span key={d} aria-hidden="true" className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d * 120}ms` }} />
              ))}
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="tutor-input" className="sr-only">Ask the tutor a question</label>
          <textarea
            id="tutor-input"
            ref={inputRef}
            value={input}
            rows={1}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={topicTitle ? `Ask about ${topicTitle}…` : "Ask a question…"}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="gap-2">
            <Send aria-hidden="true" className="h-4 w-4" />
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
