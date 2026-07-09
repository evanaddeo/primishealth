/**
 * Versioned AI context packet + evidence schemas for @primis/api-contracts.
 *
 * CU-078 — Base AI context packet schemas.
 *
 * A context packet is the ONLY structured contract passed toward a model provider.
 * It is assembled by the backend context engine (Phase I builders, CU-079/080) from
 * deterministic, normalized data — never raw provider payloads. These schemas are the
 * single source of truth: `@primis/ai` and `@primis/api` both import them so the packet
 * shape cannot drift between the builder, the chat endpoint, and the summary jobs.
 *
 * Source of truth (primis_ai_context_engine_spec.md):
 *   - §9.2  AiContextPacket base schema (packetVersion pinned to '1.0', §21.2)
 *   - §9.3  TimeRangeSpec
 *   - §9.4  AiUserProfileContext
 *   - §9.5  RankedGoal / GoalCode
 *   - §9.6  NutritionPhilosophyContext
 *   - §9.7  CoachStyle / §9.8 SummaryStyle
 *   - §9.9  AiSafetyContext
 *   - §9.10 AiDataAvailabilityContext
 *   - §9.11 AiEvidence / AiEvidenceType
 *   - §12   AI output contract (response shape the model must satisfy)
 *   - §21   Versioning (packet 1.0, output schema 1.0)
 *   - V1.1 §25.1 SleepAnalysisContext payload schema
 *
 * Safety (spec §9.1, §19.3, TAD §17.5, ARCH-SEC-AI-002; data-model DATA-PRIN-007):
 *   - No raw provider payloads, OAuth tokens, or raw identifiers.
 *   - No unbounded raw time-series — evidence is compact and bounded.
 *   - No raw sensitive notes by default.
 *   - `userIdHash`, never a raw user id / email.
 * `assertNoRawContent` enforces the deny-list below and is wired into the packet schema.
 *
 * Naming note: the spec calls the profile enums `CoachStyle` / `SummaryStyle` / `GoalCode`.
 * `@primis/api-contracts` already exports differently-valued `CoachStyle` (user.ts) and
 * `GoalCode` (onboarding.ts) for the profile/onboarding surfaces. To avoid collisions on the
 * package barrel while staying faithful to the spec values, the AI-packet variants are
 * exported as `AiCoachStyle` / `AiSummaryStyle` / `AiGoalCode`.
 */

import { z } from 'zod';

import { CONTEXT_DOMAINS, type ContextDomain } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Local calendar date (YYYY-MM-DD). */
const LocalDateSchema = z.string().regex(ISO_DATE, 'must be YYYY-MM-DD');
/** ISO-8601 datetime string. */
const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** Confidence vocabulary shared by evidence, builders, and output. */
export const AiConfidenceSchema = z.enum(['high', 'medium', 'low', 'not_enough_data']);
export type AiConfidence = z.infer<typeof AiConfidenceSchema>;

/** Zod enum for the shared {@link ContextDomain} vocabulary (imported from core-types). */
export const ContextDomainSchema = z.enum(CONTEXT_DOMAINS as [ContextDomain, ...ContextDomain[]]);

/** Wearable / data provider a piece of context originated from. */
export const AiContextProviderSchema = z.enum([
  'google_health',
  'healthkit',
  'health_connect',
  'fitbit_legacy',
  'manual',
  'unknown',
]);
export type AiContextProvider = z.infer<typeof AiContextProviderSchema>;

// ---------------------------------------------------------------------------
// Raw-content guard (spec §9.1, §19.3; TAD ARCH-SEC-AI-002)
// ---------------------------------------------------------------------------

/**
 * Substrings that must never appear as a key anywhere in a context packet.
 * These represent raw provider payloads, secrets, or raw identifiers that the
 * packet is explicitly forbidden from carrying toward a model provider.
 */
const FORBIDDEN_KEY_SUBSTRINGS = [
  // Any nested key mentioning a payload is a raw provider blob (compact packets never carry one).
  'payload',
  'rawresponse',
  'raw_response',
  'rawseries',
  'raw_series',
  'rawtimeseries',
  'raw_time_series',
  'rawsamples',
  'raw_samples',
  'rawnote',
  'raw_note',
  'oauth',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'apikey',
  'api_key',
  'password',
  'macaddress',
  'mac_address',
  'serialnumber',
  'serial_number',
  'deviceserial',
  'provideraccountid',
  'provider_account_id',
  'ssn',
];

/**
 * Maximum length for any array nested inside `payload`. Guards against dumping
 * unbounded raw time-series into the packet (spec §9.1, §10.4).
 */
const MAX_PAYLOAD_ARRAY_LENGTH = 500;

/**
 * Recursively scans an arbitrary value for forbidden keys / unbounded arrays and
 * reports the first violation as a dotted path, or `null` when the value is safe.
 * Used by the packet schema's `superRefine` so unsafe packets fail validation.
 */
export function findRawContentViolation(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    if (value.length > MAX_PAYLOAD_ARRAY_LENGTH) {
      return `${path || 'value'}: array length ${value.length} exceeds ${MAX_PAYLOAD_ARRAY_LENGTH} (unbounded raw time-series not allowed)`;
    }
    for (let i = 0; i < value.length; i += 1) {
      const violation = findRawContentViolation(value[i], `${path}[${i}]`);
      if (violation) return violation;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hit = FORBIDDEN_KEY_SUBSTRINGS.find((f) => normalizedKey.includes(f.replace(/_/g, '')));
      if (hit) {
        return `${path ? `${path}.` : ''}${key}: forbidden key (matches "${hit}")`;
      }
      const violation = findRawContentViolation(child, path ? `${path}.${key}` : key);
      if (violation) return violation;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time range (spec §9.3)
// ---------------------------------------------------------------------------

export const TimeRangeLabelSchema = z.enum([
  'today',
  'yesterday',
  'last_7_days',
  'last_14_days',
  'last_30_days',
  'last_90_days',
  'custom',
  'latest_available',
]);
export type TimeRangeLabel = z.infer<typeof TimeRangeLabelSchema>;

export const TimeRangeSpecSchema = z
  .object({
    label: TimeRangeLabelSchema,
    startDate: LocalDateSchema.optional(),
    endDate: LocalDateSchema.optional(),
    timezone: z.string().min(1),
  })
  .strict();
export type TimeRangeSpec = z.infer<typeof TimeRangeSpecSchema>;

// ---------------------------------------------------------------------------
// User profile (spec §9.4–9.8)
// ---------------------------------------------------------------------------

export const AiGoalCodeSchema = z.enum([
  'athletic_performance',
  'sleep_quality',
  'recovery',
  'fat_loss',
  'muscle_gain',
  'body_composition',
  'longevity',
  'general_health',
  'stress_management',
  'nutrition_quality',
]);
export type AiGoalCode = z.infer<typeof AiGoalCodeSchema>;

export const RankedGoalSchema = z
  .object({
    code: AiGoalCodeSchema,
    rank: z.number().int().min(1),
    active: z.boolean(),
  })
  .strict();
export type RankedGoal = z.infer<typeof RankedGoalSchema>;

export const NutritionPhilosophyContextSchema = z
  .object({
    highProtein: z.boolean(),
    wholeFoodsEmphasis: z.boolean(),
    avoidSeedOils: z.boolean(),
    avoidArtificialDyes: z.boolean(),
    animalProductsPositive: z.boolean(),
    antiInflammatoryEmphasis: z.boolean(),
    processedFoodMinimization: z.boolean(),
    customNotes: z.string().optional(),
  })
  .strict();
export type NutritionPhilosophyContext = z.infer<typeof NutritionPhilosophyContextSchema>;

/** Spec §9.7 CoachStyle — namespaced to avoid collision with user.ts CoachStyle. */
export const AiCoachStyleSchema = z.enum([
  'analyst',
  'performance_coach',
  'strict',
  'encouraging',
  'concise',
  'explanatory',
  'calm',
  'unhinged_lite',
]);
export type AiCoachStyle = z.infer<typeof AiCoachStyleSchema>;

/** Spec §9.8 SummaryStyle. */
export const AiSummaryStyleSchema = z.enum([
  'concise',
  'detailed',
  'data_heavy',
  'plain_english',
  'action_only',
]);
export type AiSummaryStyle = z.infer<typeof AiSummaryStyleSchema>;

/** Unit preferences carried into the packet (spec §9.4 `preferredUnits`). */
export const PreferredUnitsSchema = z
  .object({
    weight: z.enum(['kg', 'lb']),
    distance: z.enum(['km', 'mi']),
    temperature: z.enum(['c', 'f']),
    volume: z.enum(['ml', 'oz']),
    energy: z.enum(['kcal', 'kj']),
  })
  .strict();
export type PreferredUnits = z.infer<typeof PreferredUnitsSchema>;

/** Optional training-preference context (spec §9.4 `trainingPreferences`). */
export const TrainingPreferenceContextSchema = z
  .object({
    primaryModalities: z.array(z.string().min(1)).max(20).optional(),
    trainingDaysPerWeek: z.number().int().min(0).max(14).optional(),
    intensityBias: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  })
  .strict();
export type TrainingPreferenceContext = z.infer<typeof TrainingPreferenceContextSchema>;

/** Optional tracking-preference context (spec §9.4 `trackingPreferences`). */
export const TrackingPreferenceContextSchema = z
  .object({
    tracksNutrition: z.boolean().optional(),
    tracksHydration: z.boolean().optional(),
    tracksCaffeine: z.boolean().optional(),
    tracksAlcohol: z.boolean().optional(),
    tracksBowelMovements: z.boolean().optional(),
    tracksBodyComposition: z.boolean().optional(),
  })
  .strict();
export type TrackingPreferenceContext = z.infer<typeof TrackingPreferenceContextSchema>;

export const AiUserProfileContextSchema = z
  .object({
    /** Coarse age band only — never exact DOB (spec §9.4, §10.2). */
    ageRange: z.string().optional(),
    timezone: z.string().min(1),
    primaryPlatform: z.enum(['ios', 'android', 'unknown']),
    primaryWearableProvider: AiContextProviderSchema.optional(),
    rankedGoals: z.array(RankedGoalSchema).max(20),
    nutritionPhilosophy: NutritionPhilosophyContextSchema.optional(),
    coachStyle: AiCoachStyleSchema,
    summaryStyle: AiSummaryStyleSchema,
    preferredUnits: PreferredUnitsSchema,
    trainingPreferences: TrainingPreferenceContextSchema.optional(),
    trackingPreferences: TrackingPreferenceContextSchema.optional(),
    /** Whether the user has AI processing enabled — mirrors safety context. */
    aiProcessingEnabled: z.boolean().optional(),
  })
  .strict();
export type AiUserProfileContext = z.infer<typeof AiUserProfileContextSchema>;

// ---------------------------------------------------------------------------
// Safety context (spec §9.9)
// ---------------------------------------------------------------------------

export const AiSafetyContextSchema = z
  .object({
    productMode: z.literal('performance_wellness_only'),
    medicalDiagnosisAllowed: z.literal(false),
    emergencyHandlingRequired: z.boolean(),
    userIsMinorKnown: z.boolean().optional(),
    sensitiveDataPolicy: z.enum([
      'minimal_context',
      'standard_context',
      'extended_private_beta_context',
    ]),
    aiProcessingEnabled: z.boolean(),
    publicLaunchPrivacyMode: z
      .enum(['default_ai_enabled_with_controls', 'ai_opt_in_required', 'unknown'])
      .optional(),
  })
  .strict();
export type AiSafetyContext = z.infer<typeof AiSafetyContextSchema>;

// ---------------------------------------------------------------------------
// Data availability (spec §9.10) + explicit per-metric availability states
// ---------------------------------------------------------------------------

/**
 * Availability state for a single metric. Beyond the spec's fresh/stale split this
 * models the full set the context engine must represent so the AI never claims an
 * unavailable or provisional metric is measured (CU-078 requirement; data-model §5.4,
 * google-health-api-metric-availability.md):
 *   - `missing`              — not present for the requested range
 *   - `stale`                — present but past its freshness window
 *   - `provisional`          — present but not yet finalized (e.g. stages still processing)
 *   - `unverified`           — provider supplied it but accuracy is not validated
 *   - `provider_unavailable` — the provider does not expose this metric at all
 *   - `available`            — fresh and usable
 */
export const AiMetricAvailabilityStateSchema = z.enum([
  'available',
  'missing',
  'stale',
  'provisional',
  'unverified',
  'provider_unavailable',
]);
export type AiMetricAvailabilityState = z.infer<typeof AiMetricAvailabilityStateSchema>;

export const AiMetricAvailabilitySchema = z
  .object({
    metricCode: z.string().min(1),
    state: AiMetricAvailabilityStateSchema,
    provider: AiContextProviderSchema.optional(),
    /** Short human-readable caveat, e.g. "stages still processing". */
    note: z.string().optional(),
  })
  .strict();
export type AiMetricAvailability = z.infer<typeof AiMetricAvailabilitySchema>;

export const ProviderConnectionSummarySchema = z
  .object({
    provider: AiContextProviderSchema,
    status: z.enum(['connected', 'disconnected', 'expired', 'error', 'never_connected']),
    lastSyncAt: IsoDateTimeSchema.optional(),
    syncAgeMinutes: z.number().int().min(0).optional(),
  })
  .strict();
export type ProviderConnectionSummary = z.infer<typeof ProviderConnectionSummarySchema>;

export const AiDataAvailabilityContextSchema = z
  .object({
    providerConnections: z.array(ProviderConnectionSummarySchema).max(10),
    availableMetricCodes: z.array(z.string().min(1)).max(200),
    unavailableMetricCodes: z.array(z.string().min(1)).max(200),
    staleMetricCodes: z.array(z.string().min(1)).max(200),
    /** Rich per-metric availability incl. provisional / unverified / provider_unavailable. */
    metricAvailability: z.array(AiMetricAvailabilitySchema).max(200),
    latestSyncAt: IsoDateTimeSchema.optional(),
    dataFreshnessStatus: z.enum(['fresh', 'stale', 'partial', 'unavailable']),
    /** Partial map: history depth in days per domain that has any history. */
    historyDepthDaysByDomain: z.record(ContextDomainSchema, z.number().int().min(0)),
    limitations: z.array(z.string()).max(50),
  })
  .strict();
export type AiDataAvailabilityContext = z.infer<typeof AiDataAvailabilityContextSchema>;

// ---------------------------------------------------------------------------
// Evidence (spec §9.11)
// ---------------------------------------------------------------------------

export const AiEvidenceTypeSchema = z.enum([
  'score_snapshot',
  'score_component',
  'metric_value',
  'metric_deviation',
  'trend',
  'correlation',
  'manual_input',
  'provider_availability',
  'sleep_session',
  'workout_session',
  'nutrition_summary',
  'body_composition_measurement',
  'bedtime_recommendation',
  'insight_candidate',
  'custom_tag',
]);
export type AiEvidenceType = z.infer<typeof AiEvidenceTypeSchema>;

export const AiEvidenceSourceSchema = z.enum([
  'deterministic_engine',
  'normalized_metric',
  'manual_input',
  'provider',
  'ai_prior_summary',
]);
export type AiEvidenceSource = z.infer<typeof AiEvidenceSourceSchema>;

/** A scalar evidence value — typed scalars only, never a raw blob (spec safety bar). */
export const AiEvidenceValueSchema = z.union([z.number(), z.string(), z.boolean()]);

export const AiEvidenceSchema = z
  .object({
    id: z.string().min(1),
    type: AiEvidenceTypeSchema,
    domain: ContextDomainSchema,
    /** Compact human-readable statement — the model cites this, not raw data. */
    statement: z.string().min(1).max(500),
    metricCode: z.string().min(1).optional(),
    value: AiEvidenceValueSchema.optional(),
    unit: z.string().optional(),
    baseline: z.union([z.number(), z.string()]).optional(),
    delta: z.union([z.number(), z.string()]).optional(),
    direction: z.enum(['up', 'down', 'stable', 'mixed', 'unknown']).optional(),
    confidence: AiConfidenceSchema,
    source: AiEvidenceSourceSchema,
    observedAt: IsoDateTimeSchema.optional(),
    rangeStart: LocalDateSchema.optional(),
    rangeEnd: LocalDateSchema.optional(),
  })
  .strict();
export type AiEvidence = z.infer<typeof AiEvidenceSchema>;

// ---------------------------------------------------------------------------
// Output contract (spec §12, §21.3) — what the model must return
// ---------------------------------------------------------------------------

export const AiOutputResponseTypeSchema = z.enum([
  'chat_answer',
  'daily_summary',
  'sleep_summary',
  'recovery_summary',
  'weekly_review',
  'monthly_review',
  'bedtime_plan',
  'training_recommendation',
  'nutrition_summary',
  'safe_response',
]);
export type AiOutputResponseType = z.infer<typeof AiOutputResponseTypeSchema>;

export const AiOutputSectionSchema = z.enum([
  'title',
  'summary',
  'answer',
  'recommendation',
  'evidence_used',
  'caveats',
  'follow_up_questions',
  'ui_cards',
  'confidence',
  'safety_flags',
]);
export type AiOutputSection = z.infer<typeof AiOutputSectionSchema>;

/**
 * Declares the structured response shape the composer requires from the model.
 * Versioned independently of the packet (spec §21.3, response schema starts at 1.0).
 */
export const AiOutputContractSchema = z
  .object({
    responseSchemaVersion: z.literal('1.0'),
    responseType: AiOutputResponseTypeSchema,
    format: z.enum(['structured_json', 'prose_with_metadata']),
    requiredSections: z.array(AiOutputSectionSchema).min(1),
    allowRecommendation: z.boolean(),
    requireEvidenceCitations: z.boolean(),
    requireCaveatsForLowConfidence: z.boolean(),
    maxRecommendations: z.number().int().min(0).max(10).optional(),
    maxFollowUpQuestions: z.number().int().min(0).max(10).optional(),
    maxUiCards: z.number().int().min(0).max(10).optional(),
    /** Tone the phrasing should adopt — phrasing only, never recommendation logic. */
    toneStyle: AiCoachStyleSchema.optional(),
  })
  .strict();
export type AiOutputContract = z.infer<typeof AiOutputContractSchema>;

// ---------------------------------------------------------------------------
// Sleep analysis payload (V1.1 §25.1)
// ---------------------------------------------------------------------------

const ScoreSummaryContextSchema = z
  .object({
    value: z.number().min(0).max(100).nullable(),
    state: z.string().min(1),
    confidence: AiConfidenceSchema,
    provisionalReason: z.string().optional(),
  })
  .strict();

export const SleepAnalysisContextSchema = z
  .object({
    sleepSessionId: z.string().min(1),
    localSleepDate: LocalDateSchema,
    provider: AiContextProviderSchema,
    providerSleepType: z.enum(['STAGES', 'CLASSIC', 'UNKNOWN']).optional(),
    providerProcessed: z.boolean().optional(),
    providerStagesStatus: z.string().optional(),
    wasNap: z.boolean().optional(),
    manuallyEdited: z.boolean().optional(),
    sleepScore: ScoreSummaryContextSchema.optional(),
    duration: z
      .object({
        minutesInSleepPeriod: z.number().min(0).optional(),
        minutesAsleep: z.number().min(0).optional(),
        minutesAwake: z.number().min(0).optional(),
        sleepEfficiencyPct: z.number().min(0).max(100).optional(),
        minutesToFallAsleep: z.number().min(0).optional(),
        minutesAfterWakeUp: z.number().min(0).optional(),
      })
      .strict(),
    stages: z
      .array(
        z
          .object({
            stageType: z.enum(['awake', 'light', 'deep', 'rem', 'asleep', 'restless', 'unknown']),
            minutes: z.number().min(0),
            segmentCount: z.number().int().min(0),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    schedule: z
      .object({
        bedtimeLocal: z.string().optional(),
        wakeTimeLocal: z.string().optional(),
        bedtimeDeviationMinutes: z.number().optional(),
        wakeDeviationMinutes: z.number().optional(),
        consistencyScore: z.number().optional(),
      })
      .strict()
      .optional(),
    recoverySignals: z
      .object({
        dailyHrvMs: z.number().optional(),
        deepSleepRmssdMs: z.number().optional(),
        nonRemHeartRateBpm: z.number().optional(),
        restingHeartRateBpm: z.number().optional(),
        respiratoryRate: z.number().optional(),
        oxygenSaturationPct: z.number().optional(),
        sleepTemperatureDerivationC: z.number().optional(),
        baselineComparisons: z.array(AiEvidenceSchema).max(50),
      })
      .strict()
      .optional(),
    sleepDebt: z
      .object({
        hours: z.number(),
        trend: z.enum(['improving', 'worsening', 'stable', 'unknown']),
      })
      .strict()
      .optional(),
    chartAvailable: z.boolean(),
    missingData: z.array(z.string().min(1)).max(50),
    evidence: z.array(AiEvidenceSchema).max(50),
  })
  .strict();
export type SleepAnalysisContext = z.infer<typeof SleepAnalysisContextSchema>;

// ---------------------------------------------------------------------------
// Base context packet (spec §9.2, §21.2)
// ---------------------------------------------------------------------------

/** AI intent enum re-derived locally to keep aiContext self-contained on the Zod side. */
export const AiIntentSchema = z.enum([
  'daily_status',
  'sleep_analysis',
  'recovery_analysis',
  'training_recommendation',
  'workout_summary',
  'activity_trend',
  'nutrition_coaching',
  'hydration_caffeine_alcohol',
  'body_composition_analysis',
  'gut_digestion_analysis',
  'bedtime_planning',
  'weekly_review',
  'monthly_review',
  'metric_explanation',
  'correlation_query',
  'data_availability_question',
  'app_help',
  'general_health_education',
  'unsupported_medical_request',
  'unknown',
]);

/**
 * `userIdHash` must be an opaque, non-reversible hash — never a raw id/email/UUID
 * (spec §19.3; produced by `hashUserId` which emits SHA-256 hex).
 */
const UserIdHashSchema = z
  .string()
  .min(16)
  .refine((v) => !v.includes('@'), 'userIdHash must not be a raw email')
  .refine((v) => !UUID_LIKE.test(v), 'userIdHash must not be a raw UUID identifier');

export const AiContextPacketSchema = z
  .object({
    packetVersion: z.literal('1.0'),
    packetId: z.string().min(1),
    userIdHash: UserIdHashSchema,
    requestId: z.string().min(1),
    createdAt: IsoDateTimeSchema,
    product: z.literal('Primis'),
    environment: z.enum(['dev', 'staging', 'prod']),
    intent: AiIntentSchema,
    timeRange: TimeRangeSpecSchema,
    userProfile: AiUserProfileContextSchema,
    safety: AiSafetyContextSchema,
    dataAvailability: AiDataAvailabilityContextSchema,
    contextDomains: z.array(ContextDomainSchema).max(30),
    evidence: z.array(AiEvidenceSchema).max(200),
    /** Domain-keyed compact payload. Open-shaped but scanned for raw content. */
    payload: z.record(z.string(), z.unknown()),
    outputContract: AiOutputContractSchema,
  })
  .strict()
  .superRefine((packet, ctx) => {
    const violation = findRawContentViolation(packet.payload, 'payload');
    if (violation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `packet contains forbidden raw content — ${violation}`,
        path: ['payload'],
      });
    }
  });
export type AiContextPacket = z.infer<typeof AiContextPacketSchema>;

/** Current context packet version. Breaking changes require a bump (spec §21.2). */
export const AI_CONTEXT_PACKET_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// Representative fixtures (valid packets for tests + downstream builders)
// ---------------------------------------------------------------------------

/** A minimal, valid training-recommendation packet (spec §11.1). */
export const AI_CONTEXT_PACKET_FIXTURE: AiContextPacket = {
  packetVersion: '1.0',
  packetId: 'ctx_2b7f4c1a',
  userIdHash: 'a'.repeat(64),
  requestId: 'req_9f3c21',
  createdAt: '2026-06-02T13:04:00.000Z',
  product: 'Primis',
  environment: 'dev',
  intent: 'training_recommendation',
  timeRange: { label: 'today', timezone: 'America/New_York' },
  userProfile: {
    timezone: 'America/New_York',
    primaryPlatform: 'ios',
    primaryWearableProvider: 'google_health',
    rankedGoals: [
      { code: 'athletic_performance', rank: 1, active: true },
      { code: 'sleep_quality', rank: 2, active: true },
    ],
    coachStyle: 'performance_coach',
    summaryStyle: 'concise',
    preferredUnits: {
      weight: 'lb',
      distance: 'mi',
      temperature: 'f',
      volume: 'oz',
      energy: 'kcal',
    },
    aiProcessingEnabled: true,
  },
  safety: {
    productMode: 'performance_wellness_only',
    medicalDiagnosisAllowed: false,
    emergencyHandlingRequired: false,
    sensitiveDataPolicy: 'standard_context',
    aiProcessingEnabled: true,
    publicLaunchPrivacyMode: 'default_ai_enabled_with_controls',
  },
  dataAvailability: {
    providerConnections: [
      {
        provider: 'google_health',
        status: 'connected',
        lastSyncAt: '2026-06-02T11:50:00.000Z',
        syncAgeMinutes: 74,
      },
    ],
    availableMetricCodes: ['recovery_score', 'sleep_score', 'hrv_rmssd'],
    unavailableMetricCodes: ['spo2'],
    staleMetricCodes: [],
    metricAvailability: [
      { metricCode: 'recovery_score', state: 'available', provider: 'google_health' },
      {
        metricCode: 'spo2',
        state: 'provider_unavailable',
        provider: 'google_health',
        note: 'Not exposed by this provider.',
      },
    ],
    latestSyncAt: '2026-06-02T11:50:00.000Z',
    dataFreshnessStatus: 'fresh',
    historyDepthDaysByDomain: { recovery: 90, sleep: 90 },
    limitations: [],
  },
  contextDomains: ['recovery', 'sleep', 'training', 'baselines'],
  evidence: [
    {
      id: 'ev_recovery_today',
      type: 'score_snapshot',
      domain: 'recovery',
      statement: 'Recovery Score is 68, which is moderate.',
      metricCode: 'recovery_score',
      value: 68,
      confidence: 'medium',
      source: 'deterministic_engine',
    },
    {
      id: 'ev_hrv_baseline',
      type: 'metric_deviation',
      domain: 'baselines',
      statement: 'HRV is 12% below the 30-day baseline.',
      metricCode: 'hrv_rmssd',
      baseline: '30_day',
      delta: '-12%',
      direction: 'down',
      confidence: 'medium',
      source: 'deterministic_engine',
    },
  ],
  payload: {
    recovery: {
      latestScores: { recovery: 68, sleep: 74, trainingReadiness: 63 },
      deterministicRecommendationBand: 'moderate_training',
    },
  },
  outputContract: {
    responseSchemaVersion: '1.0',
    responseType: 'training_recommendation',
    format: 'structured_json',
    requiredSections: ['title', 'summary', 'answer', 'evidence_used', 'caveats', 'confidence'],
    allowRecommendation: true,
    requireEvidenceCitations: true,
    requireCaveatsForLowConfidence: true,
    maxRecommendations: 1,
    maxFollowUpQuestions: 2,
    maxUiCards: 3,
    toneStyle: 'performance_coach',
  },
};

/** A representative, valid {@link SleepAnalysisContext} payload (V1.1 §25.1). */
export const SLEEP_ANALYSIS_CONTEXT_FIXTURE: SleepAnalysisContext = {
  sleepSessionId: 'sleep_2026-06-02',
  localSleepDate: '2026-06-02',
  provider: 'google_health',
  providerSleepType: 'STAGES',
  providerProcessed: true,
  sleepScore: { value: 81, state: 'available', confidence: 'high' },
  duration: {
    minutesInSleepPeriod: 452,
    minutesAsleep: 398,
    minutesAwake: 34,
    sleepEfficiencyPct: 88,
    minutesToFallAsleep: 18,
  },
  stages: [
    { stageType: 'deep', minutes: 82, segmentCount: 4 },
    { stageType: 'rem', minutes: 96, segmentCount: 5 },
    { stageType: 'light', minutes: 220, segmentCount: 9 },
    { stageType: 'awake', minutes: 34, segmentCount: 6 },
  ],
  sleepDebt: { hours: 0.8, trend: 'stable' },
  chartAvailable: true,
  missingData: [],
  evidence: [
    {
      id: 'ev_sleep_score',
      type: 'score_snapshot',
      domain: 'sleep',
      statement: 'Sleep Score is 81, which is good.',
      metricCode: 'sleep_score',
      value: 81,
      confidence: 'high',
      source: 'deterministic_engine',
    },
    {
      id: 'ev_sleep_efficiency',
      type: 'metric_value',
      domain: 'sleep',
      statement: 'Sleep efficiency was 88%.',
      metricCode: 'sleep_efficiency',
      value: 88,
      unit: '%',
      confidence: 'high',
      source: 'deterministic_engine',
    },
  ],
};
