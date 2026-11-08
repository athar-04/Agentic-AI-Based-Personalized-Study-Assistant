"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Calendar, ChartBar, RotateCcw, BookOpen, GraduationCap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { StudyScene } from "@/components/three/lazy-scene";

const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav aria-label="Main" className="sticky top-0 z-50 flex items-center justify-between border-b bg-background/95 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold font-display">Agentic Study</span>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Button asChild size="sm"><Link href="/auth/login">Log in</Link></Button>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
          <Link href="#how-it-works" className="hover:text-primary transition-colors">How it works</Link>
          <Button asChild variant="outline">
            <Link href="/auth/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/register">Start free</Link>
          </Button>
        </div>
      </nav>

      <main id="main">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pb-16 pt-12 lg:pb-24 lg:pt-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50rem_30rem_at_15%_10%,hsl(var(--primary)/0.14),transparent_60%),radial-gradient(40rem_26rem_at_90%_20%,hsl(var(--warning)/0.10),transparent_60%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }} className="text-center lg:text-left">
            <motion.p variants={heroItem} className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-sm font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              Plans, practice and spaced repetition in one place
            </motion.p>
            <motion.h1 variants={heroItem} className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl xl:text-7xl">
              Study with a <em className="marker font-medium italic text-primary">clear plan</em>, not a guess
            </motion.h1>
            <motion.p variants={heroItem} className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground lg:mx-0 lg:text-xl">
              Break subjects into topics, schedule focused sessions, practise with quizzes and let reviews come back right before you&apos;d forget.
            </motion.p>
            <motion.div variants={heroItem} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button asChild size="lg" className="px-8 text-lg">
                <Link href="/auth/register">Create a free account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8 text-lg">
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <StudyScene className="h-[340px] sm:h-[420px] lg:h-[500px]" />
            <p className="mt-2 text-center text-xs text-muted-foreground">Move your pointer to light it · click or tap to change the mood · drag to spin</p>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-muted/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16 font-display">Everything you need to study well</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Calendar className="h-6 w-6" />}
              title="Study plans and sessions"
              description="Break a subject into topics, schedule sessions, and track the minutes you actually study."
            />
            <FeatureCard
              icon={<RotateCcw className="h-6 w-6" />}
              title="Spaced repetition"
              description="Completed topics come back for review on an SM-2 schedule, based on how well you remembered them."
            />
            <FeatureCard
              icon={<BookOpen className="h-6 w-6" />}
              title="Practice quizzes"
              description="Answer practice sets graded on the server, with explanations, and see your scores over time."
            />
            <FeatureCard
              icon={<ChartBar className="h-6 w-6" />}
              title="Honest progress"
              description="Your dashboard shows only what you recorded: goal progress, weekly minutes, streaks and reviews due."
            />
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              title="AI tutor and AI quizzes"
              description="Ask questions and generate quizzes on any topic when the AI service is connected."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Verified, secure accounts"
              description="Email verification before first sign-in, and a separate admin console with audited changes."
            />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 font-display">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              ["Create and verify your account", "Sign up, then confirm your email with the link we send."],
              ["Plan your study", "Add a plan with topics and schedule sessions that fit your week."],
              ["Practise and review", "Complete sessions, take quizzes, and review topics when they come due."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-lg border p-6">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t bg-background">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="font-bold font-display">Agentic AI Study Assistant</span>
          </div>
          <nav aria-label="Legal" className="flex gap-6 text-sm">
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Terms</Link>
          </nav>
          <div className="text-sm text-muted-foreground">
            © 2026 Agentic AI Education System. All rights reserved.
          </div>

        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="card-glow group h-full border-primary/10 transition-transform hover:-translate-y-1">
      <CardContent className="p-8">
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 font-display">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
