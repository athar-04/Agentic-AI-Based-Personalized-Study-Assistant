import { prisma } from '../lib/prisma';
import { deleteCache, getCache, setCache } from '../lib/redis';
import { NotFoundError, AuthorizationError, CreateStudyPlanDto } from '@agentic/shared';
import { REDIS_KEYS } from '@agentic/shared';
import axios from 'axios';

export class StudyPlanService {
  async createPlan(userId: string, data: CreateStudyPlanDto) {
    const { topics: topicsData, ...planData } = data as any;

    const plan = await prisma.studyPlan.create({
      data: {
        ...planData,
        userId,
        totalTopics: topicsData?.length ?? 0,
        topics: topicsData?.length
          ? {
              create: topicsData.map((t: any, i: number) => ({
                title: t.title,
                description: t.description,
                bloomLevel: t.bloomLevel ?? 'REMEMBER',
                estimatedHours: t.estimatedHours ?? 1,
                priority: t.priority ?? i + 1,
                order: i,
              })),
            }
          : undefined,
      },
      include: { topics: true, sessions: { take: 5, orderBy: { scheduledAt: 'asc' } } },
    });

    await deleteCache(REDIS_KEYS.PLAN_CACHE(plan.id));
    return this.formatPlan(plan);
  }

  async listPlans(userId: string, page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (status) where.status = status;

    const [plans, total] = await Promise.all([
      prisma.studyPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { topics: { orderBy: { order: 'asc' } } },
      }),
      prisma.studyPlan.count({ where }),
    ]);

    return { plans: plans.map(this.formatPlan), total };
  }

  async getPlanById(planId: string, userId: string) {
    const cached = await getCache(REDIS_KEYS.PLAN_CACHE(planId));
    if (cached) return cached;

    const plan = await prisma.studyPlan.findUnique({
      where: { id: planId },
      include: {
        topics: { orderBy: { order: 'asc' } },
        sessions: { orderBy: { scheduledAt: 'asc' }, take: 20 },
      },
    });

    if (!plan) throw new NotFoundError('Study plan');
    if (plan.userId !== userId) throw new AuthorizationError();

    const formatted = this.formatPlan(plan);
    await setCache(REDIS_KEYS.PLAN_CACHE(planId), formatted, 300);
    return formatted;
  }

  async updatePlan(planId: string, userId: string, data: any) {
    await this.verifyOwnership(planId, userId);
    const allowedFields = ['title', 'description', 'examDate', 'endDate', 'dailyGoalHours', 'weeklyGoalHours'];
    const updateData: Record<string, any> = {};
    for (const f of allowedFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }

    const plan = await prisma.studyPlan.update({
      where: { id: planId },
      data: updateData,
      include: { topics: { orderBy: { order: 'asc' } } },
    });

    await deleteCache(REDIS_KEYS.PLAN_CACHE(planId));
    return this.formatPlan(plan);
  }

  async deletePlan(planId: string, userId: string) {
    await this.verifyOwnership(planId, userId);
    await prisma.studyPlan.delete({ where: { id: planId } });
    await deleteCache(REDIS_KEYS.PLAN_CACHE(planId));
  }

  async updateStatus(planId: string, userId: string, status: string) {
    await this.verifyOwnership(planId, userId);
    const validStatuses = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
    if (!validStatuses.includes(status)) throw new Error('Invalid status');

    const plan = await prisma.studyPlan.update({
      where: { id: planId },
      data: { status: status as any },
      include: { topics: true },
    });
    await deleteCache(REDIS_KEYS.PLAN_CACHE(planId));
    return this.formatPlan(plan);
  }

  async generateAIPlan(userId: string, params: any) {
    // Call AI Orchestrator planner agent
    const aiUrl = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:8000';
    let aiTopics: any[] = [];

    try {
      const response = await axios.post(`${aiUrl}/api/plan/generate`, {
        userId,
        subject: params.subject,
        examDate: params.examDate,
        dailyHours: params.dailyGoalHours ?? 2,
        currentLevel: params.currentLevel ?? 'beginner',
      }, { timeout: 30000 });

      aiTopics = response.data?.topics ?? [];
    } catch {
      // Fallback: create plan without AI topics
      aiTopics = [];
    }

    return this.createPlan(userId, {
      ...params,
      aiGenerated: true,
      topics: aiTopics,
    });
  }

  async getPlanProgress(planId: string, userId: string) {
    await this.verifyOwnership(planId, userId);
    const plan = await prisma.studyPlan.findUnique({
      where: { id: planId },
      include: {
        sessions: true,
        topics: true,
      },
    });
    if (!plan) throw new NotFoundError('Study plan');

    const completedSessions = plan.sessions.filter((s) => s.status === 'COMPLETED').length;
    const completedTopics = plan.topics.filter((t) => t.isCompleted).length;
    const totalStudyMinutes = plan.sessions
      .filter((s) => s.status === 'COMPLETED')
      .reduce((sum, s) => sum + (s.actualMinutes ?? s.durationMinutes), 0);

    return {
      planId,
      totalSessions: plan.sessions.length,
      completedSessions,
      totalTopics: plan.totalTopics,
      completedTopics,
      completionPercentage: plan.totalTopics > 0 ? Math.round((completedTopics / plan.totalTopics) * 100) : 0,
      totalStudyMinutes,
      sessionCompletionRate: plan.sessions.length > 0 ? Math.round((completedSessions / plan.sessions.length) * 100) : 0,
    };
  }

  private async verifyOwnership(planId: string, userId: string) {
    const plan = await prisma.studyPlan.findUnique({ where: { id: planId }, select: { userId: true } });
    if (!plan) throw new NotFoundError('Study plan');
    if (plan.userId !== userId) throw new AuthorizationError();
  }

  private formatPlan(plan: any) {
    return {
      ...plan,
      completionPercentage: plan.totalTopics > 0
        ? Math.round((plan.completedTopics / plan.totalTopics) * 100)
        : 0,
      startDate: plan.startDate?.toISOString?.() ?? plan.startDate,
      examDate: plan.examDate?.toISOString?.() ?? plan.examDate,
      endDate: plan.endDate?.toISOString?.() ?? plan.endDate,
      createdAt: plan.createdAt?.toISOString?.() ?? plan.createdAt,
      updatedAt: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
    };
  }
}
