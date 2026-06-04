import { ApiResponse } from '../types/api.types';

export function successResponse<T>(data: T, message?: string, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
}

export function errorResponse(error: string, errors?: Record<string, string[]>): ApiResponse<never> {
  return {
    success: false,
    error,
    errors,
    timestamp: new Date().toISOString(),
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  message?: string,
): ApiResponse<T[]> {
  const totalPages = Math.ceil(total / limit);
  return {
    success: true,
    data,
    message,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    timestamp: new Date().toISOString(),
  };
}
