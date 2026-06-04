export type PlanStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'RESCHEDULED';
export type BloomLevel = 'REMEMBER' | 'UNDERSTAND' | 'APPLY' | 'ANALYZE' | 'EVALUATE' | 'CREATE';

export interface StudyPlanDto {
  id: string;
  userId: string;
  title: string;
  description?: string;
  subject: string;
  examDate?: string;
  startDate: string;
  endDate?: string;
  status: PlanStatus;
  dailyGoalHours: number;
  totalTopics: number;
  completedTopics: number;
  completionPercentage: number;
  aiGenerated: boolean;
  createdAt: string;
  topics?: TopicDto[];
}

export interface TopicDto {
  id: string;
  planId: string;
  title: string;
  description?: string;
  bloomLevel: BloomLevel;
  priority: number;
  estimatedHours: number;
  isCompleted: boolean;
  order: number;
}

export interface StudySessionDto {
  id: string;
  planId: string;
  topicId?: string;
  userId: string;
  title: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMinutes: number;
  actualMinutes?: number;
  status: SessionStatus;
  notes?: string;
}

export interface CreateStudyPlanDto {
  title: string;
  subject: string;
  description?: string;
  examDate?: string;
  startDate: string;
  endDate?: string;
  dailyGoalHours?: number;
  topics?: Array<{ title: string; estimatedHours: number; bloomLevel?: BloomLevel }>;
}
