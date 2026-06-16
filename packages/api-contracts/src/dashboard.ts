/**
 * Home dashboard summary DTOs for @primis/api-contracts.
 *
 * CU-056 — Dashboard summary API endpoints (Phase F).
 *
 * Defines the response shape served by `GET /v1/dashboard/today`. The backend
 * (services/api) assembles this object from PRE-COMPUTED rows only —
 * `score_snapshots`, `insight_candidates`, `dashboard_widgets`, and
 * `provider_connections`. No scoring math happens in the request path.
 *
 * Score values reuse the canonical {@link ScoreSnapshotDto} (the spec §29.1
 * `ScoreSummary`) and {@link ProviderFreshnessDto} from this package rather than
 * forking parallel shapes. Mobile (Phase G) renders this contract directly.
 *
 * Source of truth:
 *   - TodayDashboardResponse field list: Scoring Spec §29.1
 *   - ScoreSnapshotDto / ProviderFreshnessDto: @primis/api-contracts (CU-012)
 *   - InsightCard fields (safe subset): data model §17.1 `insight_candidates`
 *   - DashboardWidget order: data model §19.1 `dashboard_widgets`
 *   - Route path alignment (mobile stub `/v1/dashboard` → `/v1/dashboard/today`):
 *     docs/decisions/ADR-005-dashboard-endpoint-shape.md
 *
 * Safety: this contract intentionally OMITS raw provider payloads, secret refs,
 * `structured_summary`/`natural_language_summary` insight internals, and any
 * S3/token metadata. Only display-safe, already-computed fields are exposed.
 */

import { z } from 'zod';

import { ScoreSnapshotDtoSchema, ScoreTypeDtoSchema, type ScoreSnapshotDto } from './scores.js';
import {
  ProviderFreshnessDtoSchema,
  ScoreStateDtoSchema,
  type ProviderFreshnessDto,
} from './dataQuality.js';
import { SCORE_BANDS, type ScoreBand } from '@primis/core-types';

// Re-export the reused score/provider DTOs so dashboard consumers can import
// everything they need from this module.
export type { ScoreSnapshotDto } from './scores.js';
export type { ProviderFreshnessDto } from './dataQuality.js';

const ScoreBandDtoSchema = z.enum(SCORE_BANDS as [ScoreBand, ...ScoreBand[]]);

// ---------------------------------------------------------------------------
// InsightCardDto
// ---------------------------------------------------------------------------

/** Allowed insight severities (data model §17.1 CHECK). */
export const INSIGHT_SEVERITIES = ['info', 'positive', 'warning', 'critical_nonmedical'] as const;

/** Severity of a deterministic insight surfaced on the dashboard. */
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export const InsightSeveritySchema = z.enum(INSIGHT_SEVERITIES);

/**
 * A deterministic, display-safe insight card for the Home dashboard.
 *
 * Sourced from an `insight_candidates` row. Only the headline/actionable fields
 * are exposed — never `structured_summary`, AI copy, or free-form metadata.
 */
export interface InsightCardDto {
  /** Stable id of the underlying insight candidate. */
  readonly id: string;
  /** Insight category, e.g. `'recovery_driver'`, `'sleep_pattern'`. */
  readonly insightType: string;
  /** Short headline shown on the card. */
  readonly title: string;
  /** Severity tier (drives card color/emphasis). */
  readonly severity: InsightSeverity;
  /** Local date this insight applies to (YYYY-MM-DD); null for range insights. */
  readonly localDate: string | null;
  /** Optional performance-only recommended action; null when none applies. */
  readonly recommendedAction: string | null;
  /** Canonical metric codes referenced by this insight. */
  readonly relatedMetricCodes: string[];
  /** ISO 8601 UTC timestamp when the insight was generated. */
  readonly generatedAt: string;
}

/** Zod schema for {@link InsightCardDto}. */
export const InsightCardDtoSchema = z.object({
  id: z.string().min(1),
  insightType: z.string().min(1),
  title: z.string().min(1),
  severity: InsightSeveritySchema,
  localDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD')
    .nullable(),
  recommendedAction: z.string().nullable(),
  relatedMetricCodes: z.array(z.string()),
  generatedAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// RecommendationCardDto
// ---------------------------------------------------------------------------

/**
 * An actionable recommendation card. Derived from insight candidates that carry
 * a performance-only `recommended_action`.
 */
export interface RecommendationCardDto {
  /** Stable id of the underlying insight candidate. */
  readonly id: string;
  /** Short headline for the recommendation. */
  readonly title: string;
  /** Performance-only action text (never medical/diagnostic). */
  readonly action: string;
  /** Severity tier inherited from the source insight. */
  readonly severity: InsightSeverity;
  /** ISO 8601 UTC timestamp when the recommendation was generated. */
  readonly generatedAt: string;
}

/** Zod schema for {@link RecommendationCardDto}. */
export const RecommendationCardDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  action: z.string().min(1),
  severity: InsightSeveritySchema,
  generatedAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// DashboardWidgetSummaryDto
// ---------------------------------------------------------------------------

/**
 * Ordered widget descriptor for the Home dashboard layout. Mirrors a
 * `dashboard_widgets` row (data model §19.1) without exposing free-form config.
 */
export interface DashboardWidgetSummaryDto {
  /** Widget type identifier, e.g. `'recovery_score'`, `'bedtime_planner'`. */
  readonly widgetType: string;
  /** Position in the ordered widget list (ascending). */
  readonly displayOrder: number;
  /** Whether this widget is shown. Hidden widgets keep their order slot. */
  readonly isVisible: boolean;
  /** Display size: `'small' | 'medium' | 'large'`. */
  readonly size: string;
}

/** Zod schema for {@link DashboardWidgetSummaryDto}. */
export const DashboardWidgetSummaryDtoSchema = z.object({
  widgetType: z.string().min(1),
  displayOrder: z.number().int(),
  isVisible: z.boolean(),
  size: z.string().min(1),
});

// ---------------------------------------------------------------------------
// BedtimeWidgetSummaryDto
// ---------------------------------------------------------------------------

/**
 * Compact bedtime widget summary for the Home dashboard.
 *
 * Populated from a precomputed bedtime snapshot when one exists; omitted from
 * the response otherwise (no fabricated precision). Full bedtime planning is a
 * separate endpoint (Scoring Spec §29.3) and is out of scope for CU-056.
 */
export interface BedtimeWidgetSummaryDto {
  /** Local date this bedtime summary applies to (YYYY-MM-DD). */
  readonly localDate: string;
  /** Lifecycle/availability state of the bedtime snapshot. */
  readonly state: ScoreSnapshotDto['state'];
  /** Bedtime adherence value 0–100; null when not scorable. */
  readonly score: number | null;
  /** Qualitative band; null whenever `score` is null. */
  readonly band: ScoreBand | null;
}

/** Zod schema for {@link BedtimeWidgetSummaryDto}. */
export const BedtimeWidgetSummaryDtoSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  state: ScoreStateDtoSchema,
  score: z.number().min(0).max(100).nullable(),
  band: ScoreBandDtoSchema.nullable(),
});

// ---------------------------------------------------------------------------
// DashboardScoresDto
// ---------------------------------------------------------------------------

/**
 * Per-type score summaries keyed by dashboard slot (Scoring Spec §29.1).
 *
 * Each value is a full {@link ScoreSnapshotDto}. A key is OMITTED when no
 * snapshot exists for that score type on the resolved date — the mobile app
 * renders a "not yet available / learning" placeholder for absent keys.
 */
export interface DashboardScoresDto {
  readonly sleep?: ScoreSnapshotDto;
  readonly recovery?: ScoreSnapshotDto;
  readonly trainingReadiness?: ScoreSnapshotDto;
  readonly activity?: ScoreSnapshotDto;
  readonly nutrition?: ScoreSnapshotDto;
  readonly wellbeing?: ScoreSnapshotDto;
}

/** Zod schema for {@link DashboardScoresDto}. */
export const DashboardScoresDtoSchema = z.object({
  sleep: ScoreSnapshotDtoSchema.optional(),
  recovery: ScoreSnapshotDtoSchema.optional(),
  trainingReadiness: ScoreSnapshotDtoSchema.optional(),
  activity: ScoreSnapshotDtoSchema.optional(),
  nutrition: ScoreSnapshotDtoSchema.optional(),
  wellbeing: ScoreSnapshotDtoSchema.optional(),
});

// ---------------------------------------------------------------------------
// TodayDashboardResponseDto
// ---------------------------------------------------------------------------

/**
 * Response body for `GET /v1/dashboard/today` (Scoring Spec §29.1).
 *
 * All fields are assembled from precomputed rows. `scores`, `topInsights`,
 * `recommendations`, `providerSyncStatus`, and `widgets` reflect the latest
 * persisted state for `localDate`; nothing here is computed at request time.
 */
export interface TodayDashboardResponseDto {
  /** Local calendar date (user timezone) this dashboard represents (YYYY-MM-DD). */
  readonly localDate: string;
  /**
   * ISO 8601 UTC timestamp of the most recent successful provider sync across
   * all of the user's connections; null when no successful sync has occurred.
   */
  readonly lastSyncedAt: string | null;
  /** Per-type score summaries; absent keys mean "no snapshot for this date". */
  readonly scores: DashboardScoresDto;
  /** Top deterministic insight cards (already ranked, display-safe). */
  readonly topInsights: InsightCardDto[];
  /** Actionable recommendation cards derived from insight candidates. */
  readonly recommendations: RecommendationCardDto[];
  /** Per-connection provider sync freshness for the stale-data banner. */
  readonly providerSyncStatus: ProviderFreshnessDto[];
  /** Ordered Home dashboard widget layout for this user. */
  readonly widgets: DashboardWidgetSummaryDto[];
  /** Optional compact bedtime widget; omitted when no bedtime snapshot exists. */
  readonly bedtimeWidget?: BedtimeWidgetSummaryDto;
}

/** Zod schema for {@link TodayDashboardResponseDto}. */
export const TodayDashboardResponseDtoSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  lastSyncedAt: z.string().nullable(),
  scores: DashboardScoresDtoSchema,
  topInsights: z.array(InsightCardDtoSchema),
  recommendations: z.array(RecommendationCardDtoSchema),
  providerSyncStatus: z.array(ProviderFreshnessDtoSchema),
  widgets: z.array(DashboardWidgetSummaryDtoSchema),
  bedtimeWidget: BedtimeWidgetSummaryDtoSchema.optional(),
});

// ---------------------------------------------------------------------------
// Score-type query helper (mobile + tests)
// ---------------------------------------------------------------------------

/**
 * The dashboard score slots in `DashboardScoresDto`, in display order.
 * Each maps 1:1 to a `@primis/core-types` ScoreType (validated by
 * {@link ScoreTypeDtoSchema} at the call sites that need it).
 */
export const DASHBOARD_SCORE_SLOTS = [
  'sleep',
  'recovery',
  'trainingReadiness',
  'activity',
  'nutrition',
  'wellbeing',
] as const satisfies readonly (keyof DashboardScoresDto)[];

// Touch ScoreTypeDtoSchema so the import is part of the public contract surface
// (consumers validating score types reuse it from this module).
export { ScoreTypeDtoSchema };

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/**
 * Valid {@link TodayDashboardResponseDto} fixture for use in unit tests.
 *
 * Mirrors a normal day: sleep + recovery snapshots present, one insight, one
 * recommendation, one fresh provider, and an ordered three-widget layout.
 */
export const TODAY_DASHBOARD_FIXTURE: TodayDashboardResponseDto = {
  localDate: '2026-06-15',
  lastSyncedAt: '2026-06-15T07:30:00Z',
  scores: {
    sleep: {
      scoreType: 'sleep',
      value: 78,
      band: 'good',
      state: 'available',
      confidence: 'high',
      localDate: '2026-06-15',
      algorithmVersion: 'sleep_score_v1_0',
      components: [],
      missingMetrics: [],
      topDrivers: [
        {
          key: 'deep_sleep_duration',
          displayLabel: 'Deep Sleep',
          direction: 'positive',
          magnitude: 'major',
        },
      ],
      qualityMetadata: {
        scoreState: 'available',
        confidence: 'high',
        dataQualityScore: 90,
        completenessRatio: 0.9,
        missingRequiredMetrics: [],
        missingOptionalMetrics: [],
        staleProviderConnections: [],
        baselineStatus: 'ready',
      },
    },
  },
  topInsights: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      insightType: 'recovery_driver',
      title: 'HRV above your recent baseline',
      severity: 'positive',
      localDate: '2026-06-15',
      recommendedAction: null,
      relatedMetricCodes: ['hrv_rmssd'],
      generatedAt: '2026-06-15T07:35:00Z',
    },
  ],
  recommendations: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'You appear suited for moderate training',
      action: 'Consider a moderate session today.',
      severity: 'info',
      generatedAt: '2026-06-15T07:35:00Z',
    },
  ],
  providerSyncStatus: [
    {
      providerCode: 'healthkit',
      lastSyncAt: '2026-06-15T07:30:00Z',
      hoursSinceLastSync: 0.5,
      recencyScore: 100,
      isStale: false,
    },
  ],
  widgets: [
    { widgetType: 'recovery_score', displayOrder: 0, isVisible: true, size: 'large' },
    { widgetType: 'sleep_score', displayOrder: 1, isVisible: true, size: 'medium' },
    { widgetType: 'bedtime_planner', displayOrder: 2, isVisible: true, size: 'medium' },
  ],
};
