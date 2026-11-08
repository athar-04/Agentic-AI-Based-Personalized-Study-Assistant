// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  errors?: Record<string, string[]>;
  meta?: PaginationMeta;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export type ServiceResponse<T> = Promise<{ data: T; error?: never } | { data?: never; error: string }>;

// ─── Request augmentation ───────────────────
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      requestId?: string;
      tokenScope?: 'user' | 'admin';
    }
  }
}
