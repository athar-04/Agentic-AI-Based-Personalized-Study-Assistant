export interface AnalyticsDto {
  userId: string;
  totalStudyMinutes: number;
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  totalQuizAttempts: number;
  averageQuizScore: number;
  currentStreak: number;
  longestStreak: number;
  examReadinessScore: number;
  weeklyStudyMinutes: number[];
  weakTopics: TopicStrength[];
  strongTopics: TopicStrength[];
  studyHeatmap: HeatmapEntry[];
}

export interface TopicStrength {
  topic: string;
  score: number;
  sessionsCompleted: number;
  lastStudied?: string;
}

export interface HeatmapEntry {
  date: string;
  minutes: number;
  sessions: number;
}

export interface PerformanceTrend {
  date: string;
  quizScore: number;
  studyMinutes: number;
}

export interface WeakTopicAnalysis {
  topic: string;
  averageScore: number;
  attemptCount: number;
  improvementRate: number;
  recommendedAction: string;
}
