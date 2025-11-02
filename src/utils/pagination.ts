/**
 * Pagination utility functions
 * 
 * Provides standardized pagination handling across all endpoints
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  maxLimit?: number;
}

export interface PaginationResult {
  skip: number;
  limit: number;
  page: number;
}

/**
 * Get pagination parameters from query string
 * @param query - Request query object
 * @param defaultLimit - Default items per page (default: 20)
 * @param maxLimit - Maximum allowed items per page (default: 100)
 * @returns PaginationResult with skip, limit, and page
 */
export function getPaginationParams(query: any, defaultLimit = 20, maxLimit = 100): PaginationResult {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit as string) || defaultLimit));
  const skip = (page - 1) * limit;
  
  return { skip, limit, page };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Generate pagination metadata for response
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total number of items
 * @returns PaginationMeta object
 */
export function getPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

