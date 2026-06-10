/**
 * @primis/api-contracts — shared API envelope, error, pagination, and score/data-quality schemas.
 *
 * CU-011 exports (envelope + errors + pagination):
 *   - ApiSuccessResponse, ApiErrorResponse, ApiResponse, makeSuccessResponse, makeErrorResponse
 *   - ApiErrorCode, ApiError, ApiErrorCodeSchema, ApiErrorSchema
 *   - PaginationMeta, PaginatedResponse, PaginationMetaSchema, PaginatedResponseSchema,
 *     makePaginatedResponse
 *
 * CU-012 exports (score snapshot + data-quality DTOs):
 *   - ScoreSnapshotDto, ScoreSnapshotDtoSchema, SCORE_SNAPSHOT_FIXTURE
 *   - ScoreComponentDto, ScoreComponentDtoSchema
 *   - MissingMetricDto, MissingMetricDtoSchema
 *   - ScoreDriverDto, ScoreDriverDtoSchema
 *   - ScoreTypeDtoSchema
 *   - ScoreQualityMetadataDto, ScoreQualityMetadataDtoSchema, SCORE_QUALITY_METADATA_FIXTURE
 *   - ProviderFreshnessDto, ProviderFreshnessDtoSchema, PROVIDER_FRESHNESS_FIXTURE
 *   - BaselineStatus, BaselineStatusSchema
 *   - ScoreStateDtoSchema, ScoreConfidenceDtoSchema  (from dataQuality)
 *
 * envelope/errors/pagination modules do NOT import from @primis/core-types (CU-011 constraint).
 * scores/dataQuality modules add the @primis/core-types dependency (CU-012).
 */

export * from './dataQuality.js';
export * from './envelope.js';
export * from './errors.js';
export * from './pagination.js';
export * from './scores.js';
