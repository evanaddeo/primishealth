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
 * CU-046 exports (provider connection management + sync DTOs):
 *   - ProviderConnectionDto, ProviderConnectionDtoSchema, PROVIDER_CONNECTION_FIXTURE
 *   - ListConnectionsResponseDto, ListConnectionsResponseDtoSchema,
 *     LIST_CONNECTIONS_RESPONSE_FIXTURE
 *   - ProviderCapabilityMetricDto, ProviderCapabilityMetricDtoSchema
 *   - ProviderCapabilitiesDto, ProviderCapabilitiesDtoSchema, PROVIDER_CAPABILITIES_FIXTURE
 *   - DisconnectConnectionResponseDto, DisconnectConnectionResponseDtoSchema
 *   - SyncStatusDto, SyncStatusDtoSchema, SYNC_STATUS_NO_HISTORY_FIXTURE,
 *     SYNC_STATUS_SUCCEEDED_FIXTURE
 *   - SyncStatusListResponseDto, SyncStatusListResponseDtoSchema
 *   - ManualSyncRequestDto, ManualSyncRequestDtoSchema
 *   - ManualSyncResponseDto, ManualSyncResponseDtoSchema, MANUAL_SYNC_RESPONSE_FIXTURE
 *
 * CU-056 exports (home dashboard summary DTOs):
 *   - TodayDashboardResponseDto, TodayDashboardResponseDtoSchema, TODAY_DASHBOARD_FIXTURE
 *   - DashboardScoresDto, DashboardScoresDtoSchema, DASHBOARD_SCORE_SLOTS
 *   - InsightCardDto, InsightCardDtoSchema, InsightSeverity, InsightSeveritySchema, INSIGHT_SEVERITIES
 *   - RecommendationCardDto, RecommendationCardDtoSchema
 *   - DashboardWidgetSummaryDto, DashboardWidgetSummaryDtoSchema
 *   - BedtimeWidgetSummaryDto, BedtimeWidgetSummaryDtoSchema
 *
 * CU-057 exports (sleep/recovery/activity/vitals detail DTOs):
 *   - chart primitives: ChartPointDto, TrendSeriesDto, SleepStageSegmentDto,
 *     SleepStageSummaryDto, SleepStageDto, SLEEP_STAGES (+ schemas)
 *   - SleepDetailResponseDto, SleepDetailResponseDtoSchema, SLEEP_DETAIL_FIXTURE,
 *     SleepSummaryDto, SleepStagesDto, SleepOvernightVitalsDto
 *   - RecoveryDetailResponseDto, RecoveryDetailResponseDtoSchema, RECOVERY_DETAIL_FIXTURE,
 *     RecoveryVitalsDto, RecommendedIntensityDto, RECOMMENDED_INTENSITY_LEVELS
 *   - ActivityDetailResponseDto, ActivityDetailResponseDtoSchema, ACTIVITY_DETAIL_FIXTURE,
 *     ActivitySummaryDto, WorkoutSummaryDto
 *   - VitalsDetailResponseDto, VitalsDetailResponseDtoSchema, VITALS_DETAIL_FIXTURE,
 *     VitalsMetricsDto, VitalsBaselineDeviationsDto
 *
 * CU-069 exports (manual check-in DTOs):
 *   - ManualCheckinDto, ManualCheckinDtoSchema, MANUAL_CHECKIN_FIXTURE
 *   - CheckinType, CheckinTypeSchema, CHECKIN_TYPE_VALUES
 *   - CreateCheckinRequestDto, CreateCheckinRequestDtoSchema
 *   - UpdateCheckinRequestDto, UpdateCheckinRequestDtoSchema
 *   - CheckinListResponseDto, CheckinListResponseDtoSchema
 *
 * CU-073 exports (custom tag DTOs):
 *   - CustomTagDto, CustomTagDtoSchema, CUSTOM_TAG_FIXTURE
 *   - CreateTagRequestDto, CreateTagRequestDtoSchema
 *   - TagListResponseDto, TagListResponseDtoSchema
 *   - TagEventDto, TagEventDtoSchema, TAG_EVENT_FIXTURE
 *   - CreateTagEventRequestDto, CreateTagEventRequestDtoSchema
 *   - TagEventListResponseDto, TagEventListResponseDtoSchema
 *   - TagCategory, TagCategorySchema, TAG_CATEGORY_VALUES
 *   - TagLinkedEntityType, TagLinkedEntityTypeSchema, TAG_LINKED_ENTITY_TYPE_VALUES
 *   - normalizeTagCode
 *
 * envelope/errors/pagination modules do NOT import from @primis/core-types (CU-011 constraint).
 * scores/dataQuality modules add the @primis/core-types dependency (CU-012).
 * user/onboarding modules are self-contained (no @primis/core-types dependency).
 * providerConnections module is self-contained (no @primis/core-types dependency).
 * sync module is self-contained (no @primis/core-types dependency).
 */

export * from './activity.js';
export * from './chart.js';
export * from './dashboard.js';
export * from './dataQuality.js';
export * from './digestion.js';
export * from './recovery.js';
export * from './sleep.js';
export * from './envelope.js';
export * from './errors.js';
export * from './lifestyleLogs.js';
export * from './manualInputs.js';
export * from './nutrition.js';
export * from './onboarding.js';
export * from './pagination.js';
export * from './providerConnections.js';
export * from './scores.js';
export * from './sync.js';
export * from './tags.js';
export * from './user.js';
export * from './vitals.js';
