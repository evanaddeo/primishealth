/**
 * @primis/api-contracts — shared API envelope, error, pagination, score/data-quality,
 * and user/onboarding schemas.
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
 * CU-033 exports (user profile + onboarding DTOs):
 *   - UserProfileDto, UserProfileDtoSchema, USER_PROFILE_FIXTURE
 *   - GoalItemDto, GoalItemDtoSchema
 *   - CoachPreferencesDto, CoachPreferencesDtoSchema
 *   - ThemePreferenceDto, ThemePreferenceDtoSchema
 *   - UpdateProfileRequestDto, UpdateProfileRequestDtoSchema
 *   - UpdatePreferencesRequestDto, UpdatePreferencesRequestDtoSchema
 *   - NutritionPhilosophyUpdateDto, NutritionPhilosophyUpdateDtoSchema
 *   - CoachStyleSchema, ExplanationDepthSchema, CoachingIntensitySchema, HumorLevelSchema
 *   - GoalCode, GoalCodeSchema, GOAL_CODE_VALUES
 *   - GoalInputItemDto, GoalInputItemDtoSchema
 *   - OnboardingGoalsRequestDto, OnboardingGoalsRequestDtoSchema
 *   - OnboardingPreferencesRequestDto, OnboardingPreferencesRequestDtoSchema
 *   - ConsentType, ConsentTypeSchema, CONSENT_TYPE_VALUES
 *   - OnboardingConsentRequestDto, OnboardingConsentRequestDtoSchema
 *
 * CU-037 exports (provider connection OAuth DTOs):
 *   - StartAuthorizationResponseDto, StartAuthorizationResponseDtoSchema,
 *     START_AUTHORIZATION_RESPONSE_FIXTURE
 *   - ConnectionCreatedResponseDto, ConnectionCreatedResponseDtoSchema,
 *     CONNECTION_CREATED_RESPONSE_FIXTURE
 *
 * envelope/errors/pagination modules do NOT import from @primis/core-types (CU-011 constraint).
 * scores/dataQuality modules add the @primis/core-types dependency (CU-012).
 * user/onboarding modules are self-contained (no @primis/core-types dependency).
 * providerConnections module is self-contained (no @primis/core-types dependency).
 */

export * from './dataQuality.js';
export * from './envelope.js';
export * from './errors.js';
export * from './onboarding.js';
export * from './pagination.js';
export * from './providerConnections.js';
export * from './scores.js';
export * from './user.js';
