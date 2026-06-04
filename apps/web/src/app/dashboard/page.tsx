"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, Trophy, BookOpen, ChevronRight, Brain } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const [stats, setStats] = useState({
    studyMinutes: 1240,
    completionRate: 68,
    streak: 12,
    nextSession: "Quantum Mechanics @ 2:00 PM",
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold font-outfit">Welcome back, Mohammed</h1>
          <p className="text-muted-foreground mt-1">You're on track to hit your weekly goal of 20 study hours.</p>
        </div>
        <Button className="gap-2">
          <Calendar className="h-4 w-4" />
          Plan Session
        </Button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<Clock className="text-blue-500" />} 
          title="Study Time" 
          value="20.6h" 
          sub="This week" 
        />
        <StatCard 
          icon={<Trophy className="text-yellow-500" />} 
          title="Current Streak" 
          value="12 Days" 
          sub="Personal best: 24" 
        />
        <StatCard 
          icon={<BookOpen className="text-green-500" />} 
          title="Topics Mastered" 
          value="18/25" 
          sub="4 scheduled for today" 
        />
        <StatCard 
          icon={<Brain className="text-purple-500" />} 
          title="Readiness Score" 
          value="84%" 
          sub="Top 5% of students" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-outfit">Active Study Plan: Physics 101</CardTitle>
              <span className="text-sm font-medium px-2 py-1 bg-primary/10 text-primary rounded">68% Complete</span>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={68} className="h-2" />
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Next Up</h4>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg border bg-accent/50 hover:bg-accent transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded bg-background flex items-center justify-center font-bold">0{i}</div>
                      <div>
                        <div className="font-semibold">Thermodynamics {i}</div>
                        <div className="text-xs text-muted-foreground">Estimated: 45 mins • Intermediate</div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar / AI Assistant */}
        <div className="space-y-8">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Brain className="h-6 w-6" />
                <h3 className="font-bold text-lg font-outfit">AI Assistant</h3>
              </div>
              <p className="text-sm opacity-90 leading-relaxed">
                "I've noticed you struggle with 'Entropy' calculations. Would you like me to generate a focused practice quiz for that topic?"
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="sm" className="w-full">Yes, Generate Quiz</Button>
                <Button variant="ghost" size="sm" className="w-full text-primary-foreground hover:bg-white/10">Maybe Later</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revision Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: "Special Relativity", time: "Due Now", color: "text-red-500" },
                { title: "Classical Mechanics", time: "In 2 hours", color: "text-orange-500" },
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm border-b pb-3 last:border-0">
                  <span className="font-medium">{item.title}</span>
                  <span className={item.color}>{item.time}</span>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2">View Full Queue</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, sub }: { icon: React.ReactNode, title: string, value: string, sub: string }) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          {icon}
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        <div className="text-2xl font-bold font-outfit">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}
