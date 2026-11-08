import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').max(50).trim(),
  lastName: z.string().min(1, 'Last name is required').max(50).trim(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const studyPlanSchema = z.object({
  title: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  examDate: z.string().datetime().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  dailyGoalHours: z.number().min(0.5).max(16).default(2),
});

export const generateQuizSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
  questionCount: z.number().min(1).max(50).default(10),
  questionTypes: z.array(z.enum(['MCQ', 'TRUE_FALSE', 'FILL_IN_BLANK', 'SHORT_ANSWER'])).max(4).default(['MCQ']),
  sourceText: z.string().optional(),
  documentId: z.string().uuid().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type StudyPlanInput = z.infer<typeof studyPlanSchema>;
export type GenerateQuizInput = z.infer<typeof generateQuizSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

// ─── Email verification / password reset ───
// Raw tokens are 32 random bytes, base64url (43 chars). Bounds stop junk before it reaches a hash lookup.
export const emailLinkTokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Malformed token');

export const tokenBodySchema = z.object({ token: emailLinkTokenSchema });
export const verifyEmailSchema = z.object({ token: emailLinkTokenSchema, password: z.string().min(1, 'Enter your password').max(200) });
export const emailOnlySchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: emailLinkTokenSchema, password: passwordSchema });

// ─── Profile / preferences ───
export const preferencesUpdateSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string().min(2).max(10),
    timezone: z.string().min(1).max(64),
    dailyStudyGoalMinutes: z.number().int().min(10, 'Goal must be at least 10 minutes').max(720, 'Goal must be at most 12 hours'),
    notificationsEnabled: z.boolean(),
    emailNotifications: z.boolean(),
    voiceEnabled: z.boolean(),
    highContrastMode: z.boolean(),
    dyslexiaFriendlyMode: z.boolean(),
    fontSize: z.enum(['small', 'medium', 'large']),
    screenReaderMode: z.boolean(),
    simplifiedLanguage: z.boolean(),
  })
  .partial()
  .strict();

// ─── Admin ───
export const USER_ROLES = ['STUDENT', 'INSTRUCTOR', 'ADMIN'] as const;
export const adminRoleSchema = z.object({ role: z.enum(USER_ROLES) }).strict();
export const adminStatusSchema = z.object({ isActive: z.boolean() }).strict();
export const adminUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['active', 'deactivated', 'unverified']).optional(),
});
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  targetUserId: z.string().uuid().optional(),
});

// ─── Study ───
export const sessionCreateSchema = z.object({
  planId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(480).default(60),
});
export const revisionCreateSchema = z.object({ topicId: z.string().uuid() }).strict();
export const revisionReviewSchema = z.object({ quality: z.number().int().min(0).max(5) }).strict();
export const quizAttemptSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().uuid(), answer: z.string().max(500) })).min(1).max(50),
  timeTakenSeconds: z.number().int().min(0).max(24 * 3600).optional(),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const profileUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    username: usernameSchema,
  })
  .partial()
  .strict();

// ─── AI tutor and AI quizzes ───
export const tutorSchema = z.object({
  message: z.string().trim().min(1, 'Type a question').max(2000),
  topicId: z.string().uuid().optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export const aiQuizSchema = z
  .object({
    topicId: z.string().uuid().optional(),
    topic: z.string().trim().min(2).max(120).optional(),
    subject: z.string().trim().max(100).optional(),
    difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
    questionCount: z.number().int().min(3).max(10).default(5),
  })
  .refine((v) => v.topicId || v.topic, { message: 'Choose one of your topics or type a topic' });
