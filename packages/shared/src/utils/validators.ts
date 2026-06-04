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
  questionTypes: z.array(z.enum(['MCQ', 'TRUE_FALSE', 'FILL_IN_BLANK', 'SHORT_ANSWER'])).default(['MCQ']),
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
