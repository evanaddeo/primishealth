/**
 * @primis/api-contracts — shared API envelope, error, and pagination schemas.
 *
 * CU-011 exports (envelope + errors + pagination):
 *   - ApiSuccessResponse, ApiErrorResponse, ApiResponse, makeSuccessResponse, makeErrorResponse
 *   - ApiErrorCode, ApiError, ApiErrorCodeSchema, ApiErrorSchema
 *   - PaginationMeta, PaginatedResponse, PaginationMetaSchema, PaginatedResponseSchema,
 *     makePaginatedResponse
 *
 * CU-012 will add:
 *   - ScoreSnapshotDto, ScoreQualityMetadataDto, and related score/data-quality schemas.
 *
 * Do not import from @primis/core-types in this file or in envelope/errors/pagination modules —
 * that dependency is added only in CU-012 for score-specific DTOs.
 */

export * from './envelope.js';
export * from './errors.js';
export * from './pagination.js';
