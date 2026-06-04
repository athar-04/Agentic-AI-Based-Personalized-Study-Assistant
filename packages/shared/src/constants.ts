// ============================================================
// APPLICATION CONSTANTS
// ============================================================

export const SERVICES = {
  USER: 'user-service',
  STUDY: 'study-service',
  ANALYTICS: 'analytics-service',
  AI_ORCHESTRATOR: 'ai-orchestrator',
} as const;

export const AGENTS = {
  PLANNER: 'planner-agent',
  TUTOR: 'tutor-agent',
  QUIZ: 'quiz-agent',
  REVISION: 'revision-agent',
  ANALYZER: 'analyzer-agent',
  ACCESSIBILITY: 'accessibility-agent',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const BLOOM_LEVELS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'] as const;

export const REVISION_INTERVALS_DAYS = [1, 3, 7, 21, 30] as const;

export const REDIS_KEYS = {
  SESSION: (userId: string) => `session:${userId}`,
  RATE_LIMIT: (ip: string) => `rl:${ip}`,
  REVISION_QUEUE: (userId: string) => `revision:queue:${userId}`,
  USER_CACHE: (userId: string) => `user:${userId}`,
  PLAN_CACHE: (planId: string) => `plan:${planId}`,
  AI_CONTEXT: (userId: string) => `ai:context:${userId}`,
} as const;

export const REDIS_CHANNELS = {
  REVISION_DUE: 'revision:due',
  SESSION_COMPLETED: 'session:completed',
  QUIZ_COMPLETED: 'quiz:completed',
  PLAN_UPDATED: 'plan:updated',
  NOTIFICATION: 'notification',
} as const;

export const MONGO_COLLECTIONS = {
  INTERACTION_LOGS: 'interaction_logs',
  CHAT_HISTORY: 'chat_history',
  AGENT_CONVERSATIONS: 'agent_conversations',
  AUDIT_TRAILS: 'audit_trails',
  VOICE_SESSIONS: 'voice_sessions',
} as const;

export const FILE_TYPES = {
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
} as const;

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
