"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Calendar, ChartBar, Mic, BookOpen, GraduationCap } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="flex items-center justify-between p-6 glass sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold font-outfit">Agentic Study</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
          <Link href="#how-it-works" className="hover:text-primary transition-colors">How it works</Link>
          <Link href="/auth/login">
            <Button variant="outline">Log in</Button>
          </Link>
          <Link href="/auth/register">
            <Button>Start Free</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24 px-6 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-700" />
        </div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-7xl font-bold font-outfit max-w-4xl leading-tight"
        >
          Your Personal <span className="text-primary italic">AI-Powered</span> Study Ecosystem
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-xl text-muted-foreground max-w-2xl"
        >
          Experience the future of learning with autonomous agents that plan, tutor, and adapt to your unique pace.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-10 flex flex-col md:flex-row gap-4"
        >
          <Link href="/auth/register">
            <Button size="lg" className="px-8 text-lg">Initialize Assistant</Button>
          </Link>
          <Button size="lg" variant="outline" className="px-8 text-lg">Watch Demo</Button>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-muted/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16 font-outfit">Multi-Agent Intelligence</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Calendar className="h-6 w-6" />}
              title="Autonomous Planner"
              description="Dynamic study schedules that adapt automatically when you miss a session."
            />
            <FeatureCard 
              icon={<Brain className="h-6 w-6" />}
              title="Spaced Repetition"
              description="SM-2 algorithm-driven revision schedules for maximum long-term retention."
            />
            <FeatureCard 
              icon={<BookOpen className="h-6 w-6" />}
              title="AI Quiz Engine"
              description="Instantly generate interactive quizzes from your PDFs and lecture notes."
            />
            <FeatureCard 
              icon={<Mic className="h-6 w-6" />}
              title="Voice Interaction"
              description="Full voice control and accessibility-first design for seamless learning."
            />
            <FeatureCard 
              icon={<ChartBar className="h-6 w-6" />}
              title="Deep Analytics"
              description="Visualize your progress with heatmaps and predictive readiness scoring."
            />
            <FeatureCard 
              icon={<GraduationCap className="h-6 w-6" />}
              title="Contextual Tutor"
              description="Ask questions about your own study materials with integrated RAG."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t bg-background">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="font-bold font-outfit">Agentic AI Study Assistant</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2026 Agentic AI Education System. All rights reserved.
          </div>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-primary">Terms</Link>
            <Link href="#" className="hover:text-primary">Privacy</Link>
            <Link href="#" className="hover:text-primary">GitHub</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="hover:shadow-lg transition-all border-primary/10 hover:border-primary/30 group">
      <CardContent className="p-8">
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 font-outfit">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
