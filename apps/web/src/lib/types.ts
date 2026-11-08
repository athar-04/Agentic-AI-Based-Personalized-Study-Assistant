// Response shapes of the endpoints the web app uses (see study-service and user-service).

export interface Overview {
  timeZone: string;
  goal: { dailyMinutes: number; todayMinutes: number };
  week: { minutes: number; days: { date: string; minutes: number }[] };
  streakDays: number;
  totalCompletedSessions: number;
  planCount: number;
  activePlan: {
    id: string;
    title: string;
    subject: string;
    examDate: string | null;
    totalTopics: number;
    completedTopics: number;
    completionPercentage: number;
    nextTopics: { id: string; title: string; estimatedHours: number }[];
  } | null;
  nextSession: StudySession | null;
  revisionsDue: number;
  recentQuizzes: QuizAttemptSummary[];
}

export interface Topic {
  id: string;
  planId: string;
  title: string;
  description?: string | null;
  isCompleted: boolean;
  estimatedHours: number;
  order: number;
}

export interface StudySession {
  id: string;
  planId: string;
  topicId?: string | null;
  title: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "RESCHEDULED";
  scheduledAt: string;
  durationMinutes: number;
  actualMinutes?: number | null;
}

export interface StudyPlan {
  id: string;
  title: string;
  subject: string;
  description?: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  examDate?: string | null;
  startDate: string;
  dailyGoalHours: number;
  totalTopics: number;
  completedTopics: number;
  completionPercentage: number;
  aiGenerated: boolean;
  topics: Topic[];
  sessions?: StudySession[];
}

export interface RevisionItem {
  id: string;
  title: string;
  nextRevisionAt: string;
  lastRevisedAt: string | null;
  intervalDays: number;
  repetitionCount: number;
  isDue: boolean;
  topic: { id: string; title: string } | null;
  plan: { id: string; title: string } | null;
}

export interface QuizAttemptSummary {
  id: string;
  title: string;
  subject: string;
  percentage: number;
  completedAt: string;
  source: "AI" | "SAMPLE_BANK";
}

export interface PracticeSet {
  id: string;
  title: string;
  subject: string;
  description: string;
  questionCount: number;
  source: "SAMPLE_BANK";
}

export interface PracticeQuiz {
  id: string;
  title: string;
  subject: string;
  source: "SAMPLE_BANK";
  questions: { id: string; questionText: string; options: string[] }[];
}

export interface AttemptResult {
  attemptId: string;
  title: string;
  score: number;
  maxScore: number;
  percentage: number;
  results: { questionId: string; questionText: string; yourAnswer: string | null; correctAnswer: string; isCorrect: boolean; explanation: string | null }[];
}

export interface Preferences {
  dailyStudyGoalMinutes: number;
  timezone: string;
}

// ─── Admin ───

export type Role = "STUDENT" | "INSTRUCTOR" | "ADMIN";

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  changes: { role?: { from: Role; to: Role }; isActive?: { from: boolean; to: boolean } } | null;
  createdAt: string;
  actor: { id: string | null; email: string | null; label?: string };
  target: { id: string; email: string | null } | null;
}

export interface AdminUserDetail extends AdminUser {
  activity: { studyPlans: number; quizAttempts: number };
  history: AuditEntry[];
  security: { activeSessions: number };
  preferences: { timezone: string; dailyStudyGoalMinutes: number } | null;
  study: {
    totalMinutes: number;
    sessions: { completed: number; scheduled: number; missed: number };
    pendingRevisions: number;
    plans: { id: string; title: string; subject: string; status: string; totalTopics: number; completedTopics: number; completionPercentage: number; updatedAt: string }[];
    recentQuizzes: { id: string; title: string; subject: string; source: "AI" | "SAMPLE_BANK"; percentage: number; completedAt: string }[];
  };
}

export interface DailyValue {
  day: string;
  value: number;
}

export interface AdminActivity {
  days: number;
  signups: DailyValue[];
  activeUsers: DailyValue[];
  studyMinutes: DailyValue[];
  quizAttempts: DailyValue[];
  totals: { plans: number; completedSessions: number; quizAttempts: number; pendingRevisions: number; usersWithLiveSessions: number };
}

export type AdminTraffic =
  | { available: false; reason: string }
  | {
      available: true;
      startedAt: string;
      uptimeSeconds: number;
      totals: { requests: number; errors: number; byStatus: Record<"2xx" | "3xx" | "4xx" | "5xx", number>; rateLimited: number; failedSignIns: number; failedAdminSignIns: number };
      lastHour: { minute: string; requests: number; errors: number }[];
      byArea: { area: string; requests: number; errors: number; avgMs: number }[];
    };

export interface AdminOverview {
  users: { total: number; active: number; deactivated: number; unverified: number; newThisWeek: number; byRole: Partial<Record<Role, number>> };
  recentActions: AuditEntry[];
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
