import { prisma } from '../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

function safeTimeZone(tz: string | undefined | null): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in the student's own time zone. */
function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Everything on the student dashboard, derived on request from the student's own rows.
 * Nothing here is cached, estimated or synthesised: a new account gets zeros and nulls,
 * and the UI shows empty states for them.
 */
export class OverviewService {
  async getOverview(userId: string) {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { dailyStudyGoalMinutes: true, timezone: true },
    });
    const tz = safeTimeZone(prefs?.timezone);
    const now = new Date();

    const [completed, activePlan, planCount, inProgress, upcoming, revisionsDue, recentAttempts] = await Promise.all([
      prisma.studySession.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { gte: new Date(now.getTime() - 400 * DAY_MS) } },
        select: { completedAt: true, actualMinutes: true, durationMinutes: true },
      }),
      prisma.studyPlan.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        include: { topics: { orderBy: { order: 'asc' }, select: { id: true, title: true, isCompleted: true, estimatedHours: true } } },
      }),
      prisma.studyPlan.count({ where: { userId } }),
      prisma.studySession.findFirst({ where: { userId, status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' } }),
      prisma.studySession.findFirst({
        where: { userId, status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.revisionItem.count({ where: { userId, status: 'PENDING', nextRevisionAt: { lte: now } } }),
      prisma.quizAttempt.findMany({
        where: { userId },
        orderBy: { completedAt: 'desc' },
        take: 5,
        include: { quiz: { select: { title: true, subject: true, aiGenerated: true } } },
      }),
    ]);

    const minutesByDay = new Map<string, number>();
    for (const s of completed) {
      if (!s.completedAt) continue;
      const day = localDate(s.completedAt, tz);
      minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + (s.actualMinutes ?? s.durationMinutes));
    }

    const today = localDate(now, tz);
    const lastSevenDays = Array.from({ length: 7 }, (_, i) => localDate(new Date(now.getTime() - i * DAY_MS), tz));

    // A streak survives until the end of today: studying yesterday but not yet today still counts.
    let streakDays = 0;
    for (let i = minutesByDay.has(today) ? 0 : 1; ; i++) {
      if (!minutesByDay.has(localDate(new Date(now.getTime() - i * DAY_MS), tz))) break;
      streakDays++;
    }

    const nextSession = inProgress ?? upcoming;
    const completedTopics = activePlan?.topics.filter((t) => t.isCompleted).length ?? 0;
    const totalTopics = activePlan?.topics.length ?? 0;

    return {
      timeZone: tz,
      goal: {
        dailyMinutes: prefs?.dailyStudyGoalMinutes ?? 60,
        todayMinutes: minutesByDay.get(today) ?? 0,
      },
      week: {
        minutes: lastSevenDays.reduce((sum, d) => sum + (minutesByDay.get(d) ?? 0), 0),
        days: lastSevenDays.reverse().map((date) => ({ date, minutes: minutesByDay.get(date) ?? 0 })),
      },
      streakDays,
      totalCompletedSessions: completed.length,
      planCount,
      activePlan: activePlan
        ? {
            id: activePlan.id,
            title: activePlan.title,
            subject: activePlan.subject,
            examDate: activePlan.examDate?.toISOString() ?? null,
            totalTopics,
            completedTopics,
            completionPercentage: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0,
            nextTopics: activePlan.topics.filter((t) => !t.isCompleted).slice(0, 3),
          }
        : null,
      nextSession: nextSession
        ? {
            id: nextSession.id,
            planId: nextSession.planId,
            title: nextSession.title,
            status: nextSession.status,
            scheduledAt: nextSession.scheduledAt.toISOString(),
            durationMinutes: nextSession.durationMinutes,
          }
        : null,
      revisionsDue,
      recentQuizzes: recentAttempts.map((a) => ({
        id: a.id,
        title: a.quiz.title,
        subject: a.quiz.subject,
        percentage: a.percentage,
        completedAt: a.completedAt.toISOString(),
        source: a.quiz.aiGenerated ? 'AI' : 'SAMPLE_BANK',
      })),
    };
  }
}
