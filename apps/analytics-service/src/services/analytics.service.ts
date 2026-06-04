import { prisma } from '../lib/prisma';
import { AuthorizationError } from '@agentic/shared';
import axios from 'axios';

export class AnalyticsService {
  private assertAccess(targetId: string, requesterId: string) {
    if (targetId !== requesterId) throw new AuthorizationError();
  }

  async getDashboard(userId: string, requesterId: string) {
    this.assertAccess(userId, requesterId);

    const [analytics, quizAttempts, sessions] = await Promise.all([
      prisma.analytics.findUnique({ where: { userId } }),
      prisma.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.studySession.findMany({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 30,
      }),
    ]);

    const avgQuizScore = quizAttempts.length
      ? quizAttempts.reduce((s, a) => s + a.percentage, 0) / quizAttempts.length
      : 0;

    const weeklyMinutes = this.calculateWeeklyMinutes(sessions);

    return {
      totalStudyMinutes: analytics?.totalStudyMinutes ?? 0,
      totalSessions: analytics?.totalSessions ?? 0,
      completedSessions: analytics?.completedSessions ?? 0,
      completionRate: analytics?.totalSessions
        ? Math.round(((analytics.completedSessions) / analytics.totalSessions) * 100) : 0,
      totalQuizAttempts: analytics?.totalQuizAttempts ?? 0,
      averageQuizScore: Math.round(avgQuizScore * 10) / 10,
      currentStreak: analytics?.currentStreak ?? 0,
      longestStreak: analytics?.longestStreak ?? 0,
      examReadinessScore: analytics?.examReadinessScore ?? 0,
      weeklyStudyMinutes: weeklyMinutes,
      weakTopics: analytics?.weakTopics ?? [],
      strongTopics: analytics?.strongTopics ?? [],
      recentAttempts: quizAttempts.map(a => ({
        id: a.id, score: a.percentage, completedAt: a.completedAt?.toISOString?.(),
      })),
    };
  }

  async getWeakTopics(userId: string, requesterId: string) {
    this.assertAccess(userId, requesterId);
    const analytics = await prisma.analytics.findUnique({ where: { userId } });
    const weakTopics = (analytics?.weakTopics as any[]) ?? [];

    // Call analyzer agent for enriched analysis
    const analyzerUrl = process.env.ANALYZER_AGENT_URL || 'http://localhost:8005';
    try {
      const res = await axios.post(`${analyzerUrl}/analyze/weak-topics`, { userId }, { timeout: 10000 });
      return res.data?.weakTopics ?? weakTopics;
    } catch {
      return weakTopics;
    }
  }

  async getStudyHeatmap(userId: string, requesterId: string, days: number) {
    this.assertAccess(userId, requesterId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const sessions = await prisma.studySession.findMany({
      where: { userId, status: 'COMPLETED', completedAt: { gte: cutoff } },
      select: { completedAt: true, actualMinutes: true, durationMinutes: true },
    });

    const heatmap: Record<string, { minutes: number; sessions: number }> = {};
    for (const s of sessions) {
      const date = s.completedAt?.toISOString().split('T')[0] ?? '';
      if (!heatmap[date]) heatmap[date] = { minutes: 0, sessions: 0 };
      heatmap[date].minutes += s.actualMinutes ?? s.durationMinutes;
      heatmap[date].sessions += 1;
    }

    return Object.entries(heatmap).map(([date, v]) => ({ date, ...v }));
  }

  async getReadinessScore(userId: string, requesterId: string) {
    this.assertAccess(userId, requesterId);

    const [plans, quizAttempts, analytics] = await Promise.all([
      prisma.studyPlan.findMany({ where: { userId, status: 'ACTIVE' }, include: { topics: true } }),
      prisma.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.analytics.findUnique({ where: { userId } }),
    ]);

    const completionScore = plans.length
      ? plans.reduce((sum, p) =>
          sum + (p.totalTopics > 0 ? p.completedTopics / p.totalTopics : 0), 0) / plans.length * 40
      : 0;

    const quizScore = quizAttempts.length
      ? (quizAttempts.reduce((s, a) => s + a.percentage, 0) / quizAttempts.length) * 0.4
      : 0;

    const streakScore = Math.min((analytics?.currentStreak ?? 0) / 30, 1) * 20;
    const readinessScore = Math.round(completionScore + quizScore + streakScore);

    await prisma.analytics.upsert({
      where: { userId },
      update: { examReadinessScore: readinessScore },
      create: { userId, examReadinessScore: readinessScore },
    });

    return {
      score: readinessScore,
      breakdown: {
        topicCompletion: Math.round(completionScore),
        quizPerformance: Math.round(quizScore),
        studyConsistency: Math.round(streakScore),
      },
      level: readinessScore >= 80 ? 'READY' : readinessScore >= 60 ? 'ON_TRACK' : readinessScore >= 40 ? 'NEEDS_WORK' : 'CRITICAL',
    };
  }

  async getPerformanceTrends(userId: string, requesterId: string, period: string) {
    this.assertAccess(userId, requesterId);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const attempts = await prisma.quizAttempt.findMany({
      where: { userId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'asc' },
      select: { percentage: true, createdAt: true },
    });

    return attempts.map(a => ({
      date: a.createdAt?.toISOString().split('T')[0],
      score: Math.round(a.percentage),
    }));
  }

  async getStreak(userId: string, requesterId: string) {
    this.assertAccess(userId, requesterId);
    const analytics = await prisma.analytics.findUnique({ where: { userId } });
    return {
      current: analytics?.currentStreak ?? 0,
      longest: analytics?.longestStreak ?? 0,
    };
  }

  async recalculateAnalytics(userId: string) {
    const [sessions, quizAttempts] = await Promise.all([
      prisma.studySession.findMany({ where: { userId } }),
      prisma.quizAttempt.findMany({ where: { userId } }),
    ]);

    const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
    const totalStudyMinutes = completedSessions.reduce((sum, s) => sum + (s.actualMinutes ?? s.durationMinutes), 0);
    const avgScore = quizAttempts.length
      ? quizAttempts.reduce((s, a) => s + a.percentage, 0) / quizAttempts.length : 0;

    const streak = this.calculateStreak(completedSessions);

    await prisma.analytics.upsert({
      where: { userId },
      update: {
        totalStudyMinutes,
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        totalQuizAttempts: quizAttempts.length,
        averageQuizScore: avgScore,
        currentStreak: streak.current,
        longestStreak: streak.longest,
      },
      create: {
        userId,
        totalStudyMinutes,
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        totalQuizAttempts: quizAttempts.length,
        averageQuizScore: avgScore,
        currentStreak: streak.current,
        longestStreak: streak.longest,
      },
    });
  }

  private calculateWeeklyMinutes(sessions: any[]): number[] {
    const weeks = new Array(7).fill(0);
    const now = new Date();
    for (const s of sessions) {
      const daysAgo = Math.floor((now.getTime() - new Date(s.completedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo < 7) weeks[6 - daysAgo] += s.actualMinutes ?? s.durationMinutes;
    }
    return weeks;
  }

  private calculateStreak(sessions: any[]) {
    const days = new Set(sessions.map(s => s.completedAt?.toISOString().split('T')[0]).filter(Boolean));
    const sortedDays = Array.from(days).sort().reverse();

    let current = 0;
    let longest = 0;
    let temp = 0;
    const today = new Date().toISOString().split('T')[0];

    for (let i = 0; i < sortedDays.length; i++) {
      const expected = new Date();
      expected.setDate(expected.getDate() - i);
      if (sortedDays[i] === expected.toISOString().split('T')[0]) {
        temp++;
        if (i === 0 || i === 1) current = temp;
      } else {
        longest = Math.max(longest, temp);
        temp = 1;
      }
    }
    return { current, longest: Math.max(longest, temp) };
  }
}
